import { useMemo, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { useVisibleTracks } from "../lib/selectors";
import { Toolbar, useTrackMenu } from "./TrackTable";
import { Cover, Stars, QualityBadge, ContextMenu, CamelotChip, type MenuItem } from "./ui";
import { fmtTime } from "../lib/util";
import type { Track } from "../types";

export default function CoverGrid() {
  const s = useStore(
    useShallow((st) => ({
      currentId: st.currentId, tracks: st.tracks, filter: st.filter, setFilter: st.setFilter,
      playTrack: st.playTrack, enqueue: st.enqueue, setView: st.setView, search: st.search,
      artistView: st.artistView, groupBy: st.groupBy,
    })),
  );
  const list = useVisibleTracks();
  const menu = useTrackMenu();
  const [open, setOpen] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const albums = useMemo(() => {
    const m = new Map<string, { key: string; album: string; artist: string; year: number | null; genre: string; cover: string | null; tracks: Track[] }>();
    for (const t of list) {
      const k = `${t.albumArtist || t.artist}::${t.album}`;
      const a = m.get(k) || { key: k, album: t.album || "Unknown album", artist: t.albumArtist || t.artist, year: t.year, genre: t.genre, cover: t.coverUrl, tracks: [] };
      a.tracks.push(t); if (!a.cover) a.cover = t.coverUrl; m.set(k, a);
    }
    return [...m.values()];
  }, [list]);
  const rating = (ts: Track[]) => Math.round(ts.reduce((a, t) => a + t.rating, 0) / ts.length);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Toolbar list={list} />
      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {albums.map((a) => (
            <div key={a.key} className="group">
              <div className="relative cursor-pointer" onDoubleClick={() => s.playTrack(a.tracks[0].id, a.tracks.map((t) => t.id))} onClick={() => setOpen(open === a.key ? null : a.key)}>
                <Cover url={a.cover} size="100%" className="aspect-square shadow-lg group-hover:shadow-2xl transition-shadow" rounded="rounded-sm" />
                <button onClick={(e) => { e.stopPropagation(); s.playTrack(a.tracks[0].id, a.tracks.map((t) => t.id)); }} className="absolute bottom-2 right-2 w-9 h-9 rounded-full accent-bg text-black opacity-0 group-hover:opacity-100 transition-opacity shadow-xl inline-flex items-center justify-center"><Play size={16} fill="currentColor" /></button>
              </div>
              <div className="mt-2 text-[11px] leading-[15px] flex items-start">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{a.artist}</div>
                  <div className="truncate text-fg">{a.album}</div>
                  <div className="truncate text-muted">{a.genre}</div>
                  <div className="text-muted">{a.year ?? ""}</div>
                  <Stars value={rating(a.tracks)} size={8} />
                </div>
                <ChevronDown size={16} className={`text-muted mt-3 transition-transform ${open === a.key ? "rotate-180" : ""}`} onClick={() => setOpen(open === a.key ? null : a.key)} />
              </div>
            </div>
          ))}
        </div>
        {open && (() => {
          const a = albums.find((x) => x.key === open); if (!a) return null;
          return (
            <div className="mt-6 glass border border-subtle rounded-xl p-4 fade-in">
              <div className="flex gap-4">
                <Cover url={a.cover} size={120} rounded="rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold truncate">{a.album}</div>
                  <div className="text-muted mb-2">{a.artist} · {a.year} · {a.genre} · {a.tracks.length} tracks</div>
                  {a.tracks.sort((x, y) => (x.discNo || 0) - (y.discNo || 0) || (x.trackNo || 0) - (y.trackNo || 0)).map((t) => (
                    <div key={t.id} onDoubleClick={() => s.playTrack(t.id, a.tracks.map((x) => x.id))} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: menu(t, [t.id]) }); }}
                      className={`flex items-center gap-3 h-7 px-2 rounded hover-row text-[12px] ${s.currentId === t.id ? "row-playing" : ""}`}>
                      <span className="w-5 text-muted text-right">{t.trackNo}</span>
                      <span className="flex-1 truncate">{t.title}</span>
                      <CamelotChip t={t} />
                      <span className="text-muted w-10">{t.bpm ?? t.analyzedBpm ?? ""}</span>
                      <QualityBadge t={t} compact />
                      <span className="text-muted w-10 text-right">{fmtTime(t.duration)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
