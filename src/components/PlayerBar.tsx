import { useEffect, useMemo, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, Music2, MicVocal, ListMusic, Timer } from "lucide-react";
import { useStore } from "../store";
import { useTracked } from "../lib/tracked";
import { usePosition, useNow } from "../hooks";
import { getWaveform } from "../lib/analysis";
import { fmtTime, toCamelot } from "../lib/util";
import { Cover, QualityBadge } from "./ui";

export function Waveform({ height = 34, className = "" }: { height?: number; className?: string }) {
  // Subscribe narrowly: this canvas repaints ~15x/s and must not be tied to
  // the whole store (which would re-render it on every unrelated change).
  // waveform lives in a bounded LRU keyed by path, not on the Track object
  const wfKey = useStore((s) => {
    const t = s.tracks.find((x) => x.id === s.currentId);
    return t ? t.path || t.id : null;
  });
  const wf = wfKey ? getWaveform(wfKey) : null;
  const seek = useStore((s) => s.seek);
  const { pos, dur, transition } = usePosition(15);
  const ref = useRef<HTMLCanvasElement>(null);
  const sized = useRef({ w: 0, h: 0, dpr: 0 });
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = height;
    // Resizing a canvas is expensive and clears it — only do it when the
    // geometry actually changed, not on every animation frame.
    if (sized.current.w !== W || sized.current.h !== H || sized.current.dpr !== dpr) {
      c.width = W * dpr; c.height = H * dpr;
      sized.current = { w: W, h: H, dpr };
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const n = 240; const bw = W / n;
    const progress = dur ? pos / dur : 0;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--c-accent").trim() || "#8b5cf6";
    const accent2 = css.getPropertyValue("--c-accent2").trim() || "#c084fc";
    for (let i = 0; i < n; i++) {
      const v = wf ? wf[i] / 255 : 0.25 + 0.15 * Math.sin(i / 6) * Math.cos(i / 17);
      const h = Math.max(2, v * (H - 4));
      const x = i * bw;
      const played = i / n <= progress;
      g.fillStyle = played ? accent : "rgba(255,255,255,0.22)";
      g.fillRect(x + 0.5, (H - h) / 2, Math.max(1, bw - 1.2), h);
    }
    if (transition) {
      // crossfade zone at the end: draw fade progress overlay
      const zone = transition.seconds / Math.max(1, dur);
      const x0 = W * (1 - zone);
      const grd = g.createLinearGradient(x0, 0, W, 0); grd.addColorStop(0, "transparent"); grd.addColorStop(1, accent2 + "");
      g.globalAlpha = 0.35; g.fillStyle = grd; g.fillRect(x0, 0, W - x0, H); g.globalAlpha = 1;
      g.fillStyle = accent2; g.fillRect(x0 + (W - x0) * transition.progress - 1, 0, 2, H);
    }
    g.fillStyle = "#fff"; g.fillRect(W * progress - 0.5, 0, 1, H);
  }, [wf, wfKey, pos, dur, height, transition]);
  const onSeek = (e: React.MouseEvent) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); };
  return <canvas ref={ref} onClick={onSeek} className={`w-full cursor-pointer ${className}`} style={{ height }} />;
}

export default function PlayerBar() {
  const s = useTracked();
  const { pos, dur, transition } = usePosition(10);
  const now = useNow();
  // `usePosition` re-renders this bar ~10x/s. Everything derived from the
  // store below is unchanged between those ticks, so memoise it — otherwise
  // each tick re-scanned the track list twice and recomputed the whole
  // seeded shuffle inside computeNextId().
  const tracks = s.tracks, currentId = s.currentId;
  const t = useMemo(() => tracks.find((x) => x.id === currentId) || null, [tracks, currentId]);
  const RepeatIcon = s.repeat === "one" ? Repeat1 : Repeat;
  const sleepLeft = s.sleepEndsAt ? Math.max(0, Math.round((s.sleepEndsAt - now) / 60000)) : null;
  const queue = s.queue, shuffle = s.shuffle, seed = s.shuffleSeed, repeat = s.repeat, computeNextId = s.computeNextId;
  const nextT = useMemo(() => {
    const nid = computeNextId();
    return nid ? tracks.find((x) => x.id === nid) : undefined;
    // queue/shuffle/seed/repeat are the inputs computeNextId actually reads
  }, [tracks, currentId, queue, shuffle, seed, repeat, computeNextId]);
  return (
    <div className="h-[var(--player-h)] shrink-0 border-t border-subtle themed-surface flex items-center gap-3 px-3 relative">
      {transition && <div className="absolute top-0 left-0 h-[2px] bg-accent2 transition-all" style={{ width: `${transition.progress * 100}%`, background: "var(--c-accent2)" }} title={`Crossfade (${transition.curve})`} />}
      <button onClick={() => s.openNowPlaying()} className="shrink-0" title="Open Now Playing"><Cover url={t?.coverUrl || null} size={54} rounded="rounded" /></button>
      <div className="w-[200px] min-w-0">
        <div className="font-semibold text-[14px] truncate cursor-pointer hover:underline" onClick={() => s.openNowPlaying("lyrics")}>{t?.title || "Nothing playing"}</div>
        <div className="text-[12px] text-muted truncate">{t?.artist || "—"}</div>
        {t && <div className="flex items-center gap-1 mt-0.5"><QualityBadge t={t} compact />{(t.key || t.analyzedKey) && <span className="badge bg-white/10">{toCamelot(t.key || t.analyzedKey || "")}</span>}{(t.bpm || t.analyzedBpm) && <span className="badge bg-white/10">{t.bpm ?? t.analyzedBpm} bpm</span>}</div>}
      </div>
      <span className="text-[11px] text-muted tabular-nums w-11 text-right">{fmtTime(dur - pos, true)}</span>
      <div className="flex-1 min-w-[120px] relative">
        <Waveform />
        {nextT && (s.dsp.gapless || s.dsp.crossfade) && <div className="absolute -bottom-3 right-0 text-[9px] text-muted truncate max-w-[50%]">next: {nextT.title} {s.dsp.crossfade ? `· xfade ${s.dsp.crossfadeSec}s ${s.dsp.crossfadeCurve}` : "· gapless"}</div>}
      </div>
      <span className="text-[11px] text-muted tabular-nums w-10">{fmtTime(dur)}</span>
      <div className="flex items-center gap-1.5 w-[120px]">
        <button onClick={() => s.setVolume(s.volume ? 0 : 0.8)} className="text-muted hover:text-white">{s.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => s.setVolume(+e.target.value)} className="fader accent flex-1" style={{ ["--pct" as string]: `${s.volume * 100}%` }} />
      </div>
      <div className="flex items-center gap-0.5">
        <button onClick={s.toggleShuffle} title={`Shuffle (seed ${s.shuffleSeed})`} className={`w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 ${s.shuffle ? "accent-text" : "text-muted"}`}><Shuffle size={16} /></button>
        <button onClick={s.cycleRepeat} title={`Repeat: ${s.repeat}`} className={`w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 relative ${s.repeat !== "off" ? "accent-text" : "text-muted"}`}>
          <RepeatIcon size={16} />{s.repeat === "album" && <span className="absolute text-[7px] font-bold bottom-1 right-1">ALB</span>}
        </button>
        <button onClick={s.toggleKeyMix} title="Key-mix mode: pick next track within ±1 on the Camelot wheel" className={`w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 ${s.keyMix ? "accent-text" : "text-muted"}`}><Music2 size={16} /></button>
        <button onClick={s.prev} className="w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10"><SkipBack size={18} /></button>
        <button onClick={s.togglePlay} className="w-11 h-11 rounded-full inline-flex items-center justify-center hover:scale-105 transition-transform text-black" style={{ background: "var(--c-accent2)" }}>{s.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}</button>
        <button onClick={() => s.next(true)} className="w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10"><SkipForward size={18} /></button>
        <button onClick={() => s.openNowPlaying("lyrics")} title="Lyrics" className="w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 text-muted"><MicVocal size={16} /></button>
        <button onClick={() => s.set({ rightPanel: s.rightPanel === "none" ? "queue" : "none" })} title="Queue panel" className={`w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 ${s.rightPanel !== "none" ? "" : "text-muted"}`}><ListMusic size={16} /></button>
        <button onClick={() => s.set({ sleepOpen: true })} title="Sleep timer" className={`w-9 h-9 rounded-md inline-flex items-center justify-center hover:bg-white/10 relative ${sleepLeft !== null ? "accent-text" : "text-muted"}`}><Timer size={16} />{sleepLeft !== null && <span className="absolute -top-0.5 -right-0.5 text-[8px] accent-bg text-black rounded px-1">{sleepLeft}</span>}</button>
      </div>
    </div>
  );
}
