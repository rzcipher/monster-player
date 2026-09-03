import { useMemo } from "react";
import { useStore } from "../store";
import { parseQuery, matchesQuery, sortTracks, matchesSmart } from "./util";
import type { Track } from "../types";

export function useVisibleTracks(): Track[] {
  const tracks = useStore((s) => s.tracks);
  const filter = useStore((s) => s.filter);
  const search = useStore((s) => s.search);
  const sortCol = useStore((s) => s.sortCol);
  const sortDir = useStore((s) => s.sortDir);
  const playlists = useStore((s) => s.playlists);
  return useMemo(() => {
    let list: Track[];
    switch (filter.kind) {
      case "all": list = tracks.filter((t) => !t.quarantined); break;
      case "artist": list = tracks.filter((t) => !t.quarantined && (t.albumArtist || t.artist || "Unknown") === filter.artist); break;
      case "album": list = tracks.filter((t) => !t.quarantined && (t.albumArtist || t.artist || "Unknown") === filter.artist && (t.album || "Unknown") === filter.album); break;
      case "folder": list = tracks.filter((t) => !t.quarantined && (t.folder || "/") === filter.folder); break;
      case "quarantine": list = tracks.filter((t) => t.dupGroup); break;
      case "playlist": {
        const p = playlists.find((x) => x.id === filter.id);
        if (!p) list = [];
        else if (p.smart) list = tracks.filter((t) => !t.quarantined && matchesSmart(t, p.smart!, p.smartMatch || "all"));
        else list = p.trackIds.map((id) => tracks.find((t) => t.id === id)!).filter(Boolean);
        break;
      }
    }
    if (search.trim()) {
      const pq = parseQuery(search);
      list = list.map((t) => [t, matchesQuery(t, pq)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
      if (pq.text) return list; // relevance order for fuzzy text
    }
    if (filter.kind === "playlist" && !playlists.find((x) => x.id === filter.id)?.smart && sortCol === "index") return list;
    return sortTracks(list, sortCol, sortDir);
  }, [tracks, filter, search, sortCol, sortDir, playlists]);
}

export function bestSibling(t: Track, tracks: Track[]): Track | null {
  if (!t.dupGroup) return null;
  const g = tracks.filter((x) => x.dupGroup === t.dupGroup && x.id !== t.id);
  const best = g.reduce<Track | null>((a, b) => (!a || b.qualityScore > a.qualityScore ? b : a), null);
  return best && best.qualityScore > t.qualityScore ? best : null;
}
