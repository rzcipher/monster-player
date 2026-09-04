import { useEffect, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, ChevronDown, ChevronUp, PanelTopClose, MicVocal, Pin, PinOff, EyeOff, Eye, Sliders } from "lucide-react";
import { useStore } from "../store";
import { useTracked } from "../lib/tracked";
import { usePosition, useSpectrum } from "../hooks";
import { fmtTime, toCamelot } from "../lib/util";
import { Cover, QualityBadge } from "./ui";
import { Waveform } from "./PlayerBar";
import { native } from "../lib/native";

/** Tiny always-visible spectrum so the strip still feels alive when collapsed. */
function MiniSpectrum() {
  const bins = useSpectrum(28);
  return (
    <div className="flex items-end gap-[2px] h-[22px] w-[74px] shrink-0">
      {bins.map((v, i) => (
        <div key={i} className="meter-bar flex-1" style={{ height: `${Math.max(6, v * 100)}%`, opacity: 0.45 + v * 0.55 }} />
      ))}
    </div>
  );
}

/**
 * AIMP-style dock strip.
 *
 * In the packaged app the OS window itself becomes this bar: pinned across the
 * top of the display, always-on-top, and (when auto-hide is on) parked just
 * off-screen. Sweep the mouse to the top edge and the main process slides it
 * back down — this component renders the "called down" state and offers the
 * expand handle that drops the whole library below the strip.
 */
export default function DockBar() {
  const s = useTracked();
  const t = s.tracks.find((x) => x.id === s.currentId) || null;
  const { pos, dur } = usePosition(10);
  const RepeatIcon = s.repeat === "one" ? Repeat1 : Repeat;
  const [hovered, setHovered] = useState(false);

  // Web-preview fallback: no OS window to move, so simulate the reveal by
  // watching the pointer near the very top of the viewport.
  useEffect(() => {
    if (native || !s.settings.dockAutoHide) return;
    const m = (e: MouseEvent) => useStore.setState({ dockRevealed: e.clientY <= 6 ? true : e.clientY > 90 && !s.dockExpanded ? false : useStore.getState().dockRevealed });
    window.addEventListener("mousemove", m);
    return () => window.removeEventListener("mousemove", m);
  }, [s.settings.dockAutoHide, s.dockExpanded]);

  const hidden = s.settings.dockAutoHide && !s.dockRevealed && !s.dockExpanded;

  return (
    <div
      onMouseEnter={() => { setHovered(true); useStore.setState({ dockRevealed: true }); }}
      onMouseLeave={() => setHovered(false)}
      className="dock-strip drag-region shrink-0 flex items-center gap-3 px-3 relative border-b border-subtle"
      style={{
        height: "var(--dock-h)",
        transform: hidden && !native ? "translateY(calc(-1 * var(--dock-h) + 3px))" : "none",
        transition: s.settings.animations ? "transform 0.28s cubic-bezier(.22,1,.36,1)" : "none",
        opacity: s.settings.dockOpacity,
      }}
      title={hidden ? "Move the mouse to the top edge to call SaltBee down" : undefined}
    >
      <div className="flex items-center gap-2 pr-2.5 border-r border-subtle">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white font-black text-[13px]" style={{ background: "linear-gradient(135deg, var(--c-accent), var(--c-accent2))" }}>S</div>
      </div>

      <button className="no-drag shrink-0" onClick={() => s.openNowPlaying()} title="Open Now Playing">
        <Cover url={t?.coverUrl || null} size={40} rounded="rounded-md" className={s.playing && s.settings.animations ? "breathe" : ""} />
      </button>

      <div className="w-[210px] min-w-0 no-drag">
        <div className="text-[13px] font-semibold truncate">{t?.title || "SaltBee"}</div>
        <div className="text-[11px] text-muted truncate flex items-center gap-1.5">
          {t ? (
            <>
              <span className="truncate">{t.artist}</span>
              <QualityBadge t={t} compact />
              {(t.key || t.analyzedKey) && <span className="badge bg-white/10">{toCamelot(t.key || t.analyzedKey || "")}</span>}
            </>
          ) : "docked to the top edge"}
        </div>
      </div>

      <div className="flex items-center gap-1 no-drag shrink-0">
        <button onClick={s.prev} className="w-8 h-8 rounded-md hover:bg-white/10 inline-flex items-center justify-center"><SkipBack size={16} /></button>
        <button onClick={s.togglePlay} className="w-9 h-9 rounded-full inline-flex items-center justify-center text-black accent-glow" style={{ background: "var(--c-accent2)" }}>
          {s.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={() => s.next(true)} className="w-8 h-8 rounded-md hover:bg-white/10 inline-flex items-center justify-center"><SkipForward size={16} /></button>
      </div>

      <span className="text-[11px] text-muted tabular-nums no-drag">{fmtTime(pos)}</span>
      <div className="flex-1 no-drag min-w-[80px]"><Waveform height={26} /></div>
      <span className="text-[11px] text-muted tabular-nums no-drag">{fmtTime(dur)}</span>

      <div className="no-drag hidden xl:block"><MiniSpectrum /></div>

      <div className="flex items-center gap-0.5 no-drag">
        <button onClick={s.toggleShuffle} title="Shuffle" className={`w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center ${s.shuffle ? "accent-text" : "text-muted"}`}><Shuffle size={14} /></button>
        <button onClick={s.cycleRepeat} title={`Repeat: ${s.repeat}`} className={`w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center ${s.repeat !== "off" ? "accent-text" : "text-muted"}`}><RepeatIcon size={14} /></button>
        <button onClick={() => s.openNowPlaying("lyrics")} title="Lyrics" className="w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center text-muted"><MicVocal size={14} /></button>
        <button onClick={() => s.set({ fxOpen: true })} title="Sound effects" className="w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center text-muted"><Sliders size={14} /></button>
        <Volume2 size={14} className="text-muted ml-1" />
        <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => s.setVolume(+e.target.value)} className="fader accent w-[72px]" style={{ ["--pct" as string]: `${s.volume * 100}%` }} />
      </div>

      <div className="flex items-center gap-0.5 no-drag pl-2 border-l border-subtle">
        <button onClick={() => s.setDockAutoHide(!s.settings.dockAutoHide)} title={s.settings.dockAutoHide ? "Auto-hide is ON — the bar parks off-screen and slides down when you touch the top edge" : "Auto-hide is OFF — the bar stays visible"}
          className={`w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center ${s.settings.dockAutoHide ? "accent-text" : "text-muted"}`}>
          {s.settings.dockAutoHide ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button onClick={() => { const v = !s.settings.alwaysOnTop; s.setSetting("alwaysOnTop", v); native?.pin(v); }} title="Always on top"
          className={`w-7 h-7 rounded-md hover:bg-white/10 inline-flex items-center justify-center ${s.settings.alwaysOnTop ? "accent-text" : "text-muted"}`}>
          {s.settings.alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button onClick={() => s.setDockExpanded(!s.dockExpanded)} title={s.dockExpanded ? "Collapse library" : "Drop the library down"} className="w-8 h-8 rounded-md hover:bg-white/10 inline-flex items-center justify-center">
          {s.dockExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button onClick={s.toggleDock} title="Undock (restore window)" className="w-8 h-8 rounded-md hover:bg-white/10 inline-flex items-center justify-center text-muted"><PanelTopClose size={16} /></button>
      </div>

      <div className="dock-handle" />
      {hovered && s.settings.dockAutoHide && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted glass px-2 py-0.5 rounded-full pointer-events-none whitespace-nowrap">
          auto-hide on · hover the top edge to call SaltBee down
        </div>
      )}
    </div>
  );
}
