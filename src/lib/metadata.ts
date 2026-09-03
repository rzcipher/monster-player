import { parseBlob, TimestampFormat, type IAudioMetadata } from "music-metadata";
import type { Track, Advisory } from "../types";
import { uid, qualityScore } from "./util";
import { parseLrc, plainToLines } from "./lyrics";

export const AUDIO_EXT = /\.(flac|m4a|mp4|alac|aac|mp3|ogg|oga|opus|wav|wave|aiff?|aif|wv|ape|dsf|dff|mka|webm|caf|tta|mpc)$/i;

function codecName(m: IAudioMetadata, name: string): { codec: string; lossless: boolean } {
  const f = m.format;
  const c = (f.codec || f.container || "").toUpperCase();
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (/FLAC/.test(c) || ext === "flac") return { codec: "FLAC", lossless: true };
  if (/ALAC/.test(c)) return { codec: "ALAC", lossless: true };
  if (/AAC|MPEG-4\/AAC|MP4A/.test(c)) return { codec: "AAC", lossless: false };
  if (/OPUS/.test(c)) return { codec: "Opus", lossless: false };
  if (/VORBIS/.test(c)) return { codec: "Vorbis", lossless: false };
  if (/MPEG 1 LAYER 3|MP3|MPEG/.test(c) || ext === "mp3") return { codec: "MP3", lossless: false };
  if (/PCM|WAVE|WAV/.test(c) || ext === "wav") return { codec: "WAV", lossless: true };
  if (/AIFF/.test(c) || ext === "aif" || ext === "aiff") return { codec: "AIFF", lossless: true };
  if (/DSD|DSF|DFF/.test(c) || ext === "dsf" || ext === "dff") return { codec: "DSD", lossless: true };
  if (/WAVPACK/.test(c) || ext === "wv") return { codec: "WavPack", lossless: !!f.lossless };
  if (/APE|MONKEY/.test(c) || ext === "ape") return { codec: "APE", lossless: true };
  return { codec: c || ext.toUpperCase() || "?", lossless: !!f.lossless };
}

function nativeTag(m: IAudioMetadata, ids: string[]): string {
  for (const tagType of Object.keys(m.native)) {
    for (const t of m.native[tagType]) {
      const id = t.id.toUpperCase();
      for (const want of ids) {
        const w = want.toUpperCase();
        if (id === w || id.endsWith(":" + w) || id.includes(w)) {
          const v = t.value;
          if (typeof v === "string") return v;
          if (typeof v === "number") return String(v);
          if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: string }).text);
        }
      }
    }
  }
  return "";
}

function parseAdvisory(m: IAudioMetadata): Advisory {
  const r = nativeTag(m, ["rtng", "ITUNESADVISORY", "advisory"]);
  if (r === "1" || /explicit/i.test(r)) return "explicit";
  if (r === "2" || /clean/i.test(r)) return "clean";
  return "none";
}

function parseGainDb(s: string | number | undefined | null): number | null {
  if (s === undefined || s === null) return null;
  if (typeof s === "number") return s;
  const m = String(s).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export function blankTrack(): Track {
  return {
    id: uid(), title: "", artist: "", albumArtist: "", album: "", year: null, trackNo: null, discNo: null, genre: "", composer: "",
    lyricist: "", isrc: "", bpm: null, key: "", advisory: "none", mbid: "", codec: "?", lossless: false, sampleRate: 44100, bitDepth: null,
    bitrate: 0, channels: 2, duration: 0, fileSize: 0, path: "", folder: "", rgTrackGain: null, rgTrackPeak: null, analyzedGain: null,
    analyzedPeak: null, trim: 0, rating: 0, playCount: 0, lastPlayed: null, added: Date.now(), coverUrl: null, lyrics: null,
    lyricsSource: "none", qualityScore: 0, dupGroup: null, quarantined: false, source: "file",
  };
}

export async function parseFile(file: File, path: string, handle?: FileSystemFileHandle): Promise<Track> {
  const t = blankTrack();
  t.file = file; t.handle = handle; t.path = path;
  t.folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  t.fileSize = file.size;
  t.title = file.name.replace(/\.[^.]+$/, "");
  try {
    const m = await parseBlob(file, { duration: true, skipPostHeaders: false });
    const c = m.common, f = m.format;
    const { codec, lossless } = codecName(m, file.name);
    t.codec = codec; t.lossless = lossless;
    t.title = c.title || t.title;
    t.artist = c.artists?.join("; ") || c.artist || "";
    t.albumArtist = c.albumartist || t.artist;
    t.album = c.album || "";
    t.year = c.year || null;
    t.trackNo = c.track?.no ?? null;
    t.discNo = c.disk?.no ?? null;
    t.genre = c.genre?.join("; ") || "";
    t.composer = c.composer?.join("; ") || "";
    t.lyricist = c.lyricist?.join("; ") || nativeTag(m, ["TEXT", "LYRICIST"]);
    t.isrc = c.isrc?.[0] || nativeTag(m, ["TSRC", "ISRC"]);
    t.bpm = c.bpm ? Math.round(c.bpm) : null;
    t.key = c.key || nativeTag(m, ["TKEY", "INITIALKEY"]);
    t.mbid = c.musicbrainz_recordingid || nativeTag(m, ["MUSICBRAINZ_TRACKID", "MusicBrainz Track Id"]);
    t.advisory = parseAdvisory(m);
    t.sampleRate = f.sampleRate || 44100;
    t.bitDepth = f.bitsPerSample || null;
    t.channels = f.numberOfChannels || 2;
    t.duration = f.duration || 0;
    t.bitrate = f.bitrate ? Math.round(f.bitrate / 1000) : t.duration ? Math.round((file.size * 8) / t.duration / 1000) : 0;
    t.rgTrackGain = parseGainDb(c.replaygain_track_gain?.dB ?? nativeTag(m, ["REPLAYGAIN_TRACK_GAIN"]) ?? null);
    t.rgTrackPeak = parseGainDb(c.replaygain_track_peak?.ratio ?? null);
    if (c.picture?.[0]) {
      const p = c.picture[0];
      const bytes = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data as ArrayBuffer);
      t.coverUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: p.format || "image/jpeg" }));
    }
    // SYLT (synchronised lyrics frames) first, then USLT / LYRICS / ©lyr text (which may itself be LRC)
    const sylt = c.lyrics?.find((l) => l.syncText?.length);
    if (sylt?.syncText) {
      // timeStampFormat 2 = milliseconds (1 = MPEG frames, which we can't map without the frame table)
      const isMs = sylt.timeStampFormat === TimestampFormat.milliseconds;
      const lines = sylt.syncText.filter((x) => x.timestamp !== undefined).map((x) => ({ time: isMs ? (x.timestamp || 0) / 1000 : (x.timestamp || 0) * 0.026, text: x.text.trim() }));
      t.lyrics = lines.length ? lines : null;
      if (t.lyrics) t.lyricsSource = "embedded";
    }
    const lyricText = c.lyrics?.map((l) => (typeof l === "string" ? l : l.text || "")).join("\n") || nativeTag(m, ["USLT", "LYRICS", "UNSYNCEDLYRICS", "©lyr"]);
    if (!t.lyrics && lyricText) {
      t.lyrics = parseLrc(lyricText) || plainToLines(lyricText, t.duration);
      t.lyricsSource = t.lyrics ? "embedded" : "none";
    }
  } catch (e) {
    console.warn("metadata parse failed", path, e);
  }
  t.qualityScore = qualityScore(t);
  return t;
}

// ---------- CUE sheets: split a single-file album into virtual tracks ----------
export interface CueTrack { no: number; title: string; performer: string; start: number; isrc: string }
export function parseCue(text: string): { file: string; performer: string; title: string; tracks: CueTrack[] } | null {
  const lines = text.split(/\r?\n/);
  let file = "", performer = "", title = "";
  const tracks: CueTrack[] = [];
  let cur: CueTrack | null = null;
  for (const raw of lines) {
    const l = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^FILE\s+"?(.+?)"?\s+\w+$/i))) file = m[1];
    else if ((m = l.match(/^TRACK\s+(\d+)\s+AUDIO/i))) { cur = { no: +m[1], title: "", performer, start: 0, isrc: "" }; tracks.push(cur); }
    else if ((m = l.match(/^TITLE\s+"?(.+?)"?$/i))) { if (cur) cur.title = m[1]; else title = m[1]; }
    else if ((m = l.match(/^PERFORMER\s+"?(.+?)"?$/i))) { if (cur) cur.performer = m[1]; else performer = m[1]; }
    else if ((m = l.match(/^ISRC\s+(\S+)/i)) && cur) cur.isrc = m[1];
    else if ((m = l.match(/^INDEX\s+01\s+(\d+):(\d+):(\d+)/i)) && cur) cur.start = +m[1] * 60 + +m[2] + +m[3] / 75;
  }
  if (!file || !tracks.length) return null;
  return { file, performer, title, tracks };
}

export function splitByCue(base: Track, cue: NonNullable<ReturnType<typeof parseCue>>): Track[] {
  return cue.tracks.map((ct, i) => {
    const end = i + 1 < cue.tracks.length ? cue.tracks[i + 1].start : base.duration;
    return {
      ...base, id: uid(), title: ct.title || `Track ${ct.no}`, artist: ct.performer || base.artist, trackNo: ct.no,
      album: cue.title || base.album, albumArtist: cue.performer || base.albumArtist, isrc: ct.isrc || "",
      cueStart: ct.start, cueEnd: end, duration: Math.max(0, end - ct.start),
      fileSize: Math.round((base.fileSize * Math.max(0, end - ct.start)) / Math.max(1, base.duration)),
    };
  });
}

// ---------- directory scanning ----------
export type ScanProgress = (done: number, total: number, current: string) => void;

async function* walk(dir: FileSystemDirectoryHandle, prefix = ""): AsyncGenerator<{ handle: FileSystemFileHandle; path: string }> {
  // @ts-expect-error - values() exists at runtime
  for await (const entry of dir.values() as AsyncIterable<FileSystemHandle>) {
    const p = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") yield { handle: entry as FileSystemFileHandle, path: p };
    else yield* walk(entry as FileSystemDirectoryHandle, p);
  }
}

export async function scanDirectoryHandle(dir: FileSystemDirectoryHandle, onProgress: ScanProgress): Promise<Track[]> {
  const entries: { handle: FileSystemFileHandle; path: string }[] = [];
  for await (const e of walk(dir, dir.name)) entries.push(e);
  const audio = entries.filter((e) => AUDIO_EXT.test(e.path));
  const cues = entries.filter((e) => /\.cue$/i.test(e.path));
  const out: Track[] = [];
  let i = 0;
  const cueByFile = new Map<string, NonNullable<ReturnType<typeof parseCue>>>();
  for (const c of cues) {
    const txt = await (await c.handle.getFile()).text();
    const parsed = parseCue(txt);
    if (parsed) cueByFile.set(c.path.slice(0, c.path.lastIndexOf("/") + 1) + parsed.file, parsed);
  }
  for (const e of audio) {
    onProgress(i++, audio.length, e.path);
    const file = await e.handle.getFile();
    const t = await parseFile(file, e.path, e.handle);
    const cue = cueByFile.get(e.path);
    if (cue && cue.tracks.length > 1) out.push(...splitByCue(t, cue));
    else out.push(t);
  }
  onProgress(audio.length, audio.length, "");
  return out;
}

export async function scanFileList(files: FileList | File[], onProgress: ScanProgress): Promise<Track[]> {
  const arr = Array.from(files);
  const audio = arr.filter((f) => AUDIO_EXT.test(f.name));
  const cueFiles = arr.filter((f) => /\.cue$/i.test(f.name));
  const cueByFile = new Map<string, NonNullable<ReturnType<typeof parseCue>>>();
  for (const c of cueFiles) {
    const parsed = parseCue(await c.text());
    const rel = (c as File & { webkitRelativePath?: string }).webkitRelativePath || c.name;
    if (parsed) cueByFile.set(rel.slice(0, rel.lastIndexOf("/") + 1) + parsed.file, parsed);
  }
  const out: Track[] = [];
  let i = 0;
  for (const f of audio) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    onProgress(i++, audio.length, rel);
    const t = await parseFile(f, rel);
    const cue = cueByFile.get(rel);
    if (cue && cue.tracks.length > 1) out.push(...splitByCue(t, cue));
    else out.push(t);
  }
  onProgress(audio.length, audio.length, "");
  return out;
}

// ---------- persist directory handle so the library survives restarts ----------
const DB = "saltbee", STORE = "handles";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveDirHandle(h: FileSystemDirectoryHandle) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(h, "library");
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get("library");
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch { return null; }
}
