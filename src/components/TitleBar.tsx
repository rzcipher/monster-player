import { useState, useRef, useEffect } from "react";
import { Search, Minus, Square, X, PanelTop, Sliders, Settings2, FolderOpen, FileAudio, RefreshCw, Shuffle, Repeat, Timer, Music2, ShieldAlert, Activity, LayoutGrid, Table2, Disc3, Users, Group, Palette } from "lucide-react";
import { useTracked } from "../lib/tracked";
import type { MenuItem } from "./ui";
import { native } from "../lib/native";
import { GROUP_OPTIONS } from "../lib/grouping";

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); window.addEventListener("mousedown", h); return () => window.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} className="relative no-drag">
      <button onClick={() => setOpen(!open)} className={`px-2.5 h-7 rounded text-[12px] hover:bg-white/10 ${open ? "bg-white/10" : ""}`}>{label}</button>
      {open && (
        <div className="absolute left-0 top-full mt-1 glass border border-subtle rounded-lg py-1 min-w-[240px] shadow-2xl z-[120] fade-in">
          {items.map((it, i) => it.sep ? <div key={i} className="my-1 border-t border-subtle" /> : (
            <div key={i} className={`menu-item flex items-center gap-2 ${it.disabled ? "opacity-40 pointer-events-none" : ""}`} onClick={() => { it.onClick?.(); setOpen(false); }}>
              <span className="w-4 inline-flex justify-center opacity-80">{it.icon}</span>{it.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TitleBar() {
  const s = useTracked();
  const openFiles = async (disk: boolean) => {
    if (native) { const paths = await native.pickFiles(); if (paths.length) s.importNativePaths(paths, disk); return; }
    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = "audio/*,.flac,.m4a,.alac,.mp3,.ogg,.opus,.wav,.aiff,.aif,.dsf,.dff,.ape,.wv,.cue";
    inp.onchange = () => inp.files && s.importFiles(inp.files, disk);
    inp.click();
  };
  const isElectron = !!native;
  return (
    <div className="drag-region flex items-center gap-1 px-2 h-[var(--titlebar-h)] shrink-0 border-b border-subtle themed-surface select-none">
      <div className="flex items-center gap-2 pr-2 mr-1 border-r border-subtle">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white font-black text-[13px]" style={{ background: "linear-gradient(135deg, var(--c-accent), var(--c-accent2))" }}>S</div>
        <span className="font-bold tracking-tight text-[14px]">Salt<span className="accent-text">Bee</span></span>
      </div>
      <Menu label="File" items={[
        { label: "Open folder… (library)", icon: <FolderOpen size={14} />, onClick: s.importFolder },
        { label: "Add files…", icon: <FileAudio size={14} />, onClick: () => openFiles(false) },
        { label: "Play files without importing (disk mode)", icon: <Disc3 size={14} />, onClick: () => openFiles(true) },
        { label: "Reconnect library folder", icon: <RefreshCw size={14} />, onClick: s.reconnectLibrary },
        { sep: true },
        { label: "Analyze library (loudness / key / BPM)", icon: <Activity size={14} />, onClick: s.analyzeAll },
        { label: "Reset to demo library", onClick: s.clearLibrary },
      ]} />
      <Menu label="Playback" items={[
        { label: `Shuffle ${s.shuffle ? "✓" : ""}  (seed: ${s.shuffleSeed})`, icon: <Shuffle size={14} />, onClick: s.toggleShuffle },
        { label: `Repeat: ${s.repeat}`, icon: <Repeat size={14} />, onClick: s.cycleRepeat },
        { label: `Key-mix mode ${s.keyMix ? "✓" : ""} (next within ±1 Camelot)`, icon: <Music2 size={14} />, onClick: s.toggleKeyMix },
        { sep: true },
        { label: "Sleep timer…", icon: <Timer size={14} />, onClick: () => s.set({ sleepOpen: true }) },
        { label: "Stop", onClick: s.stop },
      ]} />
      <Menu label="View" items={[
        { label: `Track table ${s.view === "table" ? "✓" : ""}`, icon: <Table2 size={14} />, onClick: () => s.setView("table") },
        { label: `Album grid ${s.view === "grid" ? "✓" : ""}`, icon: <LayoutGrid size={14} />, onClick: () => s.setView("grid") },
        { label: `Artists — MusicBee style ${s.view === "artists" ? "✓" : ""}`, icon: <Users size={14} />, onClick: () => s.setView("artists") },
        { sep: true },
        { label: "Group tracks by…", icon: <Group size={14} />, sub: GROUP_OPTIONS.map((g) => ({ label: `${g.label}${s.groupBy === g.key ? "  ✓" : ""}`, onClick: () => s.setGroupBy(g.key) })) },
        { sep: true },
        { label: "Now Playing (Salt view)", icon: <Disc3 size={14} />, onClick: () => s.openNowPlaying("info") },
        { label: "Lyrics", onClick: () => s.openNowPlaying("lyrics") },
        { sep: true },
        { label: `Dock to top of screen ${s.docked ? "✓" : ""}`, icon: <PanelTop size={14} />, onClick: s.toggleDock },
        { label: `Dock auto-hide (call down on hover) ${s.settings.dockAutoHide ? "✓" : ""}`, icon: <PanelTop size={14} />, onClick: () => s.setDockAutoHide(!s.settings.dockAutoHide) },
        { label: `Always on top ${s.settings.alwaysOnTop ? "✓" : ""}`, icon: <PanelTop size={14} />, onClick: () => { const v = !s.settings.alwaysOnTop; s.setSetting("alwaysOnTop", v); native?.pin(v); } },
        { label: `Right panel: ${s.rightPanel}`, onClick: () => s.set({ rightPanel: s.rightPanel === "queue" ? "playlists" : s.rightPanel === "playlists" ? "identity" : s.rightPanel === "identity" ? "none" : "queue" }) },
      ]} />
      <Menu label="Theme" items={[
        { label: `Adaptive colour from cover ${s.settings.adaptiveTheme ? "✓" : ""}`, icon: <Palette size={14} />, onClick: () => s.setSetting("adaptiveTheme", !s.settings.adaptiveTheme) },
        { sep: true },
        ...(["adaptive", "adaptiveLight", "midnight", "monochrome"] as const).map((m) => ({
          label: `${{ adaptive: "Adaptive dark", adaptiveLight: "Adaptive light", midnight: "Midnight (OLED)", monochrome: "Monochrome" }[m]}${s.settings.themeMode === m ? "  ✓" : ""}`,
          onClick: () => s.setSetting("themeMode", m),
        })),
        { sep: true },
        { label: `Blurred cover backdrop ${s.settings.coverBackdrop ? "✓" : ""}`, onClick: () => s.setSetting("coverBackdrop", !s.settings.coverBackdrop) },
        { label: `Karaoke lyric sweep ${s.settings.karaoke ? "✓" : ""}`, onClick: () => s.setSetting("karaoke", !s.settings.karaoke) },
        { label: `Animations ${s.settings.animations ? "✓" : ""}`, onClick: () => s.setSetting("animations", !s.settings.animations) },
      ]} />
      <Menu label="Tools" items={[
        { label: "Sound Effects (DSP)…", icon: <Sliders size={14} />, onClick: () => s.set({ fxOpen: true }) },
        { label: "Quarantine / duplicates…", icon: <ShieldAlert size={14} />, onClick: () => s.set({ quarantineOpen: true }) },
        { label: "Settings…", icon: <Settings2 size={14} />, onClick: () => s.set({ settingsOpen: true }) },
      ]} />
      <div className="no-drag ml-3 flex items-center gap-2 h-7 px-2 rounded-md w-[340px]" style={{ background: "color-mix(in srgb, var(--c-text) 6%, transparent)" }}>
        <Search size={13} className="opacity-60" />
        <input value={s.search} onChange={(e) => s.setSearch(e.target.value)} placeholder="Quick search — fuzzy, or bpm:>120 key:8A genre:pop" className="bg-transparent outline-none text-[12px] flex-1 placeholder:opacity-40" />
        {s.search && <button onClick={() => s.setSearch("")} className="opacity-60 hover:opacity-100"><X size={12} /></button>}
      </div>
      <div className="flex-1 text-center text-[11px] text-muted truncate px-4">
        {s.scan.active ? `Scanning ${s.scan.done}/${s.scan.total} · ${s.scan.current}` : s.analyzing ? `Analyzing… ${s.analysisQueue.length} left · ${s.status}` : s.status}
      </div>
      <button onClick={s.toggleDock} title="Dock to top of screen (AIMP style)" className={`no-drag w-8 h-7 inline-flex items-center justify-center rounded hover:bg-white/10 ${s.docked ? "accent-text" : ""}`}><PanelTop size={15} /></button>
      <button onClick={() => s.set({ fxOpen: true })} title="Sound Effects" className="no-drag w-8 h-7 inline-flex items-center justify-center rounded hover:bg-white/10"><Sliders size={15} /></button>
      <div className="flex items-center ml-1 no-drag">
        <button onClick={() => window.saltbee?.minimize()} className="w-10 h-7 inline-flex items-center justify-center hover:bg-white/10" title={isElectron ? "Minimize" : "Minimize (native build)"}><Minus size={14} /></button>
        <button onClick={() => window.saltbee?.maximize()} className="w-10 h-7 inline-flex items-center justify-center hover:bg-white/10"><Square size={12} /></button>
        <button onClick={() => window.saltbee?.close()} className="w-10 h-7 inline-flex items-center justify-center hover:bg-red-500/80"><X size={15} /></button>
      </div>
    </div>
  );
}
