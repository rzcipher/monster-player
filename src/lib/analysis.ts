import { KEY_NAMES } from "./util";

// ------- tiny radix-2 FFT (in-place, real input) -------
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Zero-copy mono access.
 *
 * The old implementation allocated a full-length Float32Array (40 MB for a
 * 4-minute track) at every call site. Instead we keep references to the
 * channel data and mix on read — analysis is sequential, so this costs
 * nothing in speed but allocates nothing at all.
 */
interface MonoView { length: number; at(i: number): number }

function monoView(buf: AudioBuffer): MonoView {
  const n = buf.length;
  const ch = buf.numberOfChannels;
  if (ch === 1) {
    const d = buf.getChannelData(0);
    return { length: n, at: (i) => d[i] };
  }
  if (ch === 2) {
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    return { length: n, at: (i) => (l[i] + r[i]) * 0.5 };
  }
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  const inv = 1 / ch;
  return { length: n, at: (i) => { let v = 0; for (let c = 0; c < ch; c++) v += chans[c][i]; return v * inv; } };
}

/** Downmix a *window* into a scratch buffer (used by the FFT, which needs contiguous data). */
function fillWindow(m: MonoView, out: Float32Array, offset: number) {
  const n = out.length;
  for (let i = 0; i < n; i++) out[i] = m.at(offset + i);
}

// ------- loudness (RMS-based, approximating LUFS with K-ish weighting omitted) -------
export function analyzeLoudness(buf: AudioBuffer): { gain: number; peak: number; energy: number } {
  const m = monoView(buf);
  let sum = 0, peak = 0;
  // cap the work at ~500k samples regardless of track length
  const step = Math.max(1, Math.floor(m.length / 500_000));
  let count = 0;
  for (let i = 0; i < m.length; i += step) {
    const v = m.at(i);
    sum += v * v; count++;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const dbfs = 20 * Math.log10(rms || 1e-9);
  // ReplayGain reference is ~ -18 dBFS RMS (89 dB SPL). gain = ref - measured
  const gain = Math.max(-24, Math.min(24, -18 - dbfs));
  const energy = Math.max(0, Math.min(1, (dbfs + 40) / 34));
  return { gain: +gain.toFixed(2), peak: +peak.toFixed(4), energy };
}

// ------- waveform peaks for the seek bar -------
export function waveformPeaks(buf: AudioBuffer, bins = 240): number[] {
  const m = monoView(buf);
  const per = Math.floor(m.length / bins);
  const out: number[] = [];
  let max = 0;
  for (let b = 0; b < bins; b++) {
    let p = 0;
    const start = b * per;
    const stride = Math.max(1, Math.floor(per / 120));
    for (let i = start; i < start + per; i += stride) { const a = Math.abs(m.at(i)); if (a > p) p = a; }
    out.push(p); if (p > max) max = p;
  }
  return out.map((v) => (max ? v / max : 0));
}

// ------- silence detection at edges -------
export function detectSilence(buf: AudioBuffer, thresholdDb: number): { start: number; end: number } {
  const m = monoView(buf);
  const thr = Math.pow(10, thresholdDb / 20);
  let s = 0, e = m.length - 1;
  while (s < m.length && Math.abs(m.at(s)) < thr) s++;
  while (e > s && Math.abs(m.at(e)) < thr) e--;
  return { start: s / buf.sampleRate, end: (e + 1) / buf.sampleRate };
}

// ------- Key detection: Krumhansl–Schmuckler on chroma -------
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
export function detectKey(buf: AudioBuffer): { key: string; confidence: number } {
  const m = monoView(buf);
  const sr = buf.sampleRate;
  const N = 4096;
  const frames = 32;
  const chroma = new Array(12).fill(0);
  const re = new Float32Array(N), im = new Float32Array(N);
  const hop = Math.max(N, Math.floor((m.length - N) / frames));
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    if (off + N > m.length) break;
    fillWindow(m, re, off);
    for (let i = 0; i < N; i++) { re[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); im[i] = 0; }
    fft(re, im);
    for (let k = 2; k < N / 2; k++) {
      const freq = (k * sr) / N;
      if (freq < 60 || freq > 4000) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag * mag;
    }
  }
  let best = { key: "", score: -2 }, second = -2;
  for (let r = 0; r < 12; r++) {
    const rot = (p: number[]) => chroma.map((_, i) => p[(i - r + 12) % 12]);
    const cM = corr(chroma, rot(MAJOR_PROFILE));
    const cm = corr(chroma, rot(MINOR_PROFILE));
    for (const [c, name] of [[cM, `${KEY_NAMES[r]} major`], [cm, `${KEY_NAMES[r]} minor`]] as [number, string][]) {
      if (c > best.score) { second = best.score; best = { key: name, score: c }; }
      else if (c > second) second = c;
    }
  }
  return { key: best.key, confidence: Math.max(0, Math.min(1, (best.score - second) * 4 + 0.3)) };
}

// ------- BPM: energy-flux onset + autocorrelation over 60–180 -------
export function detectBpm(buf: AudioBuffer): number | null {
  const m = monoView(buf);
  const sr = buf.sampleRate;
  const hop = 512;
  // Tempo is stable across a track — analysing a 60 s excerpt from the middle
  // gives the same answer for a fraction of the work.
  const maxSamples = sr * 60;
  const begin = m.length > maxSamples ? Math.floor((m.length - maxSamples) / 2) : 0;
  const span = Math.min(m.length - begin, maxSamples);
  const nFrames = Math.floor(span / hop);
  if (nFrames < 200) return null;
  const env = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let s = 0;
    const o = begin + f * hop;
    for (let i = 0; i < hop; i += 8) s += m.at(o + i) * m.at(o + i);
    env[f] = Math.sqrt(s / (hop / 8));
  }
  const flux = new Float32Array(nFrames);
  for (let i = 1; i < nFrames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop;
  const minLag = Math.floor((60 / 200) * fps), maxLag = Math.ceil((60 / 60) * fps);
  let bestLag = 0, bestVal = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < nFrames; i++) s += flux[i] * flux[i - lag];
    // slight preference to 90-150 range
    const bpm = (60 * fps) / lag;
    const w = bpm >= 85 && bpm <= 155 ? 1.1 : 1;
    if (s * w > bestVal) { bestVal = s * w; bestLag = lag; }
  }
  if (!bestLag) return null;
  let bpm = (60 * fps) / bestLag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}
