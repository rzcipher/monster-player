import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track, Playlist, RepeatMode, DspState, Palette, ViewMode, LibraryFilter, ColumnKey, SortDir, ScrobbleEntry, SmartRule, GroupBy, ArtistViewMode } from "./types";
import { AudioEngine } from "./engine/AudioEngine";
import { buildDemoLibrary } from "./lib/demo";
import { DEFAULT_PALETTE, extractPalette, applyPalette, staticPalette, type ThemeMode } from "./lib/colors";
import { native, nativeFile } from "./lib/native";
import { seededShuffle, uid, dupKey, camelotCompatible, matchesSmart, qualityScore } from "./lib/util";
import { analyzeLoudness, detectKey, detectBpm, waveformPeaks } from "./lib/analysis";
import { fetchLrclib, plainToLines } from "./lib/lyrics";
import { scanDirectoryHandle, scanFileList, saveDirHandle, loadDirHandle, parseFile } from "./lib/metadata";

export const DEFAULT_DSP: DspState = {
  enabled: true, eqOn: false, eq: new Array(18).fill(0), eqPreamp: 0, echo: 0, reverb: 0, flanger: 0, chorus: 0, bass: 0.15, stereoWidth: 0.5,
  speed: 1, pitch: 0, tempo: 1, balance: 0, voiceRemover: false, fadeOnPause: true, fadeOnSeek: true,
  smoothVolume: true, logVolume: false, loudnessComp: false, peakNorm: false, peakTarget: 0,
  rgOn: true, rgDefault: 0, rgOnTheFly: true, rgOnTheFlyPreamp: 0, rgFromTags: true, rgTagPreamp: 0, rgSource: "file", limiter: true,
  crossfade: false, crossfadeSec: 4, crossfadeCurve: "equalPower", gapless: true, crossfadeOnManual: true,
  removeSilence: false, silenceMs: 500, silenceDb: -60, silenceEdges: true,
};

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: new Array(18).fill(0),
  "Bass Boost": [7, 6, 5.5, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Vocal": [-2, -2, -1.5, -1, 0, 0, 1, 2, 3, 3.5, 3.5, 3, 2, 1, 0, -1, -1, -1],
  "Rock": [4, 3.5, 3, 2, 1, 0, -1, -1.5, -1, 0, 1, 2, 3, 3.5, 3.5, 3, 2.5, 2],
  "J-Pop Bright": [2, 2, 1.5, 1, 0, 0, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 3.5, 3, 2.5, 2],
  "Electronic": [5, 4.5, 4, 3, 1, 0, -1, -1, 0, 0, 1, 1, 2, 3, 3.5, 4, 4, 3],
  "Loudness": [6, 5, 4, 2, 0, -1, -2, -2, -2, -1, 0, 1, 2, 3, 4, 5, 5, 4],
  "Treble Cut": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -3, -4, -5, -6, -7, -8],
};

export interface Settings {
  listenBrainzToken: string;
  listenBrainzUser: string;
  cliBridgeUrl: string;
  matchSourceRate: boolean;
  resumeOnStart: boolean;
  autoLrclib: boolean;
  showTranslation: boolean;
  immersion: boolean;
  autoAnalyze: boolean;
  outputDevice: string;
  autoQuarantine: boolean;
  // --- Salt Player theming ---
  themeMode: ThemeMode;
  adaptiveTheme: boolean;      // re-tint the whole UI from the cover art
  coverBackdrop: boolean;      // blurred cover behind the library
  backdropStrength: number;    // 0..1
  animations: boolean;
  karaoke: boolean;             // word-sweep highlight on the active lyric line
  desktopLyrics: boolean;       // floating always-on-top lyric line
  cornerRadius: number;        // px, Salt-style roundness
  fontScale: number;           // 0.85..1.35
  // --- AIMP dock ---
  dockAutoHide: boolean;       // slide off-screen, call down on hover
  dockOpacity: number;
  alwaysOnTop: boolean;
}

export interface UserData { rating: number; playCount: number; lastPlayed: number | null; trim: number; lyricsOverride?: string }

interface State {
  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  history: string[];
  currentId: string | null;
  playing: boolean;
  shuffle: boolean;
  shuffleSeed: string;
  repeat: RepeatMode;
  keyMix: boolean;
  view: ViewMode;
  filter: LibraryFilter;
  search: string;
  sortCol: ColumnKey;
  sortDir: SortDir;
  visibleCols: ColumnKey[];
  selected: string[];
  dsp: DspState;
  volume: number;
  palette: Palette;
  nowPlayingOpen: boolean;
  nowPlayingTab: "info" | "lyrics";
  fxOpen: boolean;
  fxTab: string;
  settingsOpen: boolean;
  tagEditorId: string | null;
  smartEditorId: string | null;
  quarantineOpen: boolean;
  sleepOpen: boolean;
  docked: boolean;
  dockExpanded: boolean;
  dockRevealed: boolean;
  groupBy: GroupBy;
  artistView: ArtistViewMode;
  rightPanel: "queue" | "playlists" | "identity" | "none";
  sleepEndsAt: number | null;
  scrobbles: ScrobbleEntry[];
  settings: Settings;
  status: string;
  scan: { active: boolean; done: number; total: number; current: string };
  userData: Record<string, UserData>;
  resumePos: number;
  analysisQueue: string[];
  analyzing: boolean;
  outputs: { id: string; label: string }[];
  libraryName: string;
  libraryRoots: string[];
  contextMenu: { x: number; y: number; trackId: string } | null;
  promptReq: { title: string; value: string; resolve: (v: string | null) => void } | null;

  // actions
  ask: (title: string, def?: string) => Promise<string | null>;
  init: () => Promise<void>;
  setStatus: (s: string) => void;
  importFolder: () => Promise<void>;
  importNativeFolder: (root: string) => Promise<void>;
  importNativePaths: (paths: string[], diskMode?: boolean) => Promise<void>;
  importFiles: (files: FileList | File[], diskMode?: boolean) => Promise<void>;
  reconnectLibrary: () => Promise<void>;
  clearLibrary: () => void;
  playTrack: (id: string, contextIds?: string[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: (manual?: boolean) => Promise<void>;
  prev: () => Promise<void>;
  seek: (pos: number) => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  setShuffleSeed: (s: string) => void;
  cycleRepeat: () => void;
  setRepeat: (r: RepeatMode) => void;
  toggleKeyMix: () => void;
  computeNextId: (fromId?: string | null) => string | null;
  syncNext: () => void;
  enqueue: (ids: string[], where: "next" | "end") => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  setView: (v: ViewMode) => void;
  setFilter: (f: LibraryFilter) => void;
  setSearch: (s: string) => void;
  setSort: (c: ColumnKey) => void;
  toggleCol: (c: ColumnKey) => void;
  setSelected: (ids: string[]) => void;
  setDsp: (p: Partial<DspState>) => void;
  setEqBand: (i: number, v: number) => void;
  applyEqPreset: (name: string) => void;
  resetDsp: () => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  setRating: (id: string, r: number) => void;
  setTrim: (id: string, db: number) => void;
  createPlaylist: (name: string, ids?: string[], smart?: SmartRule[]) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (pid: string, ids: string[]) => void;
  removeFromPlaylist: (pid: string, ids: string[]) => void;
  updateSmart: (pid: string, rules: SmartRule[], match: "all" | "any") => void;
  playlistTracks: (pid: string) => Track[];
  recomputeDupes: () => void;
  restore: (id: string) => void;
  mergeGroup: (group: string) => void;
  upgradeTo: (fromId: string, toId: string) => void;
  analyzeTrack: (id: string) => Promise<void>;
  analyzeAll: () => void;
  fetchLyrics: (id: string) => Promise<void>;
  scrobble: (t: Track) => Promise<void>;
  cliAction: (action: "fix-metadata" | "retranslate" | "demucs-acapella" | "retag", t: Track) => Promise<void>;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setSleep: (minutes: number | null) => void;
  toggleDock: () => void;
  setDockExpanded: (v: boolean) => void;
  setDockAutoHide: (v: boolean) => void;
  setGroupBy: (g: GroupBy) => void;
  setArtistView: (v: ArtistViewMode) => void;
  retheme: () => void;
  openNowPlaying: (tab?: "info" | "lyrics") => void;
  closeNowPlaying: () => void;
  set: (p: Partial<State>) => void;
  refreshOutputs: () => Promise<void>;
  suggestKeyMix: () => Track[];
  removeTracks: (ids: string[]) => void;
}

let engine: AudioEngine | null = null;
export function getEngine(): AudioEngine {
  if (!engine) {
    engine = new AudioEngine(useStore.getState().dsp);
    engine.setVolume(useStore.getState().volume);
    engine.matchSourceRate = useStore.getState().settings.matchSourceRate;
    engine.onStatus = (m) => useStore.getState().setStatus(m);
    engine.onAdvance = (t) => {
      const s = useStore.getState();
      const prev = s.tracks.find((x) => x.id === s.currentId);
      if (prev) { s.scrobble(prev); }
      s.set({ currentId: t.id, history: [...s.history, s.currentId!].filter(Boolean).slice(-100), playing: true });
      afterTrackChange(t);
    };
    engine.onEnd = () => {
      useStore.getState().set({ playing: false });
    };
  }
  return engine;
}

let sleepTimer: number | null = null;
let posSaver: number | null = null;

function afterTrackChange(t: Track) {
  const s = useStore.getState();
  s.updateTrack(t.id, { playCount: t.playCount + 1, lastPlayed: Date.now() });
  s.syncNext();
  s.retheme();
  if (!t.waveform || t.analyzedGain === null) s.analyzeTrack(t.id);
  if (!t.lyrics && s.settings.autoLrclib) s.fetchLyrics(t.id);
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: t.coverUrl ? [{ src: t.coverUrl, sizes: "512x512" }] : [] });
  }
  if (!posSaver) posSaver = window.setInterval(() => { const e = engine; if (e && !e.isPaused) useStore.setState({ resumePos: e.position }); }, 4000);
}

function udKey(t: Track) { return t.source === "demo" ? t.id : t.path + (t.cueStart ? "#" + t.cueStart : ""); }

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      tracks: [], playlists: [], queue: [], history: [], currentId: null, playing: false, shuffle: false, shuffleSeed: "saltbee", repeat: "off", keyMix: false,
      view: "table", filter: { kind: "all" }, search: "", sortCol: "album", sortDir: "asc",
      visibleCols: ["index", "title", "artist", "album", "year", "genre", "bpm", "key", "camelot", "duration", "quality", "rating", "identity", "trim"],
      selected: [], dsp: DEFAULT_DSP, volume: 0.8, palette: DEFAULT_PALETTE, nowPlayingOpen: false, nowPlayingTab: "lyrics", fxOpen: false, fxTab: "General",
      settingsOpen: false, tagEditorId: null, smartEditorId: null, quarantineOpen: false, sleepOpen: false, docked: false, dockExpanded: false, dockRevealed: true, groupBy: "none", artistView: "tree", rightPanel: "queue",
      sleepEndsAt: null, scrobbles: [], status: "Ready", scan: { active: false, done: 0, total: 0, current: "" }, userData: {}, resumePos: 0,
      analysisQueue: [], analyzing: false, outputs: [], libraryName: "Demo library", libraryRoots: [], contextMenu: null, promptReq: null,
      settings: { listenBrainzToken: "", listenBrainzUser: "", cliBridgeUrl: "http://127.0.0.1:7788", matchSourceRate: false, resumeOnStart: true, autoLrclib: true, showTranslation: true, immersion: false, autoAnalyze: true, outputDevice: "", autoQuarantine: true,
        themeMode: "adaptive", adaptiveTheme: true, coverBackdrop: true, backdropStrength: 0.5, animations: true, karaoke: true, desktopLyrics: false, cornerRadius: 12, fontScale: 1,
        dockAutoHide: true, dockOpacity: 1, alwaysOnTop: false },

      set: (p) => set(p),
      setStatus: (status) => set({ status }),
      ask: (title, def = "") => new Promise((resolve) => set({ promptReq: { title, value: def, resolve: (v) => { set({ promptReq: null }); resolve(v); } } })),

      init: async () => {
        const s = get();
        let tracks = buildDemoLibrary();
        // reconnect persisted folder if possible
        const h = await loadDirHandle();
        if (h) {
          try {
            const perm = await (h as FileSystemDirectoryHandle & { queryPermission: (o: { mode: string }) => Promise<string> }).queryPermission({ mode: "read" });
            if (perm === "granted") {
              set({ scan: { active: true, done: 0, total: 0, current: "" } });
              const real = await scanDirectoryHandle(h, (done, total, current) => set({ scan: { active: true, done, total, current } }));
              tracks = [...tracks, ...real];
              set({ libraryName: h.name, scan: { active: false, done: 0, total: 0, current: "" } });
            } else set({ status: `Library folder "${h.name}" needs permission — click Reconnect` });
          } catch { /* */ }
        }
        // apply saved user data
        tracks = tracks.map((t) => { const u = s.userData[udKey(t)]; return u ? { ...t, rating: u.rating, playCount: u.playCount, lastPlayed: u.lastPlayed, trim: u.trim } : t; });
        set({ tracks });
        get().recomputeDupes();
        const ids = new Set(get().tracks.map((t) => t.id));
        const queue = s.queue.filter((id) => ids.has(id));
        const currentId = s.currentId && ids.has(s.currentId) ? s.currentId : null;
        set({ queue: queue.length ? queue : get().tracks.filter((t) => !t.quarantined).map((t) => t.id), currentId, playing: false });
        get().retheme();
        if (!s.settings.resumeOnStart) set({ resumePos: 0 });
        if (s.settings.autoAnalyze) get().analyzeAll();
        get().refreshOutputs();
      },

      importFolder: async () => {
        // --- native (packaged .exe): real recursive disk scan, no permission prompts ---
        if (native) {
          const root = await native.pickFolder();
          if (!root) return;
          await get().importNativeFolder(root);
          return;
        }
        const w = window as Window & { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> };
        if (w.showDirectoryPicker) {
          try {
            const h = await w.showDirectoryPicker({ mode: "read" });
            set({ scan: { active: true, done: 0, total: 0, current: "" }, status: "Scanning…" });
            const real = await scanDirectoryHandle(h, (done, total, current) => set({ scan: { active: true, done, total, current } }));
            await saveDirHandle(h).catch(() => {});
            const existing = new Set(get().tracks.map((t) => t.path));
            const fresh = real.filter((t) => !existing.has(t.path)).map((t) => { const u = get().userData[udKey(t)]; return u ? { ...t, ...u } : t; });
            set({ tracks: [...get().tracks, ...fresh], libraryName: h.name, scan: { active: false, done: 0, total: 0, current: "" }, status: `Imported ${fresh.length} tracks from ${h.name}` });
            get().recomputeDupes();
            if (!get().queue.length) set({ queue: get().tracks.filter((t) => !t.quarantined).map((t) => t.id) });
            if (get().settings.autoAnalyze) get().analyzeAll();
          } catch (e) { if ((e as Error).name !== "AbortError") set({ status: "Import failed: " + (e as Error).message, scan: { active: false, done: 0, total: 0, current: "" } }); }
        } else {
          const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; (inp as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
          inp.onchange = () => inp.files && get().importFiles(inp.files);
          inp.click();
        }
      },

      importFiles: async (files, diskMode = false) => {
        set({ scan: { active: true, done: 0, total: 0, current: "" } });
        const list = await scanFileList(files, (done, total, current) => set({ scan: { active: true, done, total, current } }));
        set({ scan: { active: false, done: 0, total: 0, current: "" } });
        if (!list.length) { set({ status: "No supported audio files found" }); return; }
        if (diskMode) {
          // Disk mode: play directly, don't add to library permanently (they live only in the queue)
          const ids = list.map((t) => t.id);
          set({ tracks: [...get().tracks, ...list], status: `Disk mode: playing ${list.length} file(s) without importing` });
          await get().playTrack(ids[0], ids);
          return;
        }
        const existing = new Set(get().tracks.map((t) => t.path));
        const fresh = list.filter((t) => !existing.has(t.path));
        set({ tracks: [...get().tracks, ...fresh], status: `Imported ${fresh.length} tracks` });
        get().recomputeDupes();
        if (get().settings.autoAnalyze) get().analyzeAll();
      },

      importNativeFolder: async (root) => {
        if (!native) return;
        set({ scan: { active: true, done: 0, total: 0, current: root }, status: `Scanning ${root}…` });
        const files = await native.scan(root);
        set({ scan: { active: true, done: 0, total: files.length, current: "" } });
        const existing = new Set(get().tracks.map((t) => t.path));
        const fresh: Track[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (existing.has(f.path)) continue;
          try {
            const t = await parseFile(await nativeFile(f), f.path);
            t.folder = f.folder;
            t.source = "file";
            const u = get().userData[f.path];
            fresh.push(u ? { ...t, ...u } : t);
          } catch { /* unreadable file */ }
          if (i % 8 === 0) set({ scan: { active: true, done: i + 1, total: files.length, current: f.name } });
        }
        set({
          tracks: [...get().tracks, ...fresh],
          libraryName: root.split(/[\\/]/).pop() || root,
          libraryRoots: [...new Set([...get().libraryRoots, root])],
          scan: { active: false, done: 0, total: 0, current: "" },
          status: `Imported ${fresh.length} tracks from ${root}`,
        });
        get().recomputeDupes();
        if (!get().queue.length) set({ queue: get().tracks.filter((t) => !t.quarantined).map((t) => t.id) });
        if (get().settings.autoAnalyze) get().analyzeAll();
      },

      importNativePaths: async (paths, diskMode = false) => {
        if (!native || !paths.length) return;
        const out: Track[] = [];
        for (const path of paths) {
          const name = path.split(/[\\/]/).pop() || path;
          const st = await native.stat(path);
          try {
            const t = await parseFile(await nativeFile({ path, name, folder: path.slice(0, path.length - name.length - 1), size: st?.size || 0, mtime: st?.mtime || Date.now() }), path);
            out.push(t);
          } catch { /* skip */ }
        }
        if (!out.length) return;
        set({ tracks: [...get().tracks, ...out] });
        if (diskMode) { await get().playTrack(out[0].id, out.map((t) => t.id)); set({ status: `Disk mode: ${out.length} file(s)` }); }
        else { get().recomputeDupes(); set({ status: `Added ${out.length} tracks` }); }
      },

      reconnectLibrary: async () => {
        if (native) { for (const root of get().libraryRoots) await get().importNativeFolder(root); if (!get().libraryRoots.length) get().importFolder(); return; }
        const h = await loadDirHandle();
        if (!h) { get().importFolder(); return; }
        const perm = await (h as FileSystemDirectoryHandle & { requestPermission: (o: { mode: string }) => Promise<string> }).requestPermission({ mode: "read" });
        if (perm !== "granted") return;
        set({ scan: { active: true, done: 0, total: 0, current: "" } });
        const real = await scanDirectoryHandle(h, (done, total, current) => set({ scan: { active: true, done, total, current } }));
        const existing = new Set(get().tracks.map((t) => t.path));
        const fresh = real.filter((t) => !existing.has(t.path)).map((t) => { const u = get().userData[udKey(t)]; return u ? { ...t, ...u } : t; });
        set({ tracks: [...get().tracks, ...fresh], libraryName: h.name, scan: { active: false, done: 0, total: 0, current: "" }, status: `Reconnected ${h.name}` });
        get().recomputeDupes();
        if (get().settings.autoAnalyze) get().analyzeAll();
      },

      clearLibrary: () => { set({ tracks: buildDemoLibrary(), queue: [], currentId: null, playing: false }); getEngine().stop(); get().recomputeDupes(); },

      playTrack: async (id, contextIds) => {
        const s = get();
        const t = s.tracks.find((x) => x.id === id); if (!t) return;
        const prevId = s.currentId;
        const e = getEngine();
        if (prevId && prevId !== id) { const p = s.tracks.find((x) => x.id === prevId); if (p && e.position > Math.min(240, p.duration / 2)) s.scrobble(p); }
        const queue = contextIds ?? (s.queue.includes(id) ? s.queue : [...s.queue, id]);
        set({ queue, currentId: id, playing: true, history: prevId && prevId !== id ? [...s.history, prevId].slice(-100) : s.history, resumePos: 0, status: `Playing ${t.title}` });
        try { await e.play(t, 0); }
        catch (err) { set({ status: String((err as Error).message || err), playing: false }); return; }
        afterTrackChange(t);
      },

      togglePlay: async () => {
        const s = get(); const e = getEngine();
        if (e.currentTrack) { if (e.isPaused) { await e.resume(); set({ playing: true }); } else { e.pause(); set({ playing: false }); } return; }
        const id = s.currentId || s.queue[0] || s.tracks.find((t) => !t.quarantined)?.id;
        if (!id) return;
        const t = s.tracks.find((x) => x.id === id)!;
        set({ currentId: id, playing: true });
        try { await e.play(t, s.resumePos || 0); afterTrackChange(t); } catch (err) { set({ status: String((err as Error).message || err), playing: false }); }
      },

      next: async (manual = true) => {
        const s = get();
        const nid = s.computeNextId();
        if (!nid) { set({ status: "End of queue" }); return; }
        if (manual && s.currentId) { const p = s.tracks.find((x) => x.id === s.currentId); const e = getEngine(); if (p && e.position > Math.min(240, p.duration / 2)) s.scrobble(p); }
        await get().playTrack(nid);
      },
      prev: async () => {
        const s = get(); const e = getEngine();
        if (e.position > 3) { e.seek(0); return; }
        const h = s.history.slice();
        const pid = h.pop();
        if (pid && s.tracks.some((t) => t.id === pid)) { set({ history: h }); await get().playTrack(pid); }
        else {
          const order = s.shuffle ? seededShuffle(s.queue, s.shuffleSeed) : s.queue;
          const i = order.indexOf(s.currentId || "");
          if (i > 0) await get().playTrack(order[i - 1]);
        }
      },
      seek: (pos) => getEngine().seek(pos),
      stop: () => { getEngine().stop(); set({ playing: false, resumePos: 0 }); },
      setVolume: (v) => { set({ volume: v }); getEngine().setVolume(v); },
      toggleShuffle: () => { set({ shuffle: !get().shuffle }); get().syncNext(); },
      setShuffleSeed: (shuffleSeed) => { set({ shuffleSeed }); get().syncNext(); },
      cycleRepeat: () => { const order: RepeatMode[] = ["off", "all", "one", "album"]; set({ repeat: order[(order.indexOf(get().repeat) + 1) % 4] }); get().syncNext(); },
      setRepeat: (repeat) => { set({ repeat }); get().syncNext(); },
      toggleKeyMix: () => { set({ keyMix: !get().keyMix }); get().syncNext(); },

      computeNextId: (fromId) => {
        const s = get();
        const cur = fromId === undefined ? s.currentId : fromId;
        if (!cur) return s.queue[0] || null;
        if (s.repeat === "one") return cur;
        const order = s.shuffle ? seededShuffle(s.queue, s.shuffleSeed) : s.queue;
        const i = order.indexOf(cur);
        const curT = s.tracks.find((t) => t.id === cur);
        if (s.keyMix && curT) {
          const cands = s.suggestKeyMix();
          const unplayed = cands.filter((t) => !s.history.includes(t.id) && t.id !== cur);
          if (unplayed.length) return unplayed[0].id;
        }
        if (s.repeat === "album" && curT) {
          const albumIds = order.filter((id) => { const t = s.tracks.find((x) => x.id === id); return t && t.album === curT.album && t.albumArtist === curT.albumArtist; });
          const ai = albumIds.indexOf(cur);
          return albumIds[(ai + 1) % albumIds.length] || cur;
        }
        if (i >= 0 && i + 1 < order.length) return order[i + 1];
        if (s.repeat === "all" && order.length) return order[0];
        return null;
      },
      syncNext: () => {
        const s = get();
        if (!s.dsp.gapless && !s.dsp.crossfade) { getEngine().setNext(null); return; }
        const nid = s.computeNextId();
        const t = nid ? s.tracks.find((x) => x.id === nid) || null : null;
        getEngine().setNext(t && t.id !== s.currentId ? t : t && s.repeat === "one" ? t : null);
      },
      suggestKeyMix: () => {
        const s = get();
        const cur = s.tracks.find((t) => t.id === s.currentId);
        if (!cur) return [];
        const ck = cur.key || cur.analyzedKey || "";
        const cb = cur.bpm ?? cur.analyzedBpm ?? 0;
        return s.queue.map((id) => s.tracks.find((t) => t.id === id)!).filter((t) => t && t.id !== cur.id && camelotCompatible(ck, t.key || t.analyzedKey || ""))
          .sort((a, b) => Math.abs((a.bpm ?? a.analyzedBpm ?? cb) - cb) - Math.abs((b.bpm ?? b.analyzedBpm ?? cb) - cb));
      },
      enqueue: (ids, where) => {
        const s = get();
        const q = s.queue.slice();
        if (where === "next") { const i = q.indexOf(s.currentId || ""); q.splice(i + 1, 0, ...ids); } else q.push(...ids);
        set({ queue: q, status: `${ids.length} track(s) queued ${where}` }); get().syncNext();
      },
      removeFromQueue: (index) => { const q = get().queue.slice(); q.splice(index, 1); set({ queue: q }); get().syncNext(); },
      moveInQueue: (from, to) => { const q = get().queue.slice(); const [x] = q.splice(from, 1); q.splice(to, 0, x); set({ queue: q }); get().syncNext(); },
      clearQueue: () => { set({ queue: get().currentId ? [get().currentId!] : [] }); get().syncNext(); },
      setView: (view) => set({ view }),
      setFilter: (filter) => set({ filter, selected: [] }),
      setSearch: (search) => set({ search }),
      setSort: (c) => { const s = get(); set(s.sortCol === c ? { sortDir: s.sortDir === "asc" ? "desc" : "asc" } : { sortCol: c, sortDir: "asc" }); },
      toggleCol: (c) => { const v = get().visibleCols; set({ visibleCols: v.includes(c) ? v.filter((x) => x !== c) : [...v, c] }); },
      setSelected: (selected) => set({ selected }),
      setDsp: (p) => { const dsp = { ...get().dsp, ...p }; set({ dsp }); getEngine().applyDsp(dsp); get().syncNext(); },
      setEqBand: (i, v) => { const eq = get().dsp.eq.slice(); eq[i] = v; get().setDsp({ eq }); },
      applyEqPreset: (name) => { const p = EQ_PRESETS[name]; if (p) get().setDsp({ eq: p.slice(), eqOn: true }); },
      resetDsp: () => get().setDsp({ ...DEFAULT_DSP }),

      updateTrack: (id, patch) => {
        set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, ...patch, qualityScore: patch.codec || patch.bitrate ? qualityScore({ ...t, ...patch }) : t.qualityScore } : t)) });
        const t = get().tracks.find((x) => x.id === id);
        if (t && ("rating" in patch || "playCount" in patch || "trim" in patch || "lastPlayed" in patch)) {
          set({ userData: { ...get().userData, [udKey(t)]: { rating: t.rating, playCount: t.playCount, lastPlayed: t.lastPlayed, trim: t.trim } } });
        }
        if (t && "trim" in patch) getEngine().applyDsp(get().dsp);
      },
      setRating: (id, rating) => get().updateTrack(id, { rating }),
      setTrim: (id, trim) => get().updateTrack(id, { trim }),

      createPlaylist: (name, ids = [], smart) => { const id = uid(); set({ playlists: [...get().playlists, { id, name, trackIds: ids, smart, smartMatch: "all" }] }); return id; },
      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id), filter: { kind: "all" } }),
      renamePlaylist: (id, name) => set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name } : p)) }),
      addToPlaylist: (pid, ids) => set({ playlists: get().playlists.map((p) => (p.id === pid ? { ...p, trackIds: [...p.trackIds, ...ids.filter((i) => !p.trackIds.includes(i))] } : p)), status: `Added ${ids.length} to playlist` }),
      removeFromPlaylist: (pid, ids) => set({ playlists: get().playlists.map((p) => (p.id === pid ? { ...p, trackIds: p.trackIds.filter((i) => !ids.includes(i)) } : p)) }),
      updateSmart: (pid, rules, match) => set({ playlists: get().playlists.map((p) => (p.id === pid ? { ...p, smart: rules, smartMatch: match } : p)) }),
      playlistTracks: (pid) => {
        const s = get(); const p = s.playlists.find((x) => x.id === pid); if (!p) return [];
        if (p.smart) return s.tracks.filter((t) => !t.quarantined && matchesSmart(t, p.smart!, p.smartMatch || "all"));
        return p.trackIds.map((id) => s.tracks.find((t) => t.id === id)!).filter(Boolean);
      },

      recomputeDupes: () => {
        const s = get();
        const groups = new Map<string, Track[]>();
        for (const t of s.tracks) { const k = dupKey(t); (groups.get(k) || groups.set(k, []).get(k)!).push(t); }
        const restored = new Set(s.tracks.filter((t) => (t as Track & { _restored?: boolean })._restored).map((t) => t.id));
        const tracks = s.tracks.map((t) => {
          const g = groups.get(dupKey(t))!;
          if (g.length < 2) return { ...t, dupGroup: null, quarantined: false };
          const best = g.reduce((a, b) => (b.qualityScore > a.qualityScore ? b : a));
          const q = s.settings.autoQuarantine && best.id !== t.id && !restored.has(t.id);
          return { ...t, dupGroup: dupKey(t), quarantined: q };
        });
        set({ tracks });
      },
      restore: (id) => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, quarantined: false, _restored: true } as Track : t)), status: "Restored from quarantine" }),
      mergeGroup: (group) => {
        const s = get();
        const g = s.tracks.filter((t) => t.dupGroup === group);
        const best = g.reduce((a, b) => (b.qualityScore > a.qualityScore ? b : a));
        const losers = g.filter((t) => t.id !== best.id);
        const merged = { ...best, playCount: g.reduce((n, t) => n + t.playCount, 0), rating: Math.max(...g.map((t) => t.rating)), dupGroup: null, quarantined: false };
        for (const l of losers) get().upgradeTo(l.id, best.id);
        set({ tracks: get().tracks.filter((t) => !losers.some((l) => l.id === t.id)).map((t) => (t.id === best.id ? merged : t)), status: `Merged ${g.length} sources → ${best.codec}` });
      },
      upgradeTo: (fromId, toId) => {
        const s = get();
        const swap = (ids: string[]) => ids.map((i) => (i === fromId ? toId : i));
        set({ queue: swap(s.queue), playlists: s.playlists.map((p) => ({ ...p, trackIds: swap(p.trackIds) })), status: "Upgraded to best source" });
        if (s.currentId === fromId) { const pos = getEngine().position; const t = s.tracks.find((x) => x.id === toId); if (t) { set({ currentId: toId }); getEngine().play(t, pos).then(() => afterTrackChange(t)); } }
        else get().syncNext();
      },
      removeTracks: (ids) => { set({ tracks: get().tracks.filter((t) => !ids.includes(t.id)), queue: get().queue.filter((i) => !ids.includes(i)), selected: [] }); get().syncNext(); },

      analyzeTrack: async (id) => {
        const t = get().tracks.find((x) => x.id === id); if (!t) return;
        try {
          const buf = await getEngine().decode(t);
          const { gain, peak, energy } = analyzeLoudness(buf);
          const wf = waveformPeaks(buf);
          const patch: Partial<Track> = { analyzedGain: gain, analyzedPeak: peak, waveform: wf, energy };
          if (!t.key) { const k = detectKey(buf); if (k.confidence > 0.2) patch.analyzedKey = k.key; }
          if (!t.bpm) patch.analyzedBpm = detectBpm(buf);
          get().updateTrack(id, patch);
          if (get().currentId === id) getEngine().applyDsp(get().dsp);
        } catch (e) { console.warn("analyze", e); }
      },
      analyzeAll: () => {
        const s = get();
        const pending = s.tracks.filter((t) => t.analyzedGain === null).map((t) => t.id);
        if (!pending.length || s.analyzing) return;
        set({ analyzing: true, analysisQueue: pending });
        const run = async () => {
          while (get().analysisQueue.length) {
            const [id, ...rest] = get().analysisQueue; set({ analysisQueue: rest });
            await get().analyzeTrack(id);
            await new Promise((r) => setTimeout(r, 30));
          }
          set({ analyzing: false, status: "Loudness / key / BPM analysis complete" });
        };
        run();
      },

      fetchLyrics: async (id) => {
        const t = get().tracks.find((x) => x.id === id); if (!t) return;
        set({ status: `Searching LRCLIB for "${t.title}"…` });
        const r = await fetchLrclib(t.artist.split(";")[0].trim(), t.title, t.album, t.duration);
        if (r && (r.synced || r.plain)) { get().updateTrack(id, { lyrics: r.synced || plainToLines(r.plain!, t.duration), lyricsSource: "lrclib" }); set({ status: `Lyrics found on LRCLIB (#${r.id})` }); }
        else set({ status: "No lyrics on LRCLIB" });
      },

      scrobble: async (t) => {
        const s = get();
        const entry: ScrobbleEntry = { id: uid(), time: Date.now(), title: t.title, artist: t.artist, mbid: t.mbid, isrc: t.isrc, status: "queued" };
        set({ scrobbles: [entry, ...s.scrobbles].slice(0, 200) });
        if (!s.settings.listenBrainzToken) return;
        try {
          const res = await fetch("https://api.listenbrainz.org/1/submit-listens", {
            method: "POST", headers: { Authorization: "Token " + s.settings.listenBrainzToken, "Content-Type": "application/json" },
            body: JSON.stringify({ listen_type: "single", payload: [{ listened_at: Math.floor(Date.now() / 1000), track_metadata: { artist_name: t.artist, track_name: t.title, release_name: t.album, additional_info: { media_player: "SaltBee", submission_client: "SaltBee", duration_ms: Math.round(t.duration * 1000), ...(t.mbid ? { recording_mbid: t.mbid } : {}), ...(t.isrc ? { isrc: t.isrc } : {}) } } }] }),
          });
          set({ scrobbles: get().scrobbles.map((e) => (e.id === entry.id ? { ...e, status: res.ok ? "sent" : "failed" } : e)) });
        } catch { set({ scrobbles: get().scrobbles.map((e) => (e.id === entry.id ? { ...e, status: "failed" } : e)) }); }
      },

      cliAction: async (action, t) => {
        const url = get().settings.cliBridgeUrl.replace(/\/$/, "");
        set({ status: `CLI → ${action}: ${t.path}` });
        try {
          const res = await fetch(`${url}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, path: t.path, isrc: t.isrc, mbid: t.mbid, title: t.title, artist: t.artist, album: t.album }) });
          set({ status: res.ok ? `CLI ${action} done for ${t.title}` : `CLI bridge returned ${res.status}` });
        } catch { set({ status: `CLI bridge not reachable at ${url} — start your CLI daemon (native build launches it automatically)` }); }
      },

      setSetting: (k, v) => {
        set({ settings: { ...get().settings, [k]: v } });
        if (k === "matchSourceRate") getEngine().matchSourceRate = v as boolean;
        if (k === "outputDevice") getEngine().setSink(v as string);
        if (k === "autoQuarantine") get().recomputeDupes();
      },
      setSleep: (minutes) => {
        if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
        if (minutes === null) { set({ sleepEndsAt: null, status: "Sleep timer cancelled" }); return; }
        const endsAt = Date.now() + minutes * 60000;
        set({ sleepEndsAt: endsAt, status: `Sleep in ${minutes} min` });
        sleepTimer = window.setTimeout(() => {
          const e = getEngine(); const v = e.volumeValue; let step = 0;
          const iv = setInterval(() => { step++; e.setVolume(v * (1 - step / 20)); if (step >= 20) { clearInterval(iv); e.pause(); set({ playing: false, sleepEndsAt: null }); e.setVolume(v); } }, 250);
        }, minutes * 60000);
      },
      toggleDock: () => {
        const d = !get().docked;
        set({ docked: d, dockExpanded: false, dockRevealed: true });
        native?.dock(d);
        if (d) native?.dockAutoHide(get().settings.dockAutoHide);
        set({ status: d ? "Docked to the top edge — move the mouse to the top of the screen to call it down" : "Undocked" });
      },
      setDockExpanded: (dockExpanded) => { set({ dockExpanded }); native?.dockExpand(dockExpanded); },
      setDockAutoHide: (v) => { get().setSetting("dockAutoHide", v); native?.dockAutoHide(v); },
      setGroupBy: (groupBy) => set({ groupBy }),
      setArtistView: (artistView) => set({ artistView }),
      retheme: () => {
        const s = get();
        const { themeMode, adaptiveTheme } = s.settings;
        const cur = s.tracks.find((t) => t.id === s.currentId);
        if (!adaptiveTheme || themeMode === "custom") { const p = staticPalette(themeMode === "custom" ? "adaptive" : themeMode); applyPalette(p); set({ palette: p }); return; }
        if (cur?.coverUrl) extractPalette(cur.coverUrl, themeMode).then((p) => { applyPalette(p); set({ palette: p }); });
        else { const p = staticPalette(themeMode); applyPalette(p); set({ palette: p }); }
      },
      openNowPlaying: (tab) => set({ nowPlayingOpen: true, ...(tab ? { nowPlayingTab: tab } : {}) }),
      closeNowPlaying: () => set({ nowPlayingOpen: false }),
      refreshOutputs: async () => {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          set({ outputs: devs.filter((d) => d.kind === "audiooutput").map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` })) });
        } catch { /* */ }
      },
    }),
    {
      name: "saltbee-v1",
      partialize: (s) => ({
        playlists: s.playlists, queue: s.queue, currentId: s.currentId, shuffle: s.shuffle, shuffleSeed: s.shuffleSeed, repeat: s.repeat, keyMix: s.keyMix,
        view: s.view, sortCol: s.sortCol, sortDir: s.sortDir, visibleCols: s.visibleCols, dsp: s.dsp, volume: s.volume, docked: s.docked, rightPanel: s.rightPanel, groupBy: s.groupBy, artistView: s.artistView,
        settings: s.settings, userData: s.userData, libraryRoots: s.libraryRoots, resumePos: s.resumePos, scrobbles: s.scrobbles.slice(0, 50), nowPlayingTab: s.nowPlayingTab,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<State>), dsp: { ...DEFAULT_DSP, ...((persisted as Partial<State>)?.dsp || {}) } }),
    },
  ),
);
