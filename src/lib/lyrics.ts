import type { LyricLine } from "../types";

const TS = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Parse LRC text. Duplicate timestamps (bilingual LRC) become translation lines. */
export function parseLrc(text: string): LyricLine[] | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const out: LyricLine[] = [];
  for (const raw of lines) {
    const stamps = [...raw.matchAll(TS)];
    if (!stamps.length) continue;
    const content = raw.replace(TS, "").trim();
    for (const s of stamps) {
      const ms = s[3] ? parseInt(s[3].padEnd(3, "0").slice(0, 3), 10) : 0;
      const t = parseInt(s[1], 10) * 60 + parseInt(s[2], 10) + ms / 1000;
      // Inline translation formats: "line / translation" or "line | translation" or "line（translation）"
      const inline = content.match(/^(.*?)\s*(?:\||\/\/)\s*(.+)$/);
      out.push(inline ? { time: t, text: inline[1], translation: inline[2] } : { time: t, text: content });
    }
  }
  if (!out.length) return null;
  out.sort((a, b) => a.time - b.time);
  // merge duplicate timestamps into translation
  const merged: LyricLine[] = [];
  for (const l of out) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.time - l.time) < 0.02 && l.text && prev.text && !prev.translation) {
      prev.translation = l.text;
    } else merged.push(l);
  }
  return merged.filter((l) => l.text || l.translation);
}

/** Plain (unsynced) lyrics → evenly spaced pseudo timestamps so the view still scrolls. */
export function plainToLines(text: string, duration: number): LyricLine[] | null {
  const ls = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!ls.length) return null;
  const per = duration / (ls.length + 1);
  return ls.map((text, i) => ({ time: (i + 0.5) * per, text }));
}

export function currentLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export interface LrclibResult { synced: LyricLine[] | null; plain: string | null; id: number | null }

export async function fetchLrclib(artist: string, title: string, album: string, duration: number): Promise<LrclibResult | null> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title, album_name: album, duration: String(Math.round(duration)) });
  try {
    let res = await fetch(`https://lrclib.net/api/get?${params}`, { headers: { "Lrclib-Client": "SaltBee/1.0" } });
    if (res.status === 404) {
      const p2 = new URLSearchParams({ artist_name: artist, track_name: title });
      res = await fetch(`https://lrclib.net/api/search?${p2}`);
      if (!res.ok) return null;
      const arr = await res.json();
      if (!arr?.length) return null;
      const best = arr.find((x: { syncedLyrics?: string }) => x.syncedLyrics) || arr[0];
      return { synced: parseLrc(best.syncedLyrics || ""), plain: best.plainLyrics || null, id: best.id };
    }
    if (!res.ok) return null;
    const j = await res.json();
    return { synced: parseLrc(j.syncedLyrics || ""), plain: j.plainLyrics || null, id: j.id };
  } catch {
    return null;
  }
}

export const lrclibSearchUrl = (artist: string, title: string) =>
  `https://lrclib.net/search/${encodeURIComponent(`${artist} ${title}`)}`;
