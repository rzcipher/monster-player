import { useMemo } from "react";
import { useStore } from "../store";
import { parseQuery, matchesQuery, sortTracks, sortTracksMulti, matchesSmart, SORT_PRESETS } from "./util";
import type { Track } from "../types";

export function useVisibleTracks(): Track[] {
  const tracks = useStore((s) => s.tracks);
  const filter = useStore((s) => s.filter);
  const search = useStore((s) => s.search);
  const sortCol = useStore((s) => s.sortCol);
  const sortDir = useStore((s) => s.sortDir);
  const sortPreset = useStore((s) => s.sortPreset);
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
    if (filter.kind === "playlist" && !playlists.find((x) => x.id === filter.id)?.smart && sortCol === "index" && !sortPreset) return list;
    const preset = sortPreset ? SORT_PRESETS.find((p) => p.key === sortPreset) : null;
    if (preset) return sortTracksMulti(list, preset.cols);
    return sortTracks(list, sortCol, sortDir);
  }, [tracks, filter, search, sortCol, sortDir, sortPreset, playlists]);
}

export function bestSibling(t: Track, tracks: Track[]): Track | null {
  if (!t.dupGroup) return null;
  const g = tracks.filter((x) => x.dupGroup === t.dupGroup && x.id !== t.id);
  const best = g.reduce<Track | null>((a, b) => (!a || b.qualityScore > a.qualityScore ? b : a), null);
  return best && best.qualityScore > t.qualityScore ? best : null;
}

/**
 * Identity-keyed track index.
 *
 * Several places resolved ids with `tracks.find(t => t.id === id)` inside a
 * loop — the queue panel did it once per queued track, which is O(n·m) and on
 * a whole-library queue meant tens of millions of comparisons per render.
 * The map is rebuilt only when the `tracks` array identity changes.
 */
export function useTrackById(): Map<string, Track> {
  const tracks = useStore((s) => s.tracks);
  return useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);
}

export interface DupInfo {
  /** every track sharing each dupGroup key */
  groups: Map<string, Track[]>;
  /** per track id: the higher-quality sibling to point at, if any */
  better: Map<string, Track>;
}

/**
 * Duplicate-group index, computed once per `tracks` change.
 *
 * `bestSibling()` used to filter the entire library for every rendered row.
 * Building the groups once turns that per-row scan into a map lookup.
 */
export function useDupInfo(): DupInfo {
  const tracks = useStore((s) => s.tracks);
  return useMemo(() => {
    const groups = new Map<string, Track[]>();
    for (const t of tracks) {
      if (!t.dupGroup) continue;
      const g = groups.get(t.dupGroup);
      if (g) g.push(t); else groups.set(t.dupGroup, [t]);
    }
    const better = new Map<string, Track>();
    for (const g of groups.values()) {
      // one pass to find the best, then point every worse member at it
      let best = g[0];
      for (const t of g) if (t.qualityScore > best.qualityScore) best = t;
      for (const t of g) if (t !== best && best.qualityScore > t.qualityScore) better.set(t.id, best);
    }
    return { groups, better };
  }, [tracks]);
}
