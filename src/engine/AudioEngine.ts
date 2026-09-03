import type { Track, DspState, CurveType } from "../types";
import { dbToGain, clamp } from "../lib/util";
import { detectSilence } from "../lib/analysis";
import { renderDemoTrack } from "../lib/demo";

export const EQ_BANDS = [31, 63, 87, 125, 175, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600, 8000, 11200, 16000];

interface Deck {
  track: Track;
  buffer: AudioBuffer;
  src: AudioBufferSourceNode | null;
  fade: GainNode;
  trackGain: GainNode; // replaygain + trim + peak norm
  startCtx: number; // ctx time when src started
  offset: number; // buffer-seconds position at startCtx (absolute within buffer)
  start: number; // effective start in buffer (cue/silence)
  end: number; // effective end in buffer
  rate: number;
  ended: boolean;
}

export interface Transition { active: boolean; progress: number; from: string; to: string; curve: CurveType; seconds: number }

type Listener = () => void;

function curveValues(type: CurveType, n: number, fadeIn: boolean): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const t = fadeIn ? x : 1 - x;
    let v: number;
    switch (type) {
      case "equalPower": v = Math.sin((t * Math.PI) / 2); break;
      case "sCurve": v = t * t * (3 - 2 * t); break;
      case "logarithmic": v = Math.log10(1 + 9 * t); break;
      default: v = t;
    }
    out[i] = Math.max(0.0001, v);
  }
  return out;
}

export class AudioEngine {
  ctx!: AudioContext;
  // graph
  private input!: GainNode;
  private vrIn!: GainNode; private vrOut!: GainNode;
  private bass!: BiquadFilterNode;
  private loudShelf!: BiquadFilterNode;
  eq: BiquadFilterNode[] = [];
  private eqPre!: GainNode;
  private fxSum!: GainNode;
  private echoDelay!: DelayNode; private echoFb!: GainNode; private echoWet!: GainNode;
  private reverb!: ConvolverNode; private reverbWet!: GainNode;
  private flDelay!: DelayNode; private flWet!: GainNode; private flLfo!: OscillatorNode; private flDepth!: GainNode;
  private chDelay!: DelayNode; private chWet!: GainNode; private chLfo!: OscillatorNode; private chDepth!: GainNode;
  private wLL!: GainNode; private wLR!: GainNode; private wRL!: GainNode; private wRR!: GainNode;
  private dspOut!: GainNode;
  private preamp!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private limBypass!: GainNode;
  private balance!: StereoPannerNode;
  private volume!: GainNode;
  analyser!: AnalyserNode;
  private dspEnabled = true; private voiceOn = false;

  // decks
  private current: Deck | null = null;
  private next: Deck | null = null;
  private nextTrackRequested: Track | null = null;
  private paused = true;
  private pausePos = 0;
  private dsp!: DspState;
  private vol = 0.8;
  transition: Transition = { active: false, progress: 0, from: "", to: "", curve: "equalPower", seconds: 0 };
  private tickTimer: number | null = null;
  private listeners = new Set<Listener>();
  onAdvance: ((track: Track) => void) | null = null; // engine auto-advanced to next
  onEnd: (() => void) | null = null; // nothing queued, playback stopped
  onStatus: ((msg: string) => void) | null = null;
  bufferCache = new Map<string, AudioBuffer>();
  outputInfo = { sampleRate: 0, latency: 0, sink: "default" };
  matchSourceRate = false;

  constructor(dsp: DspState) {
    this.dsp = dsp;
    this.buildContext();
  }

  // ---------- graph ----------
  private buildContext(sampleRate?: number) {
    const opts: AudioContextOptions = { latencyHint: "playback" };
    if (sampleRate) opts.sampleRate = sampleRate;
    try { this.ctx = new AudioContext(opts); } catch { this.ctx = new AudioContext({ latencyHint: "playback" }); }
    const c = this.ctx;
    this.input = c.createGain();
    // voice remover (L-R)
    this.vrIn = c.createGain(); this.vrOut = c.createGain();
    const sp = c.createChannelSplitter(2), mg = c.createChannelMerger(2);
    const inv = c.createGain(); inv.gain.value = -1;
    this.vrIn.connect(sp);
    sp.connect(mg, 0, 0); sp.connect(inv, 1); inv.connect(mg, 0, 0);
    sp.connect(mg, 0, 1); inv.connect(mg, 0, 1);
    mg.connect(this.vrOut);
    // tone
    this.bass = c.createBiquadFilter(); this.bass.type = "lowshelf"; this.bass.frequency.value = 110;
    this.loudShelf = c.createBiquadFilter(); this.loudShelf.type = "lowshelf"; this.loudShelf.frequency.value = 150;
    this.eqPre = c.createGain();
    this.eq = EQ_BANDS.map((f) => { const b = c.createBiquadFilter(); b.type = "peaking"; b.frequency.value = f; b.Q.value = 2.2; return b; });
    // fx
    this.fxSum = c.createGain();
    this.echoDelay = c.createDelay(2); this.echoDelay.delayTime.value = 0.32; this.echoFb = c.createGain(); this.echoFb.gain.value = 0.42; this.echoWet = c.createGain();
    this.reverb = c.createConvolver(); this.reverb.buffer = this.makeImpulse(2.2, 2.6); this.reverbWet = c.createGain();
    this.flDelay = c.createDelay(0.05); this.flDelay.delayTime.value = 0.004; this.flWet = c.createGain();
    this.flLfo = c.createOscillator(); this.flLfo.frequency.value = 0.3; this.flDepth = c.createGain(); this.flDepth.gain.value = 0.0025;
    this.flLfo.connect(this.flDepth).connect(this.flDelay.delayTime); this.flLfo.start();
    this.chDelay = c.createDelay(0.1); this.chDelay.delayTime.value = 0.022; this.chWet = c.createGain();
    this.chLfo = c.createOscillator(); this.chLfo.frequency.value = 1.3; this.chDepth = c.createGain(); this.chDepth.gain.value = 0.004;
    this.chLfo.connect(this.chDepth).connect(this.chDelay.delayTime); this.chLfo.start();
    // width matrix
    const wsp = c.createChannelSplitter(2), wmg = c.createChannelMerger(2);
    this.wLL = c.createGain(); this.wLR = c.createGain(); this.wRL = c.createGain(); this.wRR = c.createGain(); 
    this.dspOut = c.createGain();
    this.preamp = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -1; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.06;
    this.limBypass = c.createGain();
    this.balance = c.createStereoPanner();
    this.volume = c.createGain();
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.82;

    // wiring: input -> [vr] -> bass -> loud -> eqPre -> eq... -> fxSum(dry) + fx -> width -> dspOut -> preamp -> limiter -> balance -> volume -> analyser -> dest
    let node: AudioNode = this.bass;
    this.bass.connect(this.loudShelf); this.loudShelf.connect(this.eqPre);
    node = this.eqPre;
    for (const b of this.eq) { node.connect(b); node = b; }
    const eqOut = node;
    eqOut.connect(this.fxSum);
    eqOut.connect(this.echoDelay); this.echoDelay.connect(this.echoFb); this.echoFb.connect(this.echoDelay); this.echoDelay.connect(this.echoWet); this.echoWet.connect(this.fxSum);
    eqOut.connect(this.reverb); this.reverb.connect(this.reverbWet); this.reverbWet.connect(this.fxSum);
    eqOut.connect(this.flDelay); this.flDelay.connect(this.flWet); this.flWet.connect(this.fxSum);
    eqOut.connect(this.chDelay); this.chDelay.connect(this.chWet); this.chWet.connect(this.fxSum);
    this.fxSum.connect(wsp);
    wsp.connect(this.wLL, 0); wsp.connect(this.wLR, 0); wsp.connect(this.wRL, 1); wsp.connect(this.wRR, 1);
    this.wLL.connect(wmg, 0, 0); this.wRL.connect(wmg, 0, 0); this.wLR.connect(wmg, 0, 1); this.wRR.connect(wmg, 0, 1);
    wmg.connect(this.dspOut);
    this.dspOut.connect(this.preamp);
    this.preamp.connect(this.limiter); this.limiter.connect(this.balance);
    this.preamp.connect(this.limBypass); this.limBypass.connect(this.balance); this.limBypass.gain.value = 0;
    this.balance.connect(this.volume); this.volume.connect(this.analyser); this.analyser.connect(c.destination);
    this.wireInput();
    this.applyDsp(this.dsp);
    this.setVolume(this.vol);
    this.outputInfo = { sampleRate: c.sampleRate, latency: (c.baseLatency || 0) * 1000, sink: this.outputInfo.sink };
    if (!this.tickTimer) this.tickTimer = window.setInterval(() => this.tick(), 40);
  }

  private wireInput() {
    try { this.input.disconnect(); this.vrOut.disconnect(); } catch { /* */ }
    if (!this.dspEnabled) { this.input.connect(this.preamp); return; }
    if (this.voiceOn) { this.input.connect(this.vrIn); this.vrOut.connect(this.bass); }
    else this.input.connect(this.bass);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * seconds);
    const b = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }

  /** Rebuild context to match the source sample rate ("bit-perfect" path, no engine resampling). */
  async rematchSampleRate(sr: number) {
    if (this.ctx.sampleRate === sr) return;
    const wasPlaying = !this.paused;
    const pos = this.position;
    const track = this.current?.track || null;
    this.stopDecks();
    try { await this.ctx.close(); } catch { /* */ }
    this.bufferCache.clear();
    this.buildContext(sr);
    this.onStatus?.(`Output re-clocked to ${sr} Hz`);
    if (track && wasPlaying) await this.play(track, pos);
  }

  async setSink(id: string) {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (c.setSinkId) { try { await c.setSinkId(id); this.outputInfo.sink = id || "default"; } catch (e) { this.onStatus?.("Output device change failed: " + (e as Error).message); } }
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emit() { this.listeners.forEach((l) => l()); }

  // ---------- DSP ----------
  applyDsp(d: DspState) {
    this.dsp = d;
    const t = this.ctx.currentTime, k = 0.02;
    this.dspEnabled = d.enabled; this.voiceOn = d.voiceRemover; this.wireInput();
    this.bass.gain.setTargetAtTime(d.bass * 14, t, k);
    this.eqPre.gain.setTargetAtTime(d.eqOn ? dbToGain(d.eqPreamp) : 1, t, k);
    this.eq.forEach((b, i) => b.gain.setTargetAtTime(d.eqOn ? d.eq[i] : 0, t, k));
    this.echoWet.gain.setTargetAtTime(d.echo * 0.8, t, k);
    this.reverbWet.gain.setTargetAtTime(d.reverb * 0.9, t, k);
    this.flWet.gain.setTargetAtTime(d.flanger * 0.9, t, k);
    this.chWet.gain.setTargetAtTime(d.chorus * 0.8, t, k);
    const w = d.stereoWidth * 2; // 0..2
    this.wLL.gain.setTargetAtTime(0.5 + w / 2, t, k); this.wRR.gain.setTargetAtTime(0.5 + w / 2, t, k);
    this.wLR.gain.setTargetAtTime(0.5 - w / 2, t, k); this.wRL.gain.setTargetAtTime(0.5 - w / 2, t, k);
    this.balance.pan.setTargetAtTime(clamp(d.balance, -1, 1), t, k);
    this.limBypass.gain.setTargetAtTime(d.limiter ? 0 : 1, t, k);
    // when bypassed, mute the limiter path by driving threshold to 0 and ratio 1
    this.limiter.ratio.setTargetAtTime(d.limiter ? 20 : 1, t, k);
    this.limiter.threshold.setTargetAtTime(d.limiter ? -1 : 0, t, k);
    if (!d.limiter) { try { this.limiter.disconnect(); } catch { /* */ } } else { try { this.limiter.connect(this.balance); } catch { /* */ } }
    this.applyRate();
    if (this.current) this.applyTrackGain(this.current);
    if (this.next) this.applyTrackGain(this.next);
    this.setVolume(this.vol);
  }

  setVolume(v: number) {
    this.vol = clamp(v, 0, 1);
    const g = this.dsp.logVolume ? Math.pow(this.vol, 2.2) : this.vol;
    const t = this.ctx.currentTime;
    if (this.dsp.smoothVolume) this.volume.gain.setTargetAtTime(g, t, 0.05); else this.volume.gain.setValueAtTime(g, t);
    this.loudShelf.gain.setTargetAtTime(this.dsp.loudnessComp ? (1 - this.vol) * 8 : 0, t, 0.05);
  }
  get volumeValue() { return this.vol; }

  private trackGainDb(tr: Track): number {
    const d = this.dsp;
    let db = tr.trim || 0;
    if (d.rgOn) {
      let rg: number | null = null;
      if (d.rgFromTags && tr.rgTrackGain !== null) rg = tr.rgTrackGain + d.rgTagPreamp;
      else if (d.rgOnTheFly && tr.analyzedGain !== null) rg = tr.analyzedGain + d.rgOnTheFlyPreamp;
      db += rg === null ? d.rgDefault : rg;
    }
    if (d.peakNorm) {
      const pk = tr.analyzedPeak ?? tr.rgTrackPeak;
      if (pk && pk > 0) db += d.peakTarget - 20 * Math.log10(pk);
    }
    return clamp(db, -30, 30);
  }
  private applyTrackGain(deck: Deck) {
    deck.trackGain.gain.setTargetAtTime(dbToGain(this.trackGainDb(deck.track)), this.ctx.currentTime, 0.03);
  }
  currentGainDb(): number | null { return this.current ? this.trackGainDb(this.current.track) : null; }

  private applyRate() {
    const rate = clamp(this.dsp.speed * this.dsp.tempo, 0.25, 4);
    for (const d of [this.current, this.next]) {
      if (!d?.src) continue;
      // re-anchor position before changing rate
      const pos = this.deckPos(d);
      d.offset = pos; d.startCtx = this.ctx.currentTime; d.rate = rate;
      d.src.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
      d.src.detune.setValueAtTime(this.dsp.pitch * 100, this.ctx.currentTime);
    }
  }

  // ---------- loading ----------
  async decode(track: Track): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(track.path || track.id);
    if (cached) return cached;
    let buf: AudioBuffer;
    if (track.source === "demo") buf = await renderDemoTrack(track, this.ctx.sampleRate);
    else {
      let file = track.file;
      if (!file && track.handle) file = await track.handle.getFile();
      if (!file) throw new Error("File not available — reconnect the library folder");
      const ab = await file.arrayBuffer();
      try { buf = await this.ctx.decodeAudioData(ab); }
      catch { throw new Error(`Decoder rejected ${track.codec} (${track.path}). ALAC/DSD/APE need the native build's FFmpeg decoder.`); }
    }
    if (this.bufferCache.size > 6) { const k = this.bufferCache.keys().next().value!; this.bufferCache.delete(k); }
    this.bufferCache.set(track.path || track.id, buf);
    return buf;
  }

  private async makeDeck(track: Track): Promise<Deck> {
    const buffer = await this.decode(track);
    const fade = this.ctx.createGain(); const trackGain = this.ctx.createGain();
    fade.connect(trackGain); trackGain.connect(this.input);
    let start = track.cueStart ?? 0, end = track.cueEnd ?? buffer.duration;
    if (this.dsp.removeSilence && this.dsp.silenceEdges && !track.cueStart) {
      const s = detectSilence(buffer, this.dsp.silenceDb);
      start = Math.max(start, s.start); end = Math.min(end, s.end);
    }
    const deck: Deck = { track, buffer, src: null, fade, trackGain, startCtx: 0, offset: start, start, end, rate: 1, ended: false };
    this.applyTrackGain(deck);
    return deck;
  }

  private startDeck(deck: Deck, at: number, offset: number, fadeIn: number | null) {
    const src = this.ctx.createBufferSource();
    src.buffer = deck.buffer;
    const rate = clamp(this.dsp.speed * this.dsp.tempo, 0.25, 4);
    src.playbackRate.value = rate; src.detune.value = this.dsp.pitch * 100;
    src.connect(deck.fade);
    deck.src = src; deck.rate = rate; deck.startCtx = at; deck.offset = offset; deck.ended = false;
    src.onended = () => { if (deck.src === src) { deck.ended = true; this.onDeckEnded(deck); } };
    if (fadeIn && fadeIn > 0) {
      deck.fade.gain.setValueAtTime(0.0001, at);
      try { deck.fade.gain.setValueCurveAtTime(curveValues(this.dsp.crossfadeCurve, 64, true), at, fadeIn); }
      catch { deck.fade.gain.linearRampToValueAtTime(1, at + fadeIn); }
    } else deck.fade.gain.setValueAtTime(1, at);
    src.start(at, offset, Math.max(0.01, deck.end - offset));
  }

  private deckPos(d: Deck): number {
    if (!d.src) return d.offset;
    return Math.min(d.end, d.offset + (this.ctx.currentTime - d.startCtx) * d.rate);
  }

  private stopDeck(d: Deck | null, fadeOut = 0) {
    if (!d) return;
    const src = d.src; d.src = null;
    if (!src) return;
    src.onended = null;
    const t = this.ctx.currentTime;
    const fade = d.fade, trackGain = d.trackGain; // capture: seek/resume replace these on the deck
    if (fadeOut > 0) {
      try {
        fade.gain.cancelScheduledValues(t); fade.gain.setValueAtTime(fade.gain.value, t);
        fade.gain.linearRampToValueAtTime(0.0001, t + fadeOut);
      } catch { /* overlapping curve – just stop */ }
      try { src.stop(t + fadeOut + 0.01); } catch { /* */ }
    } else { try { src.stop(); } catch { /* */ } }
    setTimeout(() => { try { fade.disconnect(); trackGain.disconnect(); } catch { /* */ } }, (fadeOut + 0.2) * 1000);
  }
  private stopDecks() { this.stopDeck(this.current); this.stopDeck(this.next); this.current = null; this.next = null; this.transition.active = false; }

  // ---------- transport ----------
  async play(track: Track, offset = 0) {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.matchSourceRate && track.sampleRate && track.sampleRate !== this.ctx.sampleRate && track.source === "file") {
      const old = this.current; this.stopDecks();
      try { await this.ctx.close(); } catch { /* */ }
      this.bufferCache.clear(); this.buildContext(track.sampleRate);
      this.onStatus?.(`Output clocked to ${track.sampleRate} Hz (${old ? "switched" : "start"})`);
    }
    const manualXfade = this.dsp.crossfade && this.dsp.crossfadeOnManual && this.current && !this.paused;
    const deck = await this.makeDeck(track);
    const now = this.ctx.currentTime + 0.02;
    const old = this.current;
    this.stopDeck(this.next); this.next = null; this.nextTrackRequested = null;
    if (manualXfade && old) {
      const sec = this.dsp.crossfadeSec;
      this.stopDeck(old, sec);
      this.startDeck(deck, now, deck.start + offset, sec);
      this.transition = { active: true, progress: 0, from: old.track.id, to: track.id, curve: this.dsp.crossfadeCurve, seconds: sec };
      setTimeout(() => { this.transition.active = false; }, sec * 1000);
    } else {
      this.stopDeck(old, this.dsp.fadeOnSeek ? 0.05 : 0);
      this.startDeck(deck, now, deck.start + Math.min(offset, Math.max(0, deck.end - deck.start - 0.1)), null);
    }
    this.current = deck; this.paused = false;
    this.emit();
  }

  /** Called by the store whenever the "up next" track changes. Preloads for gapless / crossfade. */
  setNext(track: Track | null) {
    if (track?.id === this.nextTrackRequested?.id) return;
    this.nextTrackRequested = track;
    if (this.next && this.next.track.id !== track?.id) { this.stopDeck(this.next); this.next = null; }
    if (!track) return;
    const req = track;
    this.makeDeck(req).then((d) => {
      if (this.nextTrackRequested?.id !== req.id) return null;
      this.next = d; return d;
    }).catch((e) => { this.onStatus?.(String(e.message || e)); return null; });
  }

  pause() {
    if (this.paused || !this.current) return;
    this.pausePos = this.position;
    const d = this.current;
    this.paused = true;
    if (this.dsp.fadeOnPause) { this.stopDeck(d, 0.25); }
    else this.stopDeck(d);
    this.stopDeck(this.next); this.next = null; this.nextTrackRequested = null;
    // keep deck object for resume
    d.src = null; d.offset = d.start + this.pausePos;
    this.current = d;
    this.emit();
  }
  async resume() {
    if (!this.paused || !this.current) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const d = this.current;
    // recreate nodes (they were disconnected)
    d.fade = this.ctx.createGain(); d.trackGain = this.ctx.createGain(); d.fade.connect(d.trackGain); d.trackGain.connect(this.input); this.applyTrackGain(d);
    this.startDeck(d, this.ctx.currentTime + 0.01, d.start + this.pausePos, this.dsp.fadeOnPause ? 0.2 : null);
    this.paused = false;
    this.emit();
  }
  stop() { this.stopDecks(); this.paused = true; this.pausePos = 0; this.emit(); }

  seek(pos: number) {
    const d = this.current; if (!d) return;
    pos = clamp(pos, 0, d.end - d.start - 0.05);
    if (this.paused) { this.pausePos = pos; d.offset = d.start + pos; this.emit(); return; }
    // drop any scheduled next deck (will be rescheduled by tick)
    if (this.next?.src) { this.stopDeck(this.next); const nt = this.next.track; this.next = null; this.nextTrackRequested = null; this.setNext(nt); }
    this.transition.active = false;
    const old = { ...d };
    this.stopDeck(d, this.dsp.fadeOnSeek ? 0.03 : 0);
    d.fade = this.ctx.createGain(); d.trackGain = this.ctx.createGain(); d.fade.connect(d.trackGain); d.trackGain.connect(this.input); this.applyTrackGain(d);
    this.startDeck(d, this.ctx.currentTime + 0.01, old.start + pos, this.dsp.fadeOnSeek ? 0.03 : null);
    this.emit();
  }

  get isPaused() { return this.paused; }
  get currentTrack() { return this.current?.track || null; }
  get position(): number {
    const d = this.current; if (!d) return 0;
    if (this.paused) return this.pausePos;
    return Math.max(0, this.deckPos(d) - d.start);
  }
  get duration(): number { const d = this.current; return d ? d.end - d.start : 0; }
  get nextDeckReady() { return !!this.next; }

  // ---------- scheduling ----------
  private nextScheduled = false;
  private tick() {
    const d = this.current;
    if (!d || this.paused || !d.src) { this.nextScheduled = false; return; }
    const remainingWall = (d.end - this.deckPos(d)) / d.rate;
    const xf = this.dsp.crossfade ? this.dsp.crossfadeSec : 0;
    if (this.transition.active) {
      this.transition.progress = clamp(1 - remainingWall / Math.max(0.01, this.transition.seconds), 0, 1);
    }
    if (!this.nextScheduled && this.next && !this.next.src && remainingWall <= Math.max(xf, 0.25) + 0.15) {
      const n = this.next;
      const at = this.ctx.currentTime + Math.max(0, remainingWall - xf);
      if (xf > 0) {
        // fade current out over the overlap, fade next in
        try {
          d.fade.gain.cancelScheduledValues(at);
          d.fade.gain.setValueAtTime(1, at);
          d.fade.gain.setValueCurveAtTime(curveValues(this.dsp.crossfadeCurve, 64, false), at, xf);
        } catch { d.fade.gain.linearRampToValueAtTime(0.0001, at + xf); }
        this.startDeck(n, at, n.start, xf);
        this.transition = { active: true, progress: 0, from: d.track.id, to: n.track.id, curve: this.dsp.crossfadeCurve, seconds: xf };
      } else {
        this.startDeck(n, at, n.start, null); // sample-accurate gapless pre-roll
      }
      this.nextScheduled = true;
    }
  }

  private onDeckEnded(deck: Deck) {
    if (deck !== this.current) return;
    const n = this.next;
    this.transition.active = false;
    this.nextScheduled = false;
    if (n && n.src) {
      // gapless/crossfade handoff already happened
      setTimeout(() => { try { deck.fade.disconnect(); deck.trackGain.disconnect(); } catch { /* */ } }, 100);
      this.current = n; this.next = null; this.nextTrackRequested = null;
      this.onAdvance?.(n.track);
      this.emit();
    } else if (n) {
      // prepared but not yet started (e.g., very short remaining) – start immediately
      this.startDeck(n, this.ctx.currentTime, n.start, null);
      this.current = n; this.next = null; this.nextTrackRequested = null;
      this.onAdvance?.(n.track); this.emit();
    } else {
      this.current = null; this.paused = true; this.pausePos = 0;
      this.onEnd?.(); this.emit();
    }
  }

  getSpectrum(arr: Uint8Array) { this.analyser.getByteFrequencyData(arr as Uint8Array<ArrayBuffer>); }
}
