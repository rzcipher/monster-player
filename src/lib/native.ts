/**
 * Bridge to the Electron main process.
 *
 * Everything here degrades gracefully: when SaltBee runs in a plain browser
 * (`npm run dev`) `native` is null and the app falls back to the File System
 * Access API. In the packaged .exe we get real folder scanning, global media
 * keys, tray control and the auto-hiding dock.
 */
export interface NativeFile { path: string; name: string; folder: string; size: number; mtime: number }
export interface DockState { on: boolean; expanded: boolean; autoHide: boolean; revealed: boolean }
export type MediaKey = "playpause" | "next" | "prev" | "stop" | "lyrics";

export interface NativeApi {
  isElectron: true;
  platform: string;
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onWindowState(cb: (s: { maximized: boolean }) => void): () => void;
  dock(on: boolean): void;
  dockExpand(on: boolean): void;
  dockAutoHide(on: boolean): void;
  pin(on: boolean): void;
  setOpacity(v: number): void;
  onDockState(cb: (s: DockState) => void): () => void;
  onDockRevealed(cb: (revealed: boolean) => void): () => void;
  pickFolder(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  scan(root: string): Promise<NativeFile[]>;
  onScanProgress(cb: (p: { done: number; current: string }) => void): () => void;
  readFile(path: string): Promise<ArrayBuffer>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; mtime: number } | null>;
  reveal(path: string): void;
  openExternal(url: string): void;
  toggleLyricsWindow(on: boolean): void;
  pushLyrics(payload: {
    line?: string; sub?: string; title?: string; artist?: string;
    sweep?: number; progress?: number; accent?: string; accent2?: string; fontSize?: number;
  }): void;
  onLyricsClosed(cb: () => void): () => void;
  cli(payload: { action: string; path: string; isrc?: string; mbid?: string }): Promise<{ code: number; out: string }>;
  onMedia(cb: (key: MediaKey) => void): () => void;
  onOpenFiles(cb: (files: string[]) => void): () => void;
  onTrimMemory(cb: () => void): () => void;
  reclaimedBytes(): Promise<number>;
  diskUsage(): Promise<{ path: string; bytes: number }>;
}

declare global {
  interface Window { saltbee?: NativeApi }
}

export const native: NativeApi | null =
  typeof window !== "undefined" && window.saltbee?.isElectron ? window.saltbee : null;

export const isNative = !!native;

/**
 * Read a file from disk as raw bytes.
 *
 * IMPORTANT: do **not** wrap this in `new File(...)` / `new Blob(...)` and keep
 * the result on a Track. Every Blob is registered with Chromium's blob store,
 * which spills to disk under %APPDATA%/SaltBee/blob_storage once it exceeds its
 * in-memory quota — that's how a 1000-track import wrote ~11 GB of chunk files.
 * Parse the bytes, then let them go.
 */
export async function nativeBytes(f: Pick<NativeFile, "path">): Promise<Uint8Array> {
  return new Uint8Array(await native!.readFile(f.path));
}

/** Open a URL — external browser under Electron, new tab in the web build. */
export function openUrl(url: string) {
  if (native) native.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
