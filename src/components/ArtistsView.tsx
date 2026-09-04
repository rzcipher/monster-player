import { useMemo, useState, useEffect, useRef } from "react";
import { Play, ChevronRight, Shuffle, ListPlus, Users, Disc3, Clock } from "lucide-react";
import { useStore } from "../store";
import { buildArtists, type ArtistEntry, type ArtistAlbum } from "../lib/grouping";
import { fmtTime } from "../lib/util";
import { Cover, Stars, QualityBadge, CamelotChip, ContextMenu, type MenuItem } from "./ui";
import { useTrackMenu } from "./TrackTable";
import type { Track } from "../types";

function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} hr ${m} min` : `${m} min`;
}

/**
 * MusicBee's artist browser: an alphabetical index rail, a scrollable artist
 * list with cover mosaics + aggregate stats, and a detail pane that lays out
 * every album (plus the "appears on" releases pulled from multi-value artist
 * tags) with an expandable track list.
 */
export default function ArtistsView() {
  const s = useStore();
  const menu = useTrackMenu();
  const [sel, setSel] = useState<string | null>(null);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const artists = useMemo(() => buildArtists(s.tracks), [s.tracks]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? artists.filter((a) => a.name.toLowerCase().includes(needle)) : artists;
  }, [artists, q]);

  const current = shown.find((a) => a.name === sel) || shown[0] || null;
  useEffect(() => { if (current && sel !== current.name) setSel(current.name); }, [current, sel]);

  const letters = useMemo(() => {
    const m = new Map<string, number>();
    shown.forEach((a, i) => { const c = a.sortName.charAt(0).toUpperCase(); const k = /[A-Z]/.test(c) ? c : /[0-9]/.test(c) ? "#" : "…"; if (!m.has(k)) m.set(k, i); });
    return m;
  }, [shown]);

  const jump = (letter: string) => {
    const i = letters.get(letter);
    if (i === undefined) return;
    listRef.current?.querySelectorAll("[data-artist-row]")[i]?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const playArtist = (a: ArtistEntry, shuffle = false) => {
    const ids = a.albums.flatMap((al) => al.tracks.map((t) => t.id));
    if (!ids.length) return;
    const order = shuffle ? ids.slice().sort(() => Math.random() - 0.5) : ids;
    if (shuffle && !s.shuffle) s.toggleShuffle();
    s.playTrack(order[0], order);
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* ---------------- artist list ---------------- */}
      <div className="w-[300px] shrink-0 flex flex-col border-r border-subtle min-h-0">
        <div className="p-2 border-b border-subtle flex items-center gap-2">
          <Users size={14} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${artists.length} artists…`}
            className="flex-1 bg-transparent outline-none text-[12px] placeholder:opacity-40" />
        </div>
        <div className="flex-1 flex min-h-0">
          <div ref={listRef} className="flex-1 overflow-auto">
            {shown.map((a) => (
              <div key={a.name} data-artist-row onClick={() => { setSel(a.name); setOpenAlbum(null); }} onDoubleClick={() => playArtist(a)}
                className={`flex items-center gap-2.5 px-2 py-1.5 cursor-default hover-row ${sel === a.name ? "row-selected" : ""}`}>
                <ArtistMosaic artist={a} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] truncate">{a.name}</div>
                  <div className="text-[10.5px] text-muted truncate">
                    {a.albums.filter((x) => !x.isGuest).length} albums · {a.trackCount} tracks
                    {a.guestOnly && <span className="ml-1 opacity-70">· guest</span>}
                  </div>
                </div>
                {a.rating > 0 && <Stars value={a.rating} size={8} />}
              </div>
            ))}
            {!shown.length && <div className="p-6 text-center text-muted text-[12px]">No artists match “{q}”.</div>}
          </div>
          <div className="w-[18px] shrink-0 flex flex-col items-center py-1 text-[9px] text-muted border-l border-subtle">
            {["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "…"].map((c) => (
              <button key={c} onClick={() => jump(c)} disabled={!letters.has(c)}
                className={`leading-[13px] ${letters.has(c) ? "hover:text-white cursor-pointer" : "opacity-25 cursor-default"}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- artist detail ---------------- */}
      {current ? (
        <div className="flex-1 overflow-auto min-w-0">
          <ArtistHeader a={current} onPlay={() => playArtist(current)} onShuffle={() => playArtist(current, true)}
            onQueue={() => s.enqueue(current.albums.flatMap((al) => al.tracks.map((t) => t.id)), "end")} />
          <div className="px-6 pb-10">
            {(["primary", "guest"] as const).map((section) => {
              const albums = current.albums.filter((al) => (section === "guest") === al.isGuest);
              if (!albums.length) return null;
              return (
                <div key={section} className="mt-6">
                  <div className="text-[11px] uppercase tracking-widest text-muted mb-3">
                    {section === "primary" ? `${albums.length} album${albums.length > 1 ? "s" : ""}` : "Appears on"}
                  </div>
                  <div className="space-y-2">
                    {albums.map((al) => (
                      <AlbumRow key={(al.isGuest ? "g:" : "") + al.album} al={al}
                        open={openAlbum === (al.isGuest ? "g:" : "") + al.album}
                        onToggle={() => setOpenAlbum(openAlbum === (al.isGuest ? "g:" : "") + al.album ? null : (al.isGuest ? "g:" : "") + al.album)}
                        onCtx={(e, t) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: menu(t, [t.id]) }); }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted">No artists yet — open a folder to build your library.</div>
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}

/** 2×2 cover mosaic like MusicBee uses when an artist has no dedicated photo. */
function ArtistMosaic({ artist, size }: { artist: ArtistEntry; size: number }) {
  const covers = artist.albums.map((a) => a.cover).filter(Boolean).slice(0, 4) as string[];
  if (covers.length <= 1) return <Cover url={covers[0] || null} size={size} rounded="rounded-full" className="object-cover" />;
  return (
    <div className="grid grid-cols-2 overflow-hidden shrink-0 rounded-full" style={{ width: size, height: size }}>
      {covers.slice(0, 4).map((c, i) => <img key={i} src={c} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />)}
    </div>
  );
}

function ArtistHeader({ a, onPlay, onShuffle, onQueue }: { a: ArtistEntry; onPlay: () => void; onShuffle: () => void; onQueue: () => void }) {
  return (
    <div className="relative px-6 pt-7 pb-5 overflow-hidden">
      {a.cover && <img src={a.cover} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-3xl scale-125 pointer-events-none" />}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, var(--c-bg))" }} />
      <div className="relative flex items-end gap-5">
        <ArtistMosaic artist={a} size={132} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-muted">Artist</div>
          <h1 className="text-[38px] font-bold leading-tight truncate">{a.name}</h1>
          <div className="text-[12px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span><Disc3 size={11} className="inline -mt-0.5 mr-1" />{a.albums.filter((x) => !x.isGuest).length} albums</span>
            <span>{a.trackCount} tracks</span>
            <span><Clock size={11} className="inline -mt-0.5 mr-1" />{fmtDur(a.duration)}</span>
            {a.years && <span>{a.years[0] === a.years[1] ? a.years[0] : `${a.years[0]}–${a.years[1]}`}</span>}
            {a.playCount > 0 && <span>{a.playCount} plays</span>}
            {a.genres.length > 0 && <span className="opacity-80">{a.genres.join(" · ")}</span>}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={onPlay} className="h-9 px-5 rounded-full text-black font-medium text-[13px] inline-flex items-center gap-2" style={{ background: "var(--c-accent2)" }}>
              <Play size={15} fill="currentColor" />Play
            </button>
            <button onClick={onShuffle} className="h-9 px-4 rounded-full bg-white/10 hover:bg-white/20 text-[13px] inline-flex items-center gap-2"><Shuffle size={14} />Shuffle</button>
            <button onClick={onQueue} className="h-9 px-4 rounded-full bg-white/10 hover:bg-white/20 text-[13px] inline-flex items-center gap-2"><ListPlus size={14} />Queue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlbumRow({ al, open, onToggle, onCtx }: { al: ArtistAlbum; open: boolean; onToggle: () => void; onCtx: (e: React.MouseEvent, t: Track) => void }) {
  const s = useStore();
  const ids = al.tracks.map((t) => t.id);
  const discs = [...new Set(al.tracks.map((t) => t.discNo || 1))].sort((a, b) => a - b);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--c-surface) 55%, transparent)" }}>
      <div onClick={onToggle} onDoubleClick={() => s.playTrack(ids[0], ids)} className="flex items-center gap-3 p-2.5 cursor-default hover-row">
        <div className="relative group shrink-0">
          <Cover url={al.cover} size={56} rounded="rounded-md" />
          <button onClick={(e) => { e.stopPropagation(); s.playTrack(ids[0], ids); }}
            className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
            <Play size={18} fill="currentColor" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] truncate">{al.album}</div>
          <div className="text-[11px] text-muted">
            {al.year ?? "—"} · {al.trackCount} track{al.trackCount > 1 ? "s" : ""} · {fmtDur(al.duration)}
            {al.isGuest && <span className="ml-2 badge bg-white/10">appears on</span>}
          </div>
        </div>
        <ChevronRight size={16} className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="pb-2 px-2 fade-in">
          {discs.map((d) => (
            <div key={d}>
              {discs.length > 1 && <div className="text-[10px] uppercase tracking-widest text-muted px-2 pt-2 pb-1">Disc {d}</div>}
              {al.tracks.filter((t) => (t.discNo || 1) === d).map((t) => (
                <div key={t.id} onDoubleClick={() => s.playTrack(t.id, ids)} onContextMenu={(e) => onCtx(e, t)}
                  className={`flex items-center gap-3 h-8 px-2 rounded-md hover-row text-[12px] cursor-default ${s.currentId === t.id ? "row-playing" : ""}`}>
                  <span className="w-6 text-right text-muted tabular-nums">{t.trackNo ?? "–"}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  <Stars value={t.rating} size={9} onChange={(v) => s.setRating(t.id, v)} />
                  <CamelotChip t={t} />
                  <QualityBadge t={t} compact />
                  <span className="text-muted w-10 text-right tabular-nums">{fmtTime(t.duration)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
