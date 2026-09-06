import { useMemo, useState } from "react";
import { ChevronRight, User, Disc, ListMusic, Sparkles, ShieldAlert, Plus, Folder, Bookmark, History, Settings, Sliders, BarChart3, Users } from "lucide-react";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import type { LibraryFilter } from "../types";

const ALPHA = ["*", "1", "9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "漢"];

function firstChar(s: string) {
  const c = (s || "").trim().charAt(0).toUpperCase();
  if (!c) return "*";
  if (/[0-9]/.test(c)) return c < "5" ? "1" : "9";
  if (/[A-Z]/.test(c)) return c;
  if (/[\u3040-\u30ff]/.test(c)) {
    let code = c.charCodeAt(0);
    if (code >= 0x30a1) code -= 0x60; // katakana → hiragana
    const rows: [string, number][] = [["あ", 0x304a], ["か", 0x3054], ["さ", 0x305e], ["た", 0x3069], ["な", 0x306e], ["は", 0x307d], ["ま", 0x3082], ["や", 0x3088], ["ら", 0x308d], ["わ", 0x3096]];
    for (const [k, end] of rows) if (code <= end) return k;
    return "わ";
  }
  if (/[\u4e00-\u9fff]/.test(c)) return "漢";
  return "*";
}

export default function Sidebar() {
  const { tracks, playlists, filter, setFilter, createPlaylist, deletePlaylist, renamePlaylist, set, ask, view, setView, libraryName } = useStore(
    useShallow((st) => ({
      tracks: st.tracks, playlists: st.playlists, filter: st.filter, setFilter: st.setFilter,
      createPlaylist: st.createPlaylist, deletePlaylist: st.deletePlaylist, renamePlaylist: st.renamePlaylist,
      set: st.set, ask: st.ask, view: st.view, setView: st.setView, libraryName: st.libraryName,
    })),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [letter, setLetter] = useState("*");
  const [mode, setMode] = useState<"artist" | "folder">("artist");

  const artists = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const t of tracks) {
      if (t.quarantined) continue;
      const a = t.albumArtist || t.artist || "Unknown";
      const al = m.get(a) || new Map(); al.set(t.album || "Unknown", (al.get(t.album || "Unknown") || 0) + 1); m.set(a, al);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, [tracks]);
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tracks) if (!t.quarantined) m.set(t.folder || "/", (m.get(t.folder || "/") || 0) + 1);
    return [...m.entries()].sort();
  }, [tracks]);
  const presentLetters = useMemo(() => new Set(artists.map(([a]) => firstChar(a))), [artists]);
  const shown = letter === "*" ? artists : artists.filter(([a]) => firstChar(a) === letter);
  const quarantined = tracks.filter((t) => t.quarantined).length;
  const is = (f: LibraryFilter) => JSON.stringify(f) === JSON.stringify(filter);
  const rowCls = (active: boolean) => `flex items-center gap-2 px-3 py-[5px] text-[12px] cursor-default hover-row ${active ? "row-selected" : ""}`;

  return (
    <aside className="w-[250px] shrink-0 flex flex-col border-r border-subtle themed-bg overflow-hidden">
      <div className="p-3 pb-2">
        <button onClick={() => setFilter({ kind: "all" })} className={`w-full px-4 h-8 rounded-full text-[12px] font-medium ${filter.kind === "all" ? "bg-white/15" : "hover:bg-white/10"}`}>
          {libraryName} · {tracks.filter((t) => !t.quarantined).length}
        </button>
      </div>
      <div className="px-3 pb-2 grid grid-cols-3 gap-1">
        {([["artists", "Artists", <Users key="a" size={12} />], ["grid", "Albums", <Disc key="b" size={12} />], ["table", "Tracks", <ListMusic key="c" size={12} />]] as const).map(([v, label, icon]) => (
          <button key={v} onClick={() => { setFilter({ kind: "all" }); setView(v); }}
            className={`h-7 rounded-md text-[11px] inline-flex items-center justify-center gap-1 ${view === v ? "bg-white/15 text-fg" : "text-muted hover:bg-white/10"}`}>
            {icon}{label}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <button onClick={() => setMode(mode === "artist" ? "folder" : "artist")} className="text-[12px] flex items-center gap-1 opacity-90 hover:opacity-100">{mode === "artist" ? "Artist - Album" : "Folder tree"} <ChevronRight size={12} className="rotate-90" /></button>
      </div>
      {mode === "artist" && (
        <div className="px-3 pb-2 grid grid-cols-8 gap-[2px]">
          {ALPHA.map((l) => (
            <button key={l} onClick={() => setLetter(l)} disabled={l !== "*" && !presentLetters.has(l)}
              className={`h-5 rounded text-[10px] ${letter === l ? "bg-white/20 font-bold" : presentLetters.has(l) || l === "*" ? "hover:bg-white/10" : "opacity-25"}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {mode === "artist" ? (
          <>
            <div className={rowCls(false)} style={{ opacity: 0.6 }} onClick={() => setLetter("*")}>(show all)</div>
            {shown.map(([artist, albums]) => (
              <div key={artist}>
                <div className={rowCls(is({ kind: "artist", artist }))} onClick={() => setFilter({ kind: "artist", artist })}>
                  <ChevronRight size={12} className={`transition-transform ${expanded[artist] ? "rotate-90" : ""}`} onClick={(e) => { e.stopPropagation(); setExpanded({ ...expanded, [artist]: !expanded[artist] }); }} />
                  <User size={12} className="opacity-60" /><span className="truncate flex-1">{artist}</span>
                  <span className="text-[10px] text-muted">{[...albums.values()].reduce((a, b) => a + b, 0)}</span>
                </div>
                {expanded[artist] && [...albums.entries()].map(([album, n]) => (
                  <div key={album} className={rowCls(is({ kind: "album", artist, album }))} style={{ paddingLeft: 34 }} onClick={() => setFilter({ kind: "album", artist, album })}>
                    <Disc size={12} className="opacity-60" /><span className="truncate flex-1">{album}</span><span className="text-[10px] text-muted">{n}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : folders.map(([f, n]) => (
          <div key={f} className={rowCls(is({ kind: "folder", folder: f }))} onClick={() => setFilter({ kind: "folder", folder: f })} title={f}>
            <Folder size={12} className="opacity-60" /><span className="truncate flex-1">{f}</span><span className="text-[10px] text-muted">{n}</span>
          </div>
        ))}

        <div className="mt-3 px-3 py-1 flex items-center justify-between">
          <span className="label">Playlists</span>
          <div className="flex gap-1">
            <button title="New playlist" onClick={async () => { const n = await ask("Playlist name", "New playlist"); if (n) setFilter({ kind: "playlist", id: createPlaylist(n) }); }} className="w-5 h-5 rounded hover:bg-white/10 inline-flex items-center justify-center"><Plus size={12} /></button>
            <button title="New smart playlist" onClick={async () => { const n = await ask("Smart playlist name", "Smart: 120+ BPM"); if (n) { const id = createPlaylist(n, [], [{ field: "bpm", op: "gt", value: "120" }]); set({ smartEditorId: id }); setFilter({ kind: "playlist", id }); } }} className="w-5 h-5 rounded hover:bg-white/10 inline-flex items-center justify-center"><Sparkles size={12} /></button>
          </div>
        </div>
        {playlists.map((p) => (
          <div key={p.id} className={rowCls(is({ kind: "playlist", id: p.id }))} onClick={() => setFilter({ kind: "playlist", id: p.id })}
            onDoubleClick={async () => { const n = await ask("Rename playlist", p.name); if (n) renamePlaylist(p.id, n); }}
            onContextMenu={async (e) => { e.preventDefault(); const n = await ask(`Type DELETE to remove "${p.name}"`, ""); if (n === "DELETE") deletePlaylist(p.id); }}>
            {p.smart ? <Sparkles size={12} className="accent-text" /> : <ListMusic size={12} className="opacity-60" />}
            <span className="truncate flex-1">{p.name}</span>
            {p.smart && <button className="text-[10px] text-muted hover:text-white" onClick={(e) => { e.stopPropagation(); set({ smartEditorId: p.id }); }}>edit</button>}
          </div>
        ))}
        {!playlists.length && <div className="px-3 text-[11px] text-muted">No playlists yet — right-click tracks → Add to playlist.</div>}

        <div className="mt-3 px-3 py-1 label">Library health</div>
        <div className={rowCls(filter.kind === "quarantine")} onClick={() => setFilter({ kind: "quarantine" })}>
          <ShieldAlert size={12} className={quarantined ? "text-amber-400" : "opacity-60"} /><span className="flex-1">Quarantine (duplicates)</span><span className="text-[10px] text-muted">{quarantined}</span>
        </div>
      </div>
      <div className="flex items-center justify-around h-11 border-t border-subtle text-muted">
        <button title="A-B repeat (native build)" className="hover:text-white text-[11px] font-mono">A-B</button>
        <button title="Bookmarks" className="hover:text-white"><Bookmark size={15} /></button>
        <button title="Scrobble history" className="hover:text-white" onClick={() => set({ rightPanel: "identity" })}><History size={15} /></button>
        <button title="Energy curve" className="hover:text-white" onClick={() => set({ rightPanel: "queue" })}><BarChart3 size={15} /></button>
        <button title="Sound effects" className="hover:text-white" onClick={() => set({ fxOpen: true })}><Sliders size={15} /></button>
        <button title="Settings" className="hover:text-white" onClick={() => set({ settingsOpen: true })}><Settings size={15} /></button>
      </div>
    </aside>
  );
}
