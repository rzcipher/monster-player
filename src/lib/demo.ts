import type { Track } from "../types";
import { blankTrack } from "./metadata";
import { qualityScore, mulberry32 } from "./util";
import { parseLrc } from "./lyrics";
import neon from "../assets/covers/neon.jpg";
import sakura from "../assets/covers/sakura.jpg";
import abyss from "../assets/covers/abyss.jpg";
import ember from "../assets/covers/ember.jpg";
import mint from "../assets/covers/mint.jpg";
import violet from "../assets/covers/violet.jpg";

interface DemoSpec {
  title: string; artist: string; albumArtist?: string; album: string; year: number; trackNo: number; discNo?: number; genre: string; composer: string; lyricist?: string;
  isrc: string; bpm: number; key: string; advisory: Track["advisory"]; mbid: string; codec: string; lossless: boolean; sampleRate: number; bitDepth: number | null;
  bitrate: number; duration: number; cover: string; rg?: number; lyrics?: string; seed: number; rating?: number; plays?: number;
}

const LRC_NEON = `[00:00.50]夜空って綺麗なんだ|The night sky is beautiful, isn't it?
[00:04.80]君を見上げて気づいた|I looked up at you and realized it
[00:09.20]少しの間だけ このままがいいや|Just for a little while, this is enough
[00:14.00]闇にいるはずだった僕は|I was supposed to be in the dark
[00:18.60]ネオンの海で息をする|Breathing in a sea of neon
[00:23.40]ノイズも 嘘も 全部|The noise, the lies, all of it
[00:27.90]この光の中で溶けていく|Melting away inside this light
[00:32.50]走れ 走れ 夜が終わる前に|Run, run, before the night ends
[00:37.40]鼓動だけが 正しい地図|Only my heartbeat is the true map
[00:42.00]MIGI POCKET に 願いを詰めて|Stuffing wishes into my right pocket`;

const LRC_SAKURA = `[00:01.00]花びらが 川面に浮かぶ|Petals floating on the river's surface
[00:06.00]春の終わりを 静かに告げて|Quietly announcing the end of spring
[00:11.00]君の名前を 呼んでみたけど|I tried calling your name
[00:16.00]風の音に 消えてしまった|But it vanished into the sound of the wind
[00:21.00]また会える日まで|Until the day we meet again
[00:26.00]この歌を 覚えていて|Remember this song
[00:31.00]桜 桜 舞い散る中で|Sakura, sakura, in the falling petals
[00:36.00]ひとり 僕は 歩き出す|Alone, I start to walk`;

const LRC_EMBER = `[00:00.80]Ash on my tongue and the city's on fire
[00:04.60]Every street I knew is a burning wire
[00:08.40]I tied the red around my throat
[00:12.20]So you'd find me in the smoke
[00:16.00]Ember, ember, don't go out
[00:19.80]I still hear you when I shout
[00:23.60]Ember, ember, hold the line
[00:27.40]One more sunset, one more time
[00:31.20]Run the ruins, run them slow
[00:35.00]Wherever the wind wants to go`;

const LRC_VIOLET = `[00:01.20]星の鍵盤 指でなぞる|Tracing the starry keys with my fingers
[00:06.40]音のない夜に 光が灯る|In the soundless night a light turns on
[00:11.60]テオ、聞こえてる?|Teo, can you hear me?
[00:16.80]この旋律は 君のために|This melody is for you
[00:22.00]紫の空 落ちてくる|The violet sky comes falling down
[00:27.20]受け止めて もう一度|Catch it, once more
[00:32.40]ピアノは 泣かない|The piano doesn't cry
[00:37.60]だから僕が 泣くよ|So I'll cry instead`;

const SPECS: DemoSpec[] = [
  { title: "MIGI POCKET", artist: "9Lana", album: "MIGI POCKET - Single", year: 2023, trackNo: 1, genre: "J-Pop", composer: "9Lana", lyricist: "9Lana", isrc: "JPX302300112", bpm: 128, key: "F# minor", advisory: "none", mbid: "b3f4e6a1-2c7d-4c1e-9a3f-1f3d2a0e9b11", codec: "FLAC", lossless: true, sampleRate: 44100, bitDepth: 16, bitrate: 1805, duration: 48, cover: neon, rg: -8.2, lyrics: LRC_NEON, seed: 11, rating: 5, plays: 42 },
  { title: "MIGI POCKET", artist: "9Lana", album: "MIGI POCKET - Single", year: 2023, trackNo: 1, genre: "J-Pop", composer: "9Lana", isrc: "JPX302300112", bpm: 128, key: "F# minor", advisory: "none", mbid: "b3f4e6a1-2c7d-4c1e-9a3f-1f3d2a0e9b11", codec: "MP3", lossless: false, sampleRate: 44100, bitDepth: null, bitrate: 192, duration: 48, cover: neon, seed: 11, plays: 3 },
  { title: "BALALAIKA", artist: "9Lana", album: "BALALAIKA - Single", year: 2024, trackNo: 1, genre: "J-Pop", composer: "9Lana", isrc: "JPX302400087", bpm: 140, key: "D minor", advisory: "none", mbid: "0c8d1a7e-8a4b-4c0f-a2c3-7d9e5b3a1f22", codec: "FLAC", lossless: true, sampleRate: 48000, bitDepth: 24, bitrate: 2210, duration: 44, cover: neon, rg: -9.1, seed: 12, rating: 4, plays: 17 },
  { title: "テオ", artist: "Leo/need", album: "Leo / need SEKAI ALBUM Vol.1", year: 2022, trackNo: 2, discNo: 1, genre: "Anime", composer: "Omoi", lyricist: "Omoi", isrc: "JPX302138030", bpm: 92, key: "Ab minor", advisory: "clean", mbid: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a55", codec: "FLAC", lossless: true, sampleRate: 96000, bitDepth: 24, bitrate: 3120, duration: 52, cover: violet, rg: -7.4, lyrics: LRC_VIOLET, seed: 21, rating: 5, plays: 88 },
  { title: "Running (feat. Tiishe) [Alt Ver.]", artist: "VaporGod; Tiishe", albumArtist: "VaporGod", album: "Running", year: 2025, trackNo: 3, genre: "Electronic", composer: "VaporGod", isrc: "QZNWS2500311", bpm: 124, key: "A minor", advisory: "explicit", mbid: "", codec: "FLAC", lossless: true, sampleRate: 44100, bitDepth: 16, bitrate: 1550, duration: 50, cover: abyss, rg: -10.6, seed: 31, rating: 4, plays: 12 },
  { title: "Deep Current", artist: "VaporGod", album: "Running", year: 2025, trackNo: 1, genre: "Electronic", composer: "VaporGod", isrc: "QZNWS2500309", bpm: 122, key: "E minor", advisory: "none", mbid: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c66", codec: "Opus", lossless: false, sampleRate: 48000, bitDepth: null, bitrate: 160, duration: 46, cover: abyss, seed: 32, plays: 5 },
  { title: "Hanabira Drift", artist: "Adai Song", album: "Spring Tapes", year: 2021, trackNo: 4, genre: "City Pop", composer: "Adai Song", lyricist: "Y. Hoshino", isrc: "JPK652100441", bpm: 98, key: "C major", advisory: "none", mbid: "1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e577", codec: "ALAC", lossless: true, sampleRate: 44100, bitDepth: 16, bitrate: 980, duration: 47, cover: sakura, rg: -6.9, lyrics: LRC_SAKURA, seed: 41, rating: 3, plays: 9 },
  { title: "Lemon Tree Avenue", artist: "Adai Song", album: "Spring Tapes", year: 2021, trackNo: 5, genre: "City Pop", composer: "Adai Song", isrc: "JPK652100442", bpm: 104, key: "G major", advisory: "none", mbid: "2e3f4a5b-6c7d-4e8f-90a1-b2c3d4e5f688", codec: "AAC", lossless: false, sampleRate: 44100, bitDepth: null, bitrate: 256, duration: 43, cover: mint, seed: 42, plays: 22 },
  { title: "Ember", artist: "Akhmedov", album: "Ruins", year: 2019, trackNo: 1, genre: "Alt Rock", composer: "R. Akhmedov", lyricist: "R. Akhmedov", isrc: "USRC11900122", bpm: 76, key: "E major", advisory: "explicit", mbid: "3f4a5b6c-7d8e-4f90-a1b2-c3d4e5f6a799", codec: "FLAC", lossless: true, sampleRate: 44100, bitDepth: 16, bitrate: 1020, duration: 49, cover: ember, rg: -11.8, lyrics: LRC_EMBER, seed: 51, rating: 4, plays: 31 },
  { title: "Ruins (Reprise)", artist: "Akhmedov", album: "Ruins", year: 2019, trackNo: 9, genre: "Alt Rock", composer: "R. Akhmedov", isrc: "USRC11900130", bpm: 70, key: "B major", advisory: "none", mbid: "4a5b6c7d-8e9f-4a01-b2c3-d4e5f6a7b800", codec: "MP3", lossless: false, sampleRate: 44100, bitDepth: null, bitrate: 320, duration: 41, cover: ember, seed: 52, plays: 2 },
  { title: "Constellation Waltz", artist: "Leo/need", album: "Leo / need SEKAI ALBUM Vol.1", year: 2022, trackNo: 5, discNo: 1, genre: "Anime", composer: "Kanon", isrc: "JPX302138033", bpm: 132, key: "Bb major", advisory: "none", mbid: "5b6c7d8e-9f01-4b12-c3d4-e5f6a7b8c911", codec: "FLAC", lossless: true, sampleRate: 96000, bitDepth: 24, bitrate: 2980, duration: 45, cover: violet, rg: -8.8, seed: 22, rating: 4, plays: 27 },
  { title: "Midnight Mint", artist: "Andromeda", album: "Citrus Nights", year: 2020, trackNo: 2, genre: "Lo-fi", composer: "Andromeda", isrc: "", bpm: 85, key: "A major", advisory: "none", mbid: "", codec: "Vorbis", lossless: false, sampleRate: 44100, bitDepth: null, bitrate: 192, duration: 42, cover: mint, seed: 61, plays: 14 },
];

export function buildDemoLibrary(): Track[] {
  return SPECS.map((s, i) => {
    const t = blankTrack();
    Object.assign(t, {
      id: "demo-" + i, title: s.title, artist: s.artist, albumArtist: s.albumArtist || s.artist.split(";")[0].trim(), album: s.album, year: s.year, trackNo: s.trackNo,
      discNo: s.discNo ?? 1, genre: s.genre, composer: s.composer, lyricist: s.lyricist || "", isrc: s.isrc, bpm: s.bpm, key: s.key, advisory: s.advisory, mbid: s.mbid,
      codec: s.codec, lossless: s.lossless, sampleRate: s.sampleRate, bitDepth: s.bitDepth, bitrate: s.bitrate, channels: 2, duration: s.duration,
      fileSize: Math.round((s.bitrate * 1000 * s.duration) / 8), path: `Music/${s.albumArtist || s.artist.split(";")[0]}/${s.album}/${String(s.trackNo).padStart(2, "0")} ${s.title}.${s.codec === "ALAC" || s.codec === "AAC" ? "m4a" : s.codec.toLowerCase()}`,
      folder: `Music/${s.albumArtist || s.artist.split(";")[0]}/${s.album}`, rgTrackGain: s.rg ?? null, rgTrackPeak: s.rg ? 0.98 : null, coverUrl: s.cover,
      lyrics: s.lyrics ? parseLrc(s.lyrics) : null, lyricsSource: s.lyrics ? "embedded" : "none", source: "demo", demoSeed: s.seed, rating: s.rating || 0,
      playCount: s.plays || 0, lastPlayed: s.plays ? Date.now() - (i + 1) * 36e5 * 7 : null, added: Date.now() - i * 864e5,
    } satisfies Partial<Track>);
    t.qualityScore = qualityScore(t);
    return t;
  });
}

// ---------- procedural audio for demo tracks (chords in the tagged key, at the tagged BPM) ----------
const NOTE: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const cache = new Map<string, Promise<AudioBuffer>>();

export function renderDemoTrack(track: Track, sampleRate: number): Promise<AudioBuffer> {
  const key = `${track.id}@${sampleRate}`;
  if (cache.has(key)) return cache.get(key)!;
  const p = (async () => {
    const dur = track.duration;
    const off = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
    const rnd = mulberry32(track.demoSeed || 1);
    const m = track.key.match(/^([A-G][#b]?)\s*(minor|major)/i);
    const root = m ? NOTE[m[1]] : 0;
    const minor = m ? /minor/i.test(m[2]) : true;
    const bpm = track.bpm || 120;
    const beat = 60 / bpm;
    const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const prog = minor ? [0, 5, 3, 4] : [0, 4, 5, 3]; // i VI iv v / I V vi IV
    const master = off.createGain(); master.gain.value = 0.5; master.connect(off.destination);
    const comp = off.createDynamicsCompressor(); comp.connect(master);
    const lp = off.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6000; lp.connect(comp);
    const midi = (deg: number, oct: number) => 48 + root + scale[deg % 7] + 12 * (oct + Math.floor(deg / 7));
    const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const lossy = !track.lossless;
    // pad chords
    const bars = Math.ceil(dur / (beat * 4));
    for (let b = 0; b < bars; b++) {
      const t0 = b * beat * 4;
      const deg = prog[b % prog.length];
      const notes = [deg, deg + 2, deg + 4];
      for (const [i, n] of notes.entries()) {
        const o = off.createOscillator(); o.type = i === 0 ? "sawtooth" : "triangle"; o.frequency.value = hz(midi(n, 0));
        const g = off.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.08, t0 + 0.4); g.gain.setValueAtTime(0.08, t0 + beat * 4 - 0.3); g.gain.linearRampToValueAtTime(0, t0 + beat * 4);
        o.connect(g).connect(lp); o.start(t0); o.stop(t0 + beat * 4 + 0.05);
      }
      // bass
      const bo = off.createOscillator(); bo.type = "square"; bo.frequency.value = hz(midi(deg, -1));
      const bg = off.createGain(); bg.gain.value = 0;
      for (let k = 0; k < 8; k++) { const tk = t0 + k * beat * 0.5; bg.gain.setValueAtTime(0.12, tk); bg.gain.exponentialRampToValueAtTime(0.01, tk + beat * 0.45); }
      const bf = off.createBiquadFilter(); bf.type = "lowpass"; bf.frequency.value = 300;
      bo.connect(bf).connect(bg).connect(comp); bo.start(t0); bo.stop(t0 + beat * 4);
      // melody (plucks)
      for (let k = 0; k < 8; k++) {
        if (rnd() < 0.35) continue;
        const tk = t0 + k * beat * 0.5;
        const d = deg + [0, 2, 4, 7, 9][Math.floor(rnd() * 5)];
        const o = off.createOscillator(); o.type = "sine"; o.frequency.value = hz(midi(d, 1));
        const g = off.createGain(); g.gain.setValueAtTime(0.14, tk); g.gain.exponentialRampToValueAtTime(0.001, tk + beat * 0.9);
        const pan = off.createStereoPanner(); pan.pan.value = rnd() * 1.2 - 0.6;
        o.connect(g).connect(pan).connect(comp); o.start(tk); o.stop(tk + beat);
      }
    }
    // drums
    const noiseLen = Math.floor(sampleRate * 0.25);
    const noise = off.createBuffer(1, noiseLen, sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < noiseLen; i++) nd[i] = (rnd() * 2 - 1) * Math.pow(1 - i / noiseLen, 3);
    const beats = Math.floor(dur / beat);
    for (let i = 0; i < beats; i++) {
      const t = i * beat;
      // kick
      const k = off.createOscillator(); k.frequency.setValueAtTime(150, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const kg = off.createGain(); kg.gain.setValueAtTime(0.9, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      k.connect(kg).connect(comp); k.start(t); k.stop(t + 0.3);
      // hat
      for (const h of [0, 0.5]) {
        const s = off.createBufferSource(); s.buffer = noise; const hg = off.createGain(); hg.gain.value = h === 0 ? 0.12 : 0.07;
        const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = lossy ? 5000 : 7000;
        s.connect(hp).connect(hg).connect(comp); s.start(t + h * beat); s.stop(t + h * beat + 0.08);
      }
      // snare on 2 & 4
      if (i % 2 === 1) { const s = off.createBufferSource(); s.buffer = noise; const sg = off.createGain(); sg.gain.value = 0.35; const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; s.connect(bp).connect(sg).connect(comp); s.start(t); s.stop(t + 0.2); }
    }
    if (lossy) { lp.frequency.value = 3500; } // "sounds like a 128k rip" so the quality badge is audible
    // fade tail
    master.gain.setValueAtTime(0.5, Math.max(0, dur - 1.2)); master.gain.linearRampToValueAtTime(0.0001, dur);
    return off.startRendering();
  })();
  cache.set(key, p);
  return p;
}
