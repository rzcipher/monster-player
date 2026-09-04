import { Fragment, useState, useCallback, useMemo, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronRight, Play, ListPlus, ListEnd, Tag, FileText, Activity, Wand2, Languages, Mic2, ExternalLink, ArrowUpCircle, Trash2, ShieldCheck, LayoutGrid, Table2, Columns3, Sparkles, Users, Group, FolderOpen, ArrowDownWideNarrow } from "lucide-react";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { useVisibleTracks, bestSibling } from "../lib/selectors";
import { fmtTime, fmtLong, fmtSize, toCamelot } from "../lib/util";
import type { ColumnKey, Track } from "../types";
import { QualityBadge, CamelotChip, Stars, TrimKnob, ContextMenu, Cover, type MenuItem } from "./ui";
import { groupTracks, GROUP_OPTIONS } from "../lib/grouping";
import { SORT_PRESETS } from "../lib/util";
import { native, openUrl } from "../lib/native";
import { useVirtual } from "../hooks/useVirtual";

const COLS: { key: ColumnKey; label: string; w: number; align?: "right" | "center" }[] = [
  { key: "index", label: "#", w: 44 }, { key: "title", label: "Title", w: 260 }, { key: "artist", label: "Artist", w: 160 }, { key: "albumArtist", label: "Album Artist", w: 150 },
  { key: "album", label: "Album", w: 200 }, { key: "year", label: "Year", w: 56 }, { key: "trackNo", label: "Trk", w: 44 }, { key: "discNo", label: "Disc", w: 44 },
  { key: "genre", label: "Genre", w: 100 }, { key: "composer", label: "Composer", w: 130 }, { key: "lyricist", label: "Lyricist", w: 120 }, { key: "isrc", label: "ISRC", w: 120 },
  { key: "bpm", label: "BPM", w: 52, align: "right" }, { key: "key", label: "Key", w: 76 }, { key: "camelot", label: "Camelot", w: 66, align: "center" }, { key: "advisory", label: "Advisory", w: 70 },
  { key: "duration", label: "Time", w: 56, align: "right" }, { key: "codec", label: "Codec", w: 60 }, { key: "quality", label: "Quality", w: 150 }, { key: "bitrate", label: "kbps", w: 56, align: "right" },
  { key: "sampleRate", label: "Hz", w: 62, align: "right" }, { key: "rating", label: "Rating", w: 80 }, { key: "playCount", label: "Plays", w: 50, align: "right" }, { key: "lastPlayed", label: "Last played", w: 110 },
  { key: "identity", label: "Identity", w: 140 }, { key: "trim", label: "Trim", w: 84 },
];

export function useTrackMenu() {
  const s = useStore();
  return useCallback((t: Track, ids: string[]): MenuItem[] => {
    const sib = bestSibling(t, s.tracks);
    const mbUrl = t.mbid ? `https://musicbrainz.org/recording/${t.mbid}` : t.isrc ? `https://musicbrainz.org/isrc/${t.isrc}` : `https://musicbrainz.org/search?query=${encodeURIComponent(t.artist + " " + t.title)}&type=recording`;
    return [
      { label: "Play", icon: <Play size={13} />, onClick: () => s.playTrack(t.id) },
      { label: "Play next", icon: <ListPlus size={13} />, onClick: () => s.enqueue(ids, "next") },
      { label: "Add to queue", icon: <ListEnd size={13} />, onClick: () => s.enqueue(ids, "end") },
      { label: "Add to playlist", icon: <ListPlus size={13} />, sub: [...s.playlists.filter((p) => !p.smart).map((p) => ({ label: p.name, onClick: () => s.addToPlaylist(p.id, ids) })), { sep: true }, { label: "New playlist…", onClick: async () => { const n = await s.ask("Playlist name", "New playlist"); if (n) s.createPlaylist(n, ids); } }] },
      { sep: true },
      { label: "Edit tags…", icon: <Tag size={13} />, onClick: () => s.set({ tagEditorId: t.id }) },
      { label: "Fetch lyrics (LRCLIB)", icon: <FileText size={13} />, onClick: () => s.fetchLyrics(t.id) },
      { label: "Analyze loudness / key / BPM", icon: <Activity size={13} />, onClick: () => ids.forEach((id) => s.analyzeTrack(id)) },
      { label: "Key-mix: suggest compatible", icon: <Sparkles size={13} />, onClick: () => { s.playTrack(t.id).then(() => { const sug = useStore.getState().suggestKeyMix(); useStore.getState().setStatus(sug.length ? `Key-mix: ${sug.slice(0, 3).map((x) => x.title + " (" + toCamelot(x.key || x.analyzedKey || "") + ")").join(", ")}` : "No compatible tracks in queue"); }); } },
      { sep: true },
      { label: "Re-tag via CLI", icon: <Wand2 size={13} />, sub: [
        { label: "Fix metadata (MusicBrainz)", icon: <Wand2 size={13} />, onClick: () => s.cliAction("fix-metadata", t) },
        { label: "Re-translate lyrics", icon: <Languages size={13} />, onClick: () => s.cliAction("retranslate", t) },
        { label: "Demucs → acapella sidecar", icon: <Mic2 size={13} />, onClick: () => s.cliAction("demucs-acapella", t) },
      ] },
      { label: "Open on MusicBrainz", icon: <ExternalLink size={13} />, onClick: () => openUrl(mbUrl) },
      ...(native && t.source === "file" ? [{ label: "Show in file explorer", icon: <FolderOpen size={13} />, onClick: () => native?.reveal(t.path) }] : []),
      { label: "Scrobble now (ListenBrainz)", onClick: () => s.scrobble(t) },
      { sep: true },
      ...(sib ? [{ label: `▲ Upgrade to ${sib.codec} sibling`, icon: <ArrowUpCircle size={13} />, onClick: () => s.upgradeTo(t.id, sib.id) }] : []),
      ...(t.quarantined ? [{ label: "Restore from quarantine", icon: <ShieldCheck size={13} />, onClick: () => s.restore(t.id) }] : []),
      ...(t.dupGroup ? [{ label: "Merge duplicate group (keep best)", icon: <ShieldCheck size={13} />, onClick: () => s.mergeGroup(t.dupGroup!) }] : []),
      { label: `Remove ${ids.length > 1 ? ids.length + " tracks" : ""} from library`, icon: <Trash2 size={13} />, danger: true, onClick: () => s.removeTracks(ids) },
    ];
  }, [s]);
}

export function Toolbar({ list }: { list: Track[] }) {
  const s = useStore();
  const [colsOpen, setColsOpen] = useState(false);
  const total = list.reduce((a, t) => a + t.duration, 0), size = list.reduce((a, t) => a + t.fileSize, 0);
  const f = s.filter;
  const title = f.kind === "all" ? "Local files" : f.kind === "artist" ? f.artist : f.kind === "album" ? `${f.artist} — ${f.album}` : f.kind === "playlist" ? s.playlists.find((p) => p.id === f.id)?.name || "Playlist" : f.kind === "folder" ? f.folder : "Quarantine";
  return (
    <div className="h-9 flex items-center gap-3 px-3 border-b border-subtle text-[11px] text-muted shrink-0 relative">
      <span className="font-semibold text-fg text-[12px] truncate max-w-[300px]">{title}</span>
      <span>{list.length} / {fmtLong(total)} / {fmtSize(size)}</span>
      <div className="flex-1" />
      {s.selected.length > 1 && <span className="accent-text">{s.selected.length} selected</span>}
      <label className="inline-flex items-center gap-1 hover:text-white" title="AIMP-style sort templates: order by several fields at once">
        <ArrowDownWideNarrow size={13} />
        <select value={s.sortPreset ?? "__col"} onChange={(e) => (e.target.value === "__col" ? s.setSortPreset(null) : s.setSortPreset(e.target.value))}
          className="bg-transparent outline-none text-[11px] cursor-pointer max-w-[160px] [&>option]:bg-[#17141f] [&>option]:text-white">
          <option value="__col">Sort: column ({s.sortCol} {s.sortDir})</option>
          {SORT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1 hover:text-white" title="AIMP-style grouping: bucket this list under collapsible headers">
        <Group size={13} />
        <select value={s.groupBy} onChange={(e) => s.setGroupBy(e.target.value as typeof s.groupBy)}
          className="bg-transparent outline-none text-[11px] cursor-pointer [&>option]:bg-[#17141f] [&>option]:text-white">
          {GROUP_OPTIONS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      </label>
      <button onClick={() => setColsOpen(!colsOpen)} className="hover:text-white inline-flex items-center gap-1"><Columns3 size={13} /> Columns</button>
      <div className="flex rounded overflow-hidden border border-subtle">
        <button onClick={() => s.setView("table")} title="Track table" className={`px-2 h-6 ${s.view === "table" ? "bg-white/15 text-white" : ""}`}><Table2 size={13} /></button>
        <button onClick={() => s.setView("grid")} title="Album grid" className={`px-2 h-6 ${s.view === "grid" ? "bg-white/15 text-white" : ""}`}><LayoutGrid size={13} /></button>
        <button onClick={() => s.setView("artists")} title="Artists (MusicBee style)" className={`px-2 h-6 ${s.view === "artists" ? "bg-white/15 text-white" : ""}`}><Users size={13} /></button>
      </div>
      {colsOpen && (
        <div className="absolute right-3 top-9 z-50 glass border border-subtle rounded-lg p-2 grid grid-cols-3 gap-x-4 gap-y-1 shadow-2xl fade-in" onMouseLeave={() => setColsOpen(false)}>
          {COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-[11px] text-fg cursor-pointer"><input type="checkbox" className="aimp-check" checked={s.visibleCols.includes(c.key)} onChange={() => s.toggleCol(c.key)} />{c.label}</label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrackTable() {
  // Narrow subscriptions: the table must not re-render on playback position,
  // status text, scan progress, palette changes, etc. `useShallow` keeps the
  // selected slice stable so React can bail out of the re-render entirely.
  const s = useStore(
    useShallow((st) => ({
      currentId: st.currentId,
      playing: st.playing,
      selected: st.selected,
      visibleCols: st.visibleCols,
      sortCol: st.sortCol,
      sortDir: st.sortDir,
      groupBy: st.groupBy,
      sortPreset: st.sortPreset,
      filter: st.filter,
      tracks: st.tracks,
      setSelected: st.setSelected,
      playTrack: st.playTrack,
      enqueue: st.enqueue,
      setSort: st.setSort,
      setRating: st.setRating,
      setTrim: st.setTrim,
      mergeGroup: st.mergeGroup,
      restore: st.restore,
      toggleCol: st.toggleCol,
      upgradeTo: st.upgradeTo,
      search: st.search,
    })),
  );
  const list = useVisibleTracks();
  const menu = useTrackMenu();
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const toggleGroup = (k: string) => setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const cols = useMemo(() => COLS.filter((c) => s.visibleCols.includes(c.key)).sort((a, b) => COLS.indexOf(a) - COLS.indexOf(b)), [s.visibleCols]);
  const ids = list.map((t) => t.id);

  const onRowClick = (e: React.MouseEvent, t: Track) => {
    if (e.shiftKey && anchor) {
      const a = ids.indexOf(anchor), b = ids.indexOf(t.id);
      s.setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.ctrlKey || e.metaKey) s.setSelected(s.selected.includes(t.id) ? s.selected.filter((i) => i !== t.id) : [...s.selected, t.id]);
    else { s.setSelected([t.id]); setAnchor(t.id); }
  };
  const onCtx = (e: React.MouseEvent, t: Track) => {
    e.preventDefault();
    const sel = s.selected.includes(t.id) ? s.selected : [t.id];
    if (!s.selected.includes(t.id)) s.setSelected([t.id]);
    setCtx({ x: e.clientX, y: e.clientY, items: menu(t, sel) });
  };

  const cell = (t: Track, key: ColumnKey, i: number): ReactNode => {
    switch (key) {
      case "index": return <span className="text-muted">{s.currentId === t.id ? <span className="accent-text">{s.playing ? "▶" : "❚❚"}</span> : i + 1}</span>;
      case "title": return (
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">{t.title}</span>
          {t.advisory === "explicit" && <span className="badge bg-white/15 text-white/80 !px-1">E</span>}
          {t.cueStart !== undefined && <span className="badge bg-white/10 text-white/60">CUE</span>}
        </span>
      );
      case "duration": return fmtTime(t.duration);
      case "bpm": return t.bpm ?? (t.analyzedBpm ? <span className="opacity-60" title="analyzed">{t.analyzedBpm}</span> : "");
      case "key": return t.key || (t.analyzedKey ? <span className="opacity-60" title="analyzed">{t.analyzedKey}</span> : "");
      case "camelot": return <CamelotChip t={t} />;
      case "advisory": return t.advisory === "none" ? <span className="text-muted">—</span> : <span className={`badge ${t.advisory === "explicit" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>{t.advisory}</span>;
      case "quality": {
        const sib = bestSibling(t, s.tracks);
        return (
          <span className="flex items-center gap-1.5 min-w-0">
            <QualityBadge t={t} />
            {sib && <button onClick={(e) => { e.stopPropagation(); s.upgradeTo(t.id, sib.id); }} className="badge bg-amber-400/15 text-amber-300 border border-amber-400/40 hover:bg-amber-400/30 truncate" title={`A better source exists: ${sib.codec} ${sib.bitrate}k — click to swap everywhere`}>▲ {sib.codec} sibling — upgrade</button>}
          </span>
        );
      }
      case "bitrate": return t.bitrate;
      case "sampleRate": return (t.sampleRate / 1000).toFixed(1) + "k";
      case "rating": return <Stars value={t.rating} onChange={(v) => s.setRating(t.id, v)} />;
      case "lastPlayed": return t.lastPlayed ? new Date(t.lastPlayed).toLocaleDateString() : <span className="text-muted">never</span>;
      case "identity": return (
        <span className="flex items-center gap-1 text-[10px] font-mono">
          {t.mbid ? <a href={`https://musicbrainz.org/recording/${t.mbid}`} target="_blank" rel="noreferrer" className="badge bg-violet-400/15 text-violet-200 hover:bg-violet-400/30" onClick={(e) => e.stopPropagation()} title={"MBID " + t.mbid}>MB {t.mbid.slice(0, 8)}</a> : <span className="badge bg-white/5 text-muted">no MBID</span>}
          {t.isrc && <a href={`https://musicbrainz.org/isrc/${t.isrc}`} target="_blank" rel="noreferrer" className="badge bg-sky-400/15 text-sky-200 hover:bg-sky-400/30" onClick={(e) => e.stopPropagation()} title="ISRC">{t.isrc}</a>}
        </span>
      );
      case "trim": return <TrimKnob value={t.trim} onChange={(v) => s.setTrim(t.id, v)} />;
      case "codec": return t.codec;
      default: { const v = (t as unknown as Record<string, unknown>)[key]; return v === null || v === undefined ? "" : String(v); }
    }
  };

  const groupsInQuarantine = s.filter.kind === "quarantine";
  const groups = useMemo(() => groupTracks(list, s.groupBy), [list, s.groupBy]);
  const rows = useMemo<{ group?: typeof groups[number]; track?: Track }[]>(() => {
    if (!groups.length) return list.map((t) => ({ track: t }));
    const out: { group?: typeof groups[number]; track?: Track }[] = [];
    for (const g of groups) {
      out.push({ group: g });
      if (!collapsed.includes(g.key)) for (const t of g.tracks) out.push({ track: t });
    }
    return out;
  }, [groups, list, collapsed]);

  // Only the visible slice becomes DOM. Rows are a fixed 32px (h-8); group
  // headers are the same height, so one uniform row height covers both.
  const ROW_H = 32;
  const v = useVirtual(rows.length, ROW_H);
  const slice = rows.slice(v.start, v.end);
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Toolbar list={list} />
      <div className="flex-1 overflow-auto" ref={v.scrollRef}>
        <table className="border-collapse text-[12px] w-max min-w-full" style={{ contain: "content" }}>
          <thead className="sticky top-0 z-10 themed-bg">
            <tr className="text-left text-muted">
              {cols.map((c) => (
                <th key={c.key} style={{ width: c.w, minWidth: c.w, textAlign: c.align || "left" }} onClick={() => c.key !== "index" && s.setSort(c.key)} className="font-normal px-2 h-8 border-b border-r border-subtle cursor-pointer hover:text-white whitespace-nowrap select-none">
                  <span className="inline-flex items-center gap-1">{c.label}{s.sortCol === c.key && (s.sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.padTop > 0 && <tr style={{ height: v.padTop }} aria-hidden><td colSpan={cols.length} className="p-0 border-0" /></tr>}
            {slice.map((row, si) => {
              const i = v.start + si;
              if (row.group) {
                const g = row.group;
                const isCollapsed = collapsed.includes(g.key);
                const gIds = g.tracks.map((t) => t.id);
                return (
                  <tr key={"g:" + g.key} className="group/gh">
                    <td colSpan={cols.length} className="p-0">
                      <div onClick={() => toggleGroup(g.key)} onDoubleClick={() => s.playTrack(gIds[0], gIds)}
                        className="flex items-center gap-2.5 px-2 py-1.5 cursor-default sticky top-8 z-[5] border-y border-subtle"
                        style={{ background: "color-mix(in srgb, var(--c-bg) 88%, var(--c-accent) 12%)" }}>
                        <ChevronRight size={13} className={`text-muted transition-transform shrink-0 ${isCollapsed ? "" : "rotate-90"}`} />
                        {s.groupBy === "album" || s.groupBy === "folder" ? <Cover url={g.cover} size={28} rounded="rounded" /> : null}
                        <span className="text-[12px] font-semibold truncate max-w-[420px]">{g.label}</span>
                        {g.sub && <span className="text-[11px] text-muted truncate max-w-[280px]">{g.sub}</span>}
                        <span className="text-[11px] text-muted">· {g.tracks.length} tracks · {fmtLong(g.duration)}</span>
                        {g.rating > 0 && <Stars value={g.rating} size={9} />}
                        <div className="flex-1" />
                        <button onClick={(e) => { e.stopPropagation(); s.playTrack(gIds[0], gIds); }} title="Play this group"
                          className="opacity-0 group-hover/gh:opacity-100 w-6 h-6 rounded-full inline-flex items-center justify-center text-black shrink-0" style={{ background: "var(--c-accent2)" }}>
                          <Play size={11} fill="currentColor" className="ml-px" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); s.enqueue(gIds, "end"); }} title="Queue this group"
                          className="opacity-0 group-hover/gh:opacity-100 w-6 h-6 rounded inline-flex items-center justify-center hover:bg-white/10 shrink-0"><ListEnd size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              const t = row.track!;
              const prev = rows[i - 1]?.track;
              const groupHead = groupsInQuarantine && t.dupGroup && (!prev || prev.dupGroup !== t.dupGroup);
              const groupSize = groupsInQuarantine ? s.tracks.filter((x) => x.dupGroup === t.dupGroup).length : 0;
              return (
                <Fragment key={t.id}>
                  {groupHead && (
                    <tr className="text-[11px]">
                      <td colSpan={cols.length} className="px-3 py-1.5 bg-amber-400/10 text-amber-200 border-b border-subtle">
                        Same recording, {groupSize} sources — {t.dupGroup!.startsWith("isrc") ? "matched by ISRC" : t.dupGroup!.startsWith("mbid") ? "matched by MBID" : "matched by title/artist/duration"}
                        <button onClick={() => s.mergeGroup(t.dupGroup!)} className="ml-3 underline hover:text-white">merge → keep best</button>
                      </td>
                    </tr>
                  )}
                  <tr onClick={(e) => onRowClick(e, t)} onDoubleClick={() => s.playTrack(t.id, ids)} onContextMenu={(e) => onCtx(e, t)}
                    className={`hover-row h-8 cursor-default ${s.selected.includes(t.id) ? "row-selected" : ""} ${s.currentId === t.id ? "row-playing" : ""} ${t.quarantined ? "opacity-60" : ""}`}>
                    {cols.map((c) => <td key={c.key} style={{ textAlign: c.align || "left" }} className="px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[320px] border-b border-subtle/50">{cell(t, c.key, ids.indexOf(t.id))}</td>)}
                  </tr>
                </Fragment>
              );
            })}
            {v.padBottom > 0 && <tr style={{ height: v.padBottom }} aria-hidden><td colSpan={cols.length} className="p-0 border-0" /></tr>}
            {!list.length && <tr><td colSpan={cols.length} className="p-10 text-center text-muted">Nothing here. {s.search ? "Try a different search — operators: bpm:>120 key:8A genre:pop year:<2000" : "Open a folder from File → Open folder."}</td></tr>}
          </tbody>
        </table>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
