import type { Track, ColumnKey, SmartRule } from "../types";

export const fmtTime = (s: number, neg = false) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  const core = h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  return (neg ? "-" : "") + core;
};

export const fmtLong = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const fmtSize = (b: number) => {
  if (b > 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b > 1e6) return (b / 1e6).toFixed(2) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(1) + " KB";
  return b + " B";
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- seeded shuffle ----------
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rnd = mulberry32(hashSeed(seed));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Camelot wheel ----------
const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};
// Camelot: major = B side, minor = A side. 8B = C major, 8A = A minor
const MAJOR_CAMELOT = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]; // index by semitone from C
export function normalizeKey(key: string): { root: number; minor: boolean } | null {
  if (!key) return null;
  const k = key.trim();
  // Already camelot like "8A"
  const cm = k.match(/^(\d{1,2})\s*([ABab])$/);
  if (cm) {
    const num = parseInt(cm[1], 10);
    const minor = cm[2].toUpperCase() === "A";
    const idx = MAJOR_CAMELOT.indexOf(num);
    if (idx < 0) return null;
    // minor key with same number is relative minor (3 semitones below major root)
    return { root: minor ? (idx + 9) % 12 : idx, minor };
  }
  const m = k.match(/^([A-Ga-g])([#b♯♭]?)\s*(m|min|minor|maj|major|M)?$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2];
  const root = NOTE_INDEX[letter + acc];
  if (root === undefined) return null;
  const q = (m[3] || "").toLowerCase();
  const minor = q === "m" || q === "min" || q === "minor" || (m[3] === "m");
  return { root, minor: m[3] === "M" ? false : minor };
}
export function toCamelot(key: string): string {
  const n = normalizeKey(key);
  if (!n) return "";
  if (!n.minor) return `${MAJOR_CAMELOT[n.root]}B`;
  const relMajor = (n.root + 3) % 12;
  return `${MAJOR_CAMELOT[relMajor]}A`;
}
export function camelotCompatible(a: string, b: string): boolean {
  const ca = toCamelot(a), cb = toCamelot(b);
  if (!ca || !cb) return false;
  const na = parseInt(ca), nb = parseInt(cb);
  const la = ca.slice(-1), lb = cb.slice(-1);
  if (na === nb) return true; // same number any letter
  if (la !== lb) return false;
  const d = Math.abs(na - nb);
  return d === 1 || d === 11;
}
export const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// ---------- quality ----------
export function qualityScore(t: Pick<Track, "lossless" | "bitrate" | "sampleRate" | "bitDepth" | "codec">): number {
  let s = 0;
  if (t.lossless) {
    s = 700 + Math.min(200, (t.bitDepth || 16) * 6) + Math.min(100, (t.sampleRate / 96000) * 100);
  } else {
    s = Math.min(600, t.bitrate * 1.7);
    if (/opus|aac/i.test(t.codec)) s += 40;
  }
  return Math.round(s);
}
export function qualityLabel(t: Track): { label: string; tier: "hi" | "cd" | "lossy-hi" | "lossy" } {
  if (t.lossless) {
    if ((t.bitDepth || 16) > 16 || t.sampleRate > 48000) return { label: `Hi-Res ${t.bitDepth || 24}/${(t.sampleRate / 1000).toFixed(1)}k`, tier: "hi" };
    return { label: `${t.codec} ${t.bitDepth || 16}/${(t.sampleRate / 1000).toFixed(1)}k`, tier: "cd" };
  }
  if (t.bitrate >= 256) return { label: `${t.codec} ${Math.round(t.bitrate)}k`, tier: "lossy-hi" };
  return { label: `${t.codec} ${Math.round(t.bitrate)}k`, tier: "lossy" };
}

export const normalizeTitle = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/feat\..*$/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function dupKey(t: Track): string {
  if (t.isrc) return "isrc:" + t.isrc.toUpperCase();
  if (t.mbid) return "mbid:" + t.mbid;
  return "ta:" + normalizeTitle(t.title) + "|" + normalizeTitle(t.artist) + "|" + Math.round(t.duration / 4);
}

// ---------- search ----------
export interface ParsedQuery {
  text: string;
  filters: { field: string; op: ">" | "<" | "=" | ":"; value: string }[];
}
export function parseQuery(q: string): ParsedQuery {
  const filters: ParsedQuery["filters"] = [];
  const rest: string[] = [];
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([a-zA-Z]+):([<>=]?)(.+)$/);
    if (m) filters.push({ field: m[1].toLowerCase(), op: (m[2] || ":") as ParsedQuery["filters"][0]["op"], value: m[3] });
    else rest.push(tok);
  }
  return { text: rest.join(" "), filters };
}

export function fuzzyScore(needle: string, hay: string): number {
  needle = needle.toLowerCase();
  hay = hay.toLowerCase();
  if (!needle) return 1;
  if (hay.includes(needle)) return 2 + needle.length / hay.length;
  let hi = 0, score = 0, streak = 0;
  for (const ch of needle) {
    const idx = hay.indexOf(ch, hi);
    if (idx < 0) return 0;
    streak = idx === hi ? streak + 1 : 0;
    score += 1 + streak * 0.5;
    hi = idx + 1;
  }
  return score / (needle.length * 2);
}

const FIELD_ALIASES: Record<string, keyof Track | "camelot"> = {
  bpm: "bpm", key: "key", camelot: "camelot", genre: "genre", artist: "artist", album: "album", year: "year", composer: "composer",
  lyricist: "lyricist", title: "title", isrc: "isrc", codec: "codec", rating: "rating", bitrate: "bitrate", sr: "sampleRate",
  samplerate: "sampleRate", albumartist: "albumArtist", advisory: "advisory", mbid: "mbid", disc: "discNo", track: "trackNo", plays: "playCount",
};

export function trackFieldValue(t: Track, field: string): string | number | null {
  if (field === "camelot") return toCamelot(t.analyzedKey || t.key);
  if (field === "key") return t.key || t.analyzedKey || "";
  if (field === "bpm") return t.bpm ?? t.analyzedBpm ?? null;
  const v = (t as unknown as Record<string, unknown>)[field];
  if (v === undefined || v === null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

export function matchesQuery(t: Track, pq: ParsedQuery): number {
  for (const f of pq.filters) {
    const field = FIELD_ALIASES[f.field];
    if (!field) continue;
    const v = trackFieldValue(t, field);
    if (v === null || v === "") return 0;
    if (f.op === ">" || f.op === "<") {
      const n = Number(v), c = Number(f.value);
      if (isNaN(n) || isNaN(c)) return 0;
      if (f.op === ">" ? n <= c : n >= c) return 0;
    } else if (f.op === "=") {
      if (String(v).toLowerCase() !== f.value.toLowerCase()) return 0;
    } else {
      if (field === "camelot" || field === "key") {
        const target = toCamelot(f.value) || f.value.toUpperCase();
        if (String(v).toUpperCase() !== target && !String(v).toLowerCase().includes(f.value.toLowerCase())) return 0;
      } else if (!String(v).toLowerCase().includes(f.value.toLowerCase())) return 0;
    }
  }
  if (!pq.text) return 1;
  const hay = `${t.title} ${t.artist} ${t.album} ${t.albumArtist} ${t.genre} ${t.composer}`;
  return fuzzyScore(pq.text, hay);
}

export function matchesSmart(t: Track, rules: SmartRule[], mode: "all" | "any"): boolean {
  if (!rules.length) return true;
  const res = rules.map((r) => {
    const v = trackFieldValue(t, r.field);
    const sv = v === null ? "" : String(v);
    switch (r.op) {
      case "contains": return sv.toLowerCase().includes(r.value.toLowerCase());
      case "is": return sv.toLowerCase() === r.value.toLowerCase();
      case "isnot": return sv.toLowerCase() !== r.value.toLowerCase();
      case "startsWith": return sv.toLowerCase().startsWith(r.value.toLowerCase());
      case "gt": return Number(v) > Number(r.value);
      case "lt": return Number(v) < Number(r.value);
      case "camelot±1": return camelotCompatible(t.key || t.analyzedKey || "", r.value);
    }
  });
  return mode === "all" ? res.every(Boolean) : res.some(Boolean);
}

// ---------- sorting ----------
export function sortTracks(tracks: Track[], col: ColumnKey, dir: "asc" | "desc"): Track[] {
  const m = dir === "asc" ? 1 : -1;
  const val = (t: Track): string | number => {
    switch (col) {
      case "camelot": { const c = toCamelot(t.key || t.analyzedKey || ""); return c ? parseInt(c) * 2 + (c.endsWith("B") ? 1 : 0) : 99; }
      case "quality": return t.qualityScore;
      case "key": return t.key || t.analyzedKey || "";
      case "bpm": return t.bpm ?? t.analyzedBpm ?? 0;
      case "identity": return t.mbid || t.isrc || "";
      case "index": return 0;
      default: {
        const v = (t as unknown as Record<string, unknown>)[col];
        if (v === null || v === undefined) return dir === "asc" ? "\uffff" : "";
        return typeof v === "number" ? v : String(v).toLowerCase();
      }
    }
  };
  return tracks.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === vb) {
      // stable-ish secondary: album, disc, track
      if (a.album !== b.album) return a.album.localeCompare(b.album);
      return ((a.discNo || 0) - (b.discNo || 0)) || ((a.trackNo || 0) - (b.trackNo || 0));
    }
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * m;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * m;
  });
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const dbToGain = (db: number) => Math.pow(10, db / 20);
