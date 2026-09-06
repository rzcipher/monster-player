import { useMemo } from "react";
import { useVirtual } from "../hooks/useVirtual";
import { useTrackById } from "../lib/selectors";
import { X, Trash2, Dice5, ListMusic, Radio, Sparkles } from "lucide-react";
import { useTracked } from "../lib/tracked";
import { fmtTime, fmtSize, toCamelot, seededShuffle } from "../lib/util";
import { Stars } from "./ui";
import type { Track } from "../types";

const CURVE_POINTS = 160;

function EnergyCurve({ tracks, currentId }: { tracks: Track[]; currentId: string | null }) {
  if (tracks.length < 2) return null;
  // The queue is often the entire library. One SVG point per track would emit
  // tens of thousands of coordinates into the DOM for a 100px-wide sparkline,
  // so bucket the queue down to a fixed number of points.
  const stride = Math.max(1, Math.ceil(tracks.length / CURVE_POINTS));
  const energyOf = (t: Track) => t.energy ?? Math.min(1, ((t.bpm ?? t.analyzedBpm ?? 100) - 60) / 120);
  const e: number[] = [];
  for (let i = 0; i < tracks.length; i += stride) {
    let sum = 0, n = 0;
    for (let j = i; j < Math.min(i + stride, tracks.length); j++) { sum += energyOf(tracks[j]); n++; }
    e.push(sum / n);
  }
  if (e.length < 2) return null;
  const W = 100, H = 30;
  const pts = e.map((v, i) => `${(i / (e.length - 1)) * W},${H - 2 - v * (H - 4)}`).join(" ");
  const rawCi = tracks.findIndex((t) => t.id === currentId);
  const ci = rawCi < 0 ? -1 : Math.min(e.length - 1, Math.floor(rawCi / stride));
  return (
    <div className="px-3 pt-2">
      <div className="flex justify-between text-[10px] text-muted mb-1"><span className="inline-flex items-center gap-1"><Sparkles size={10} /> Energy curve</span><span>{tracks.length} tracks</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-9" preserveAspectRatio="none">
        <defs><linearGradient id="eg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--c-accent)" stopOpacity="0.6" /><stop offset="1" stopColor="var(--c-accent)" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#eg)" />
        <polyline points={pts} fill="none" stroke="var(--c-accent2)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        {ci >= 0 && <circle cx={(ci / (e.length - 1)) * W} cy={H - 2 - e[ci] * (H - 4)} r="1.6" fill="#fff" />}
      </svg>
    </div>
  );
}

export default function RightPanel() {
  const s = useTracked();
  const byId = useTrackById();
  const order = useMemo(() => (s.shuffle ? seededShuffle(s.queue, s.shuffleSeed) : s.queue), [s.queue, s.shuffle, s.shuffleSeed]);
  // Map lookup instead of `tracks.find` per queued id: the queue is often the
  // whole library, which made this O(n²) on every render.
  const tracks = useMemo(() => order.map((id) => byId.get(id)!).filter(Boolean), [order, byId]);

  /**
   * Flatten groups + tracks into one row list so the panel can be virtualised.
   * The queue is open by default and usually holds the entire library, so
   * rendering every row (two lines and a star widget each) was one of the
   * largest permanent DOM costs in the app.
   */
  const rows = useMemo(() => {
    const out: ({ kind: "head"; key: string; title: string; count: number; dur: number } | { kind: "track"; t: Track; i: number })[] = [];
    let curKey: string | null = null;
    let head: { kind: "head"; key: string; title: string; count: number; dur: number } | null = null;
    tracks.forEach((t, i) => {
      const key = `${t.year ?? ""}::${t.album}`;
      if (key !== curKey) {
        curKey = key;
        head = { kind: "head", key: key + ":" + i, title: `${t.year ?? "—"} - ${t.album || "Unknown"}`, count: 0, dur: 0 };
        out.push(head);
      }
      head!.count++; head!.dur += t.duration;
      out.push({ kind: "track", t, i });
    });
    return out;
  }, [tracks]);

  const QUEUE_ROW_H = 44;
  const v = useVirtual(rows.length, QUEUE_ROW_H);
  const tab = s.rightPanel;
  const totalDur = useMemo(() => tracks.reduce((a, t) => a + t.duration, 0), [tracks]);
  if (tab === "none") return null;
  return (
    <aside className="w-[340px] shrink-0 border-l border-subtle themed-bg flex flex-col">
      <div className="flex items-center gap-1 p-2 border-b border-subtle">
        {(["queue", "playlists", "identity"] as const).map((k) => (
          <button key={k} onClick={() => s.set({ rightPanel: k })} className={`px-3 h-7 rounded-full text-[12px] capitalize ${tab === k ? "bg-white/15" : "hover:bg-white/10 text-muted"}`}>{k === "identity" ? "Scrobbles" : k}</button>
        ))}
        <div className="flex-1" />
        <button onClick={() => s.set({ rightPanel: "none" })} className="w-6 h-6 rounded hover:bg-white/10 inline-flex items-center justify-center"><X size={13} /></button>
      </div>

      {tab === "queue" && (
        <>
          <EnergyCurve tracks={tracks} currentId={s.currentId} />
          <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-muted border-b border-subtle">
            <span>{tracks.length} · {fmtTime(totalDur)}</span>
            <div className="flex-1" />
            <span title="Seeded shuffle — share the seed to reproduce the order" className="inline-flex items-center gap-1"><Dice5 size={12} />
              <input value={s.shuffleSeed} onChange={(e) => s.setShuffleSeed(e.target.value)} className="bg-white/5 rounded px-1 w-20 outline-none text-fg" />
              <button onClick={() => s.setShuffleSeed(Math.random().toString(36).slice(2, 8))} className="hover:text-white">↻</button>
            </span>
            <button onClick={s.clearQueue} title="Clear queue" className="hover:text-white"><Trash2 size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto" ref={v.scrollRef}>
            {v.padTop > 0 && <div style={{ height: v.padTop }} aria-hidden />}
            {rows.slice(v.start, v.end).map((row) => (
              row.kind === "head" ? (
                <div key={"h:" + row.key} className="px-3 flex items-center justify-between text-[13px]" style={{ height: QUEUE_ROW_H }}>
                  <span className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full accent-bg shrink-0" />{row.title}</span>
                  <span className="text-muted text-[11px] shrink-0">{row.count} / {fmtTime(row.dur)}</span>
                </div>
              ) : (
                <div key={row.t.id + ":" + row.i} onDoubleClick={() => s.playTrack(row.t.id)} onContextMenu={(e) => { e.preventDefault(); s.removeFromQueue(s.queue.indexOf(row.t.id)); }}
                  style={{ height: QUEUE_ROW_H }}
                  className={`px-3 pl-4 rounded hover-row cursor-default flex flex-col justify-center ${s.currentId === row.t.id ? "row-playing" : ""}`}>
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                    <span className="truncate flex-1">{row.i + 1}. {row.t.artist} - {row.t.title}</span>
                    <span className="text-muted text-[11px] shrink-0">{fmtTime(row.t.duration)}</span>
                  </div>
                  <div className="flex items-center justify-between pl-3 text-[10px] text-muted">
                    <span className="truncate">{row.t.codec} :: {Math.round(row.t.sampleRate / 1000)} kHz, {row.t.bitrate} kbps, {fmtSize(row.t.fileSize)}{(row.t.key || row.t.analyzedKey) ? ` · ${toCamelot(row.t.key || row.t.analyzedKey || "")}` : ""}</span>
                    <Stars value={row.t.rating} size={8} onChange={(val) => s.setRating(row.t.id, val)} />
                  </div>
                </div>
              )
            ))}
            {v.padBottom > 0 && <div style={{ height: v.padBottom }} aria-hidden />}
            {!tracks.length && <div className="p-6 text-center text-muted text-[12px]">Queue is empty. Double-click a track or right-click → Play next.</div>}
          </div>
        </>
      )}

      {tab === "playlists" && (
        <div className="flex-1 overflow-y-auto p-2">
          {s.playlists.map((p) => {
            const pt = s.playlistTracks(p.id);
            return (
              <div key={p.id} className="rounded-lg hover-row p-2 cursor-default" onDoubleClick={() => pt.length && s.playTrack(pt[0].id, pt.map((t) => t.id))} onClick={() => s.setFilter({ kind: "playlist", id: p.id })}>
                <div className="flex items-center gap-2 text-[13px]"><ListMusic size={13} className={p.smart ? "accent-text" : "opacity-60"} /><span className="flex-1 truncate">{p.name}</span><span className="text-[11px] text-muted">{pt.length}</span></div>
                {p.smart && <div className="text-[10px] text-muted pl-5 truncate">{p.smart.map((r) => `${r.field} ${r.op} ${r.value}`).join(` ${p.smartMatch || "all"} `)}</div>}
              </div>
            );
          })}
          {!s.playlists.length && <div className="p-6 text-center text-muted text-[12px]">No playlists. Use the + in the sidebar.</div>}
        </div>
      )}

      {tab === "identity" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 text-[11px] text-muted border-b border-subtle flex items-center gap-2"><Radio size={12} /> ListenBrainz {s.settings.listenBrainzToken ? <span className="text-emerald-300">token set</span> : <button className="underline" onClick={() => s.set({ settingsOpen: true })}>add token in Settings</button>} · scrobbles carry your MBID/ISRC for exact matches</div>
          {s.scrobbles.map((e) => (
            <div key={e.id} className="px-3 py-2 border-b border-subtle/50 text-[12px]">
              <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${e.status === "sent" ? "bg-emerald-400" : e.status === "failed" ? "bg-red-400" : "bg-amber-400"}`} /><span className="truncate flex-1">{e.title} — {e.artist}</span><span className="text-muted text-[10px]">{new Date(e.time).toLocaleTimeString()}</span></div>
              <div className="pl-3.5 text-[10px] text-muted font-mono truncate">{e.mbid ? "mbid " + e.mbid : e.isrc ? "isrc " + e.isrc : "text match only"} · {e.status}</div>
            </div>
          ))}
          {!s.scrobbles.length && <div className="p-6 text-center text-muted text-[12px]">Nothing scrobbled yet.</div>}
        </div>
      )}
    </aside>
  );
}
