import { useMemo } from "react";
import { X, Trash2, Dice5, ListMusic, Radio, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { fmtTime, fmtSize, toCamelot, seededShuffle } from "../lib/util";
import { Stars } from "./ui";
import type { Track } from "../types";

function EnergyCurve({ tracks, currentId }: { tracks: Track[]; currentId: string | null }) {
  if (tracks.length < 2) return null;
  const e = tracks.map((t) => t.energy ?? Math.min(1, ((t.bpm ?? t.analyzedBpm ?? 100) - 60) / 120));
  const W = 100, H = 30;
  const pts = e.map((v, i) => `${(i / (e.length - 1)) * W},${H - 2 - v * (H - 4)}`).join(" ");
  const ci = tracks.findIndex((t) => t.id === currentId);
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
  const s = useStore();
  const order = useMemo(() => (s.shuffle ? seededShuffle(s.queue, s.shuffleSeed) : s.queue), [s.queue, s.shuffle, s.shuffleSeed]);
  const tracks = useMemo(() => order.map((id) => s.tracks.find((t) => t.id === id)!).filter(Boolean), [order, s.tracks]);
  const tab = s.rightPanel;
  if (tab === "none") return null;
  const groups: { key: string; title: string; tracks: { t: Track; i: number }[] }[] = [];
  tracks.forEach((t, i) => {
    const key = `${t.year ?? ""}::${t.album}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.tracks.push({ t, i }); else groups.push({ key, title: `${t.year ?? "—"} - ${t.album || "Unknown"}`, tracks: [{ t, i }] });
  });
  const totalDur = tracks.reduce((a, t) => a + t.duration, 0);
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
          <div className="flex-1 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.key + g.tracks[0].i} className="px-3 pt-3">
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full accent-bg" />{g.title}</span>
                  <span className="text-muted text-[11px]">{g.tracks.length} / {fmtTime(g.tracks.reduce((a, x) => a + x.t.duration, 0))}</span>
                </div>
                {g.tracks.map(({ t, i }) => (
                  <div key={t.id + i} onDoubleClick={() => s.playTrack(t.id)} onContextMenu={(e) => { e.preventDefault(); s.removeFromQueue(s.queue.indexOf(t.id)); }}
                    className={`pl-4 pr-1 py-1.5 rounded hover-row cursor-default ${s.currentId === t.id ? "row-playing" : ""}`}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                      <span className="truncate flex-1">{i + 1}. {t.artist} - {t.title}</span>
                      <span className="text-muted text-[11px]">{fmtTime(t.duration)}</span>
                    </div>
                    <div className="flex items-center justify-between pl-3 text-[10px] text-muted">
                      <span>{t.codec} :: {Math.round(t.sampleRate / 1000)} kHz, {t.bitrate} kbps, {fmtSize(t.fileSize)}{(t.key || t.analyzedKey) ? ` · ${toCamelot(t.key || t.analyzedKey || "")}` : ""}</span>
                      <Stars value={t.rating} size={8} onChange={(v) => s.setRating(t.id, v)} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
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
