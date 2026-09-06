import type { Track, GroupBy } from "../types";
import { toCamelot } from "./util";

/**
 * AIMP-style grouping: any track list can be bucketed under collapsible
 * headers by (almost) any field, and each group carries its own aggregate
 * stats (count, total time, average rating) exactly like AIMP's playlist
 * group lines.
 */
export interface TrackGroup {
  key: string;
  label: string;
  sub?: string;
  cover: string | null;
  tracks: Track[];
  duration: number;
  rating: number;
}

export const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "none", label: "No grouping" },
  { key: "album", label: "Album" },
  { key: "albumArtist", label: "Album artist" },
  { key: "artist", label: "Artist" },
  { key: "genre", label: "Genre" },
  { key: "year", label: "Year" },
  { key: "decade", label: "Decade" },
  { key: "folder", label: "Folder" },
  { key: "rating", label: "Rating" },
  { key: "codec", label: "Format / quality" },
  { key: "key", label: "Musical key (Camelot)" },
  { key: "bpmRange", label: "Tempo range" },
  { key: "added", label: "Date added" },
];

function bpmBucket(bpm: number | null | undefined) {
  if (!bpm) return { k: "zzz", l: "Unknown tempo" };
  const lo = Math.floor(bpm / 10) * 10;
  const name = bpm < 90 ? "Slow" : bpm < 110 ? "Mid" : bpm < 130 ? "Up-tempo" : bpm < 150 ? "Fast" : "Very fast";
  return { k: String(lo).padStart(3, "0"), l: `${lo}–${lo + 9} BPM · ${name}` };
}

function addedBucket(ts: number) {
  const d = new Date(ts);
  const days = (Date.now() - ts) / 86400000;
  if (days < 1) return { k: "0", l: "Today" };
  if (days < 7) return { k: "1", l: "This week" };
  if (days < 31) return { k: "2", l: "This month" };
  if (days < 366) return { k: "3", l: d.toLocaleString(undefined, { month: "long", year: "numeric" }) };
  return { k: "4-" + d.getFullYear(), l: String(d.getFullYear()) };
}

function bucketOf(t: Track, by: GroupBy): { k: string; l: string; sub?: string } {
  switch (by) {
    case "album": {
      const artist = t.albumArtist || t.artist || "Unknown artist";
      return { k: `${artist}::${t.album}`, l: t.album || "Unknown album", sub: `${artist}${t.year ? " · " + t.year : ""}` };
    }
    case "albumArtist": { const a = t.albumArtist || t.artist || "Unknown artist"; return { k: a, l: a }; }
    case "artist": { const a = t.artist || "Unknown artist"; return { k: a, l: a }; }
    case "genre": { const g = t.genre || "Unknown genre"; return { k: g, l: g }; }
    case "year": return { k: t.year ? String(t.year) : "zzz", l: t.year ? String(t.year) : "Unknown year" };
    case "decade": {
      if (!t.year) return { k: "zzz", l: "Unknown decade" };
      const d = Math.floor(t.year / 10) * 10;
      return { k: String(d), l: `${d}s` };
    }
    case "folder": { const f = t.folder || "/"; return { k: f, l: f.split(/[\\/]/).pop() || f, sub: f }; }
    case "rating": return { k: String(5 - t.rating), l: t.rating ? "★".repeat(t.rating) : "Unrated" };
    case "codec": return { k: `${t.lossless ? "0" : "1"}-${t.codec}`, l: `${t.codec}${t.lossless ? " (lossless)" : ""}`, sub: `${t.sampleRate / 1000} kHz${t.bitDepth ? " · " + t.bitDepth + "-bit" : ""}` };
    case "key": { const c = toCamelot(t.key || t.analyzedKey || ""); return { k: c || "zzz", l: c ? `${c} — ${t.key || t.analyzedKey}` : "Unknown key" }; }
    case "bpmRange": { const b = bpmBucket(t.bpm ?? t.analyzedBpm); return { k: b.k, l: b.l }; }
    case "added": { const b = addedBucket(t.added); return { k: b.k, l: b.l }; }
    default: return { k: "all", l: "All" };
  }
}

export function groupTracks(list: Track[], by: GroupBy): TrackGroup[] {
  if (by === "none") return [];
  const m = new Map<string, TrackGroup>();
  for (const t of list) {
    const b = bucketOf(t, by);
    let g = m.get(b.k);
    if (!g) { g = { key: b.k, label: b.l, sub: b.sub, cover: t.coverUrl, tracks: [], duration: 0, rating: 0 }; m.set(b.k, g); }
    if (!g.cover) g.cover = t.coverUrl;
    g.tracks.push(t);
    g.duration += t.duration;
  }
  const groups = [...m.values()];
  for (const g of groups) {
    g.rating = Math.round(g.tracks.reduce((a, t) => a + t.rating, 0) / g.tracks.length);
    if (by === "album") g.tracks.sort((a, b) => (a.discNo || 0) - (b.discNo || 0) || (a.trackNo || 0) - (b.trackNo || 0));
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

// ---------------------------------------------------------------- MusicBee artists
/**
 * MusicBee's artist browser is the thing people miss most in other players:
 * one row per *album artist*, with every album they appear on, plus the
 * "appears on" cross-links that come from multi-value artist tags
 * ("Artist1; Artist2" / "feat." in the title).
 */
export interface ArtistAlbum {
  album: string;
  year: number | null;
  cover: string | null;
  trackCount: number;
  duration: number;
  tracks: Track[];
  isGuest: boolean; // artist appears on it but isn't the album artist
}
export interface ArtistEntry {
  name: string;
  sortName: string;
  albums: ArtistAlbum[];
  trackCount: number;
  duration: number;
  playCount: number;
  rating: number;
  genres: string[];
  cover: string | null;
  years: [number, number] | null;
  guestOnly: boolean;
}

/** Split a multi-value artist tag the way MusicBee/foobar do. */
export function splitArtists(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:;|\/(?!\s*\d)|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bvs\.?\b|\bx\b(?=\s)|&|,(?=\s*[A-Z]))\s*/i)
    .map((x) => x.trim())
    .filter((x) => x && x.length > 1);
}

/** "The Beatles" → "Beatles, The" so alphabetical browsing matches MusicBee. */
export function sortName(name: string): string {
  const m = name.match(/^(the|a|an|los|las|les|die|der|das)\s+(.+)$/i);
  return (m ? `${m[2]}, ${m[1]}` : name).toLowerCase();
}

export function buildArtists(tracks: Track[], opts: { splitMultiArtist?: boolean } = {}): ArtistEntry[] {
  const split = opts.splitMultiArtist !== false;
  const map = new Map<string, { primary: Map<string, ArtistAlbum>; guest: Map<string, ArtistAlbum>; tracks: Set<Track>; genres: Map<string, number> }>();

  const touch = (name: string) => {
    let e = map.get(name);
    if (!e) { e = { primary: new Map(), guest: new Map(), tracks: new Set(), genres: new Map() }; map.set(name, e); }
    return e;
  };
  const addAlbum = (bucket: Map<string, ArtistAlbum>, t: Track, isGuest: boolean) => {
    const key = t.album || "Unknown album";
    let a = bucket.get(key);
    if (!a) { a = { album: key, year: t.year, cover: t.coverUrl, trackCount: 0, duration: 0, tracks: [], isGuest }; bucket.set(key, a); }
    if (!a.cover) a.cover = t.coverUrl;
    if (a.year === null) a.year = t.year;
    a.trackCount++; a.duration += t.duration; a.tracks.push(t);
  };

  for (const t of tracks) {
    if (t.quarantined) continue;
    const albumArtist = (t.albumArtist || t.artist || "Unknown artist").trim();
    const primaries = split ? splitArtists(albumArtist) : [albumArtist];
    const names = primaries.length ? primaries : [albumArtist];

    for (const n of names) {
      const e = touch(n);
      addAlbum(e.primary, t, false);
      e.tracks.add(t);
      if (t.genre) for (const g of t.genre.split(/\s*;\s*/)) if (g) e.genres.set(g, (e.genres.get(g) || 0) + 1);
    }
    // guests: performers on the track who aren't the album artist
    if (split) {
      const performers = new Set([...splitArtists(t.artist), ...(t.title.match(/\(?feat\.?\s+([^)]+)\)?/i) ? splitArtists(RegExp.$1) : [])]);
      for (const n of performers) {
        if (names.includes(n)) continue;
        const e = touch(n);
        addAlbum(e.guest, t, true);
        e.tracks.add(t);
      }
    }
  }

  const out: ArtistEntry[] = [];
  for (const [name, e] of map) {
    const albums = [...e.primary.values(), ...e.guest.values()].sort(
      (a, b) => Number(a.isGuest) - Number(b.isGuest) || (a.year || 9999) - (b.year || 9999) || a.album.localeCompare(b.album),
    );
    const list = [...e.tracks];
    const years = list.map((t) => t.year).filter((y): y is number => !!y);
    out.push({
      name,
      sortName: sortName(name),
      albums,
      trackCount: list.length,
      duration: list.reduce((a, t) => a + t.duration, 0),
      playCount: list.reduce((a, t) => a + t.playCount, 0),
      rating: Math.round(list.reduce((a, t) => a + t.rating, 0) / (list.length || 1)),
      genres: [...e.genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g),
      cover: albums.find((a) => a.cover)?.cover || null,
      years: years.length ? [Math.min(...years), Math.max(...years)] : null,
      guestOnly: e.primary.size === 0,
    });
  }
  return out.sort((a, b) => a.sortName.localeCompare(b.sortName, "ja"));
}
