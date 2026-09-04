export type Advisory = "explicit" | "clean" | "none";

export interface LyricLine {
  time: number; // seconds
  text: string;
  translation?: string;
}

export interface Track {
  id: string;
  // --- user-facing tag fields (the exact set the user asked for) ---
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  genre: string;
  composer: string;
  lyricist: string;
  isrc: string;
  bpm: number | null;
  key: string; // e.g. "Ab minor"
  advisory: Advisory;
  // --- identity ---
  mbid: string; // MusicBrainz recording id
  // --- technical ---
  codec: string; // FLAC / ALAC / MP3 / AAC / Opus / Vorbis / WAV / AIFF / DSD
  lossless: boolean;
  sampleRate: number;
  bitDepth: number | null;
  bitrate: number; // kbps
  channels: number;
  duration: number; // seconds
  fileSize: number; // bytes
  path: string;
  folder: string;
  // --- loudness ---
  rgTrackGain: number | null; // dB from tags
  rgTrackPeak: number | null;
  analyzedGain: number | null; // dB from our loudness analysis
  analyzedPeak: number | null;
  analyzedKey?: string;
  analyzedBpm?: number | null;
  trim: number; // dB per-track user trim
  // --- library ---
  rating: number; // 0-5
  playCount: number;
  lastPlayed: number | null;
  added: number;
  coverUrl: string | null;      // thumbnail (320px) for lists
  coverFull?: string | null;    // larger derivative for full-screen views
  lyrics: LyricLine[] | null;
  lyricsSource: "embedded" | "lrclib" | "none";
  // --- dedupe / quarantine ---
  qualityScore: number;
  dupGroup: string | null; // key shared by duplicate recordings
  quarantined: boolean;
  // --- CUE virtual track support ---
  cueStart?: number;
  cueEnd?: number;
  // --- source ---
  source: "demo" | "file";
  file?: File;
  handle?: FileSystemFileHandle;
  demoSeed?: number;
  // waveform peaks live in a bounded LRU in lib/analysis.ts, not on the Track
  energy?: number; // 0..1
}

export type SortDir = "asc" | "desc";

export type ColumnKey =
  | "index"
  | "title"
  | "artist"
  | "albumArtist"
  | "album"
  | "year"
  | "trackNo"
  | "discNo"
  | "genre"
  | "composer"
  | "lyricist"
  | "isrc"
  | "bpm"
  | "key"
  | "camelot"
  | "advisory"
  | "duration"
  | "codec"
  | "quality"
  | "bitrate"
  | "sampleRate"
  | "rating"
  | "playCount"
  | "lastPlayed"
  | "trim"
  | "identity";

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  smart?: SmartRule[];
  smartMatch?: "all" | "any";
}

export interface SmartRule {
  field: keyof Track | "camelot";
  op: "contains" | "is" | "isnot" | "gt" | "lt" | "camelot±1" | "startsWith";
  value: string;
}

export type RepeatMode = "off" | "all" | "one" | "album";

export type CurveType = "linear" | "equalPower" | "sCurve" | "logarithmic";

export interface DspState {
  enabled: boolean;
  eqOn: boolean;
  eq: number[]; // 18 bands dB
  eqPreamp: number;
  echo: number; // 0..1
  reverb: number;
  flanger: number;
  chorus: number;
  bass: number; // 0..1
  stereoWidth: number; // 0..1 (0.5 = neutral)
  speed: number; // 0.5..2
  pitch: number; // semitones -12..12
  tempo: number; // 0.5..2 (rubber band – native build)
  balance: number; // -1..1
  voiceRemover: boolean;
  fadeOnPause: boolean;
  fadeOnSeek: boolean;
  // volume tab
  smoothVolume: boolean;
  logVolume: boolean;
  loudnessComp: boolean;
  peakNorm: boolean;
  peakTarget: number;
  rgOn: boolean;
  rgDefault: number;
  rgOnTheFly: boolean;
  rgOnTheFlyPreamp: number;
  rgFromTags: boolean;
  rgTagPreamp: number;
  rgSource: "file" | "album";
  limiter: boolean;
  // mixing
  crossfade: boolean;
  crossfadeSec: number;
  crossfadeCurve: CurveType;
  gapless: boolean;
  crossfadeOnManual: boolean;
  // remove silence
  removeSilence: boolean;
  silenceMs: number;
  silenceDb: number;
  silenceEdges: boolean;
}

export interface Palette {
  bg: string; // deep dark tinted
  surface: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  vibrant: string;
  dominant: string;
}

export interface ScrobbleEntry {
  id: string;
  time: number;
  title: string;
  artist: string;
  mbid: string;
  isrc: string;
  status: "sent" | "queued" | "failed";
}

export type ViewMode = "table" | "grid" | "artists";

/** AIMP-style playlist grouping — tracks are bucketed under collapsible headers. */
export type GroupBy = "none" | "album" | "artist" | "albumArtist" | "genre" | "year" | "decade" | "folder" | "rating" | "codec" | "key" | "bpmRange" | "added";

/** MusicBee-style artist browser layouts. */
export type ArtistViewMode = "tree" | "cards" | "list";

export type LibraryFilter =
  | { kind: "all" }
  | { kind: "artist"; artist: string }
  | { kind: "album"; artist: string; album: string }
  | { kind: "playlist"; id: string }
  | { kind: "quarantine" }
  | { kind: "folder"; folder: string };
