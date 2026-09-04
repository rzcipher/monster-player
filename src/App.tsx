import { memo, useEffect, useState } from "react";
import { useStore, getEngine } from "./store";
import { useTracked } from "./lib/tracked";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import TrackTable from "./components/TrackTable";
import CoverGrid from "./components/CoverGrid";
import ArtistsView from "./components/ArtistsView";
import CoverBackdrop from "./components/CoverBackdrop";
import { native } from "./lib/native";
import { useDesktopLyrics } from "./lib/desktopLyrics";
import PlayerBar from "./components/PlayerBar";
import RightPanel from "./components/RightPanel";
import NowPlaying from "./components/NowPlaying";
import SoundEffects from "./components/SoundEffects";
import DockBar from "./components/DockBar";
import { TagEditor, SmartEditor, SettingsDialog, QuarantineDialog, SleepDialog, PromptDialog } from "./components/Dialogs";

/**
 * Memoised so that store writes which don't change `view` (status text, resume
 * position, scan ticks) can't force the sidebar + table + panel to re-render.
 */
const MainArea = memo(function MainArea() {
  const view = useStore((s) => s.view);
  return (
    <div className="flex-1 flex min-h-0">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 relative">
        <CoverBackdrop />
        <div className="relative flex-1 flex flex-col min-h-0">
          {view === "table" ? <TrackTable /> : view === "grid" ? <CoverGrid /> : <ArtistsView />}
        </div>
      </main>
      <RightPanel />
    </div>
  );
});

/**
 * Scan progress ticks several times a second. Kept in its own component with a
 * narrow subscription so those ticks repaint this pill and nothing else.
 */
function ScanProgress() {
  const scan = useStore((s) => s.scan);
  if (!scan.active) return null;
  return (
    <div className="fixed bottom-[calc(var(--player-h)+8px)] left-1/2 -translate-x-1/2 z-[90] glass border border-subtle rounded-full px-4 py-1.5 text-[12px] flex items-center gap-3">
      <span className="w-2 h-2 rounded-full accent-bg pulse-dot" />Scanning {scan.done}/{scan.total || "…"} <span className="text-muted truncate max-w-[300px]">{scan.current}</span>
    </div>
  );
}

export default function App() {
  const s = useTracked();
  const [dragging, setDragging] = useState(false);
  useDesktopLyrics();

  useEffect(() => { s.init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- native shell: global media keys, tray, dock state, file associations ----
  useEffect(() => {
    if (!native) return;
    const st = () => useStore.getState();
    const offs = [
      native.onMedia((k) => {
        if (k === "playpause") st().togglePlay();
        else if (k === "next") st().next(true);
        else if (k === "prev") st().prev();
        else if (k === "stop") st().stop();
        else if (k === "lyrics") st().openNowPlaying("lyrics");
      }),
      native.onDockState((d) => useStore.setState({ docked: d.on, dockExpanded: d.expanded, dockRevealed: d.revealed })),
      native.onDockRevealed((revealed) => useStore.setState({ dockRevealed: revealed })),
      native.onOpenFiles((files) => st().importNativePaths(files, true)),
      native.onScanProgress((p) => useStore.setState({ scan: { ...st().scan, active: true, done: p.done, current: p.current } })),
      // window minimised/hidden → hand the decoded-PCM cache back to the OS
      native.onTrimMemory(() => {
        getEngine().releaseCache();
        (window as Window & { gc?: () => void }).gc?.();
      }),
    ];
    // restore dock/always-on-top preferences chosen in a previous session
    const s0 = st();
    if (s0.docked) { native.dock(true); native.dockAutoHide(s0.settings.dockAutoHide); }
    if (s0.settings.alwaysOnTop && !s0.docked) native.pin(true);
    return () => offs.forEach((f) => f());
  }, []);

  // Salt Player look: roundness / type scale / motion follow the settings live
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--radius", s.settings.cornerRadius + "px");
    r.setProperty("--font-scale", String(s.settings.fontScale));
    document.documentElement.classList.toggle("no-motion", !s.settings.animations);
  }, [s.settings.cornerRadius, s.settings.fontScale, s.settings.animations]);

  // re-theme whenever the theming preferences change
  useEffect(() => { s.retheme(); }, [s.settings.themeMode, s.settings.adaptiveTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard shortcuts
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const st = useStore.getState();
      if (e.code === "Space") { e.preventDefault(); st.togglePlay(); }
      else if (e.key === "ArrowRight") st.seek(getEngine().position + (e.shiftKey ? 30 : 5));
      else if (e.key === "ArrowLeft") st.seek(getEngine().position - (e.shiftKey ? 30 : 5));
      else if (e.key === "ArrowUp" && e.ctrlKey) st.setVolume(Math.min(1, st.volume + 0.05));
      else if (e.key === "ArrowDown" && e.ctrlKey) st.setVolume(Math.max(0, st.volume - 0.05));
      else if (e.key.toLowerCase() === "n" && e.ctrlKey) st.next(true);
      else if (e.key.toLowerCase() === "p" && e.ctrlKey) st.prev();
      else if (e.key.toLowerCase() === "l" && !e.ctrlKey) st.nowPlayingOpen && st.nowPlayingTab === "lyrics" ? st.closeNowPlaying() : st.openNowPlaying("lyrics");
      else if (e.key.toLowerCase() === "e" && e.ctrlKey) { e.preventDefault(); st.set({ fxOpen: true }); }
      else if (e.key.toLowerCase() === "f" && e.ctrlKey) { e.preventDefault(); (document.querySelector('input[placeholder^="Quick search"]') as HTMLInputElement | null)?.focus(); }
      else if (e.key.toLowerCase() === "d" && e.ctrlKey) { e.preventDefault(); st.toggleDock(); }
      else if (e.key === "Enter" && st.selected.length === 1) st.playTrack(st.selected[0]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // media keys / OS media session
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const st = () => useStore.getState();
    ms.setActionHandler("play", () => st().togglePlay());
    ms.setActionHandler("pause", () => st().togglePlay());
    ms.setActionHandler("nexttrack", () => st().next(true));
    ms.setActionHandler("previoustrack", () => st().prev());
    ms.setActionHandler("seekto", (d) => d.seekTime !== undefined && st().seek(d.seekTime));
  }, []);

  // drag & drop = disk mode
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files.length) useStore.getState().importFiles(e.dataTransfer.files, !e.shiftKey); };
    window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, []);

  return (
    <div className="h-full flex flex-col themed-bg text-fg overflow-hidden">
      {s.docked ? (
        <>
          <DockBar />
          {s.dockExpanded ? (
            <div className="flex-1 flex flex-col min-h-0 border-b border-subtle shadow-2xl fade-in">
              <MainArea />
              <PlayerBar />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-[12px] select-none relative" style={{ background: "repeating-linear-gradient(45deg, transparent 0 12px, rgba(255,255,255,0.015) 12px 24px)" }}>
              <div className="text-center max-w-lg px-6">
                <div className="text-[15px] text-fg mb-1.5">Docked to the top edge — AIMP style</div>
                <div className="leading-relaxed">
                  In the packaged app this area is your desktop: the window shrinks to the bar height, stays always-on-top and,
                  with auto-hide on, parks just off-screen. Sweep the pointer to the very top of the display and SaltBee slides
                  back down. Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-fg">▾</kbd> to drop the library,
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-fg mx-1">Ctrl+D</kbd> to undock, or
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-fg mx-1">Ctrl+Alt+D</kbd> from anywhere in Windows.
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <TitleBar />
          <MainArea />
          <PlayerBar />
        </>
      )}

      {s.nowPlayingOpen && <NowPlaying />}
      {s.fxOpen && <SoundEffects />}
      {s.tagEditorId && <TagEditor key={s.tagEditorId} />}
      {s.smartEditorId && <SmartEditor key={s.smartEditorId} />}
      {s.settingsOpen && <SettingsDialog />}
      {s.quarantineOpen && <QuarantineDialog />}
      {s.sleepOpen && <SleepDialog />}
      {s.promptReq && <PromptDialog key={s.promptReq.title} />}
      {dragging && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center pointer-events-none fade-in">
          <div className="glass border border-subtle rounded-2xl px-10 py-8 text-center">
            <div className="text-2xl font-semibold mb-1">Drop to play (disk mode)</div>
            <div className="text-muted">FLAC · ALAC · MP3 · AAC · Opus · Vorbis · WAV · AIFF · CUE — hold Shift to import into the library instead</div>
          </div>
        </div>
      )}
      <ScanProgress />
    </div>
  );
}
