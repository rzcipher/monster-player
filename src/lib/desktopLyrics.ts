import { useEffect } from "react";
import { useStore, getEngine } from "../store";
import { currentLineIndex } from "./lyrics";
import { native } from "./native";

/**
 * Drives Salt Player's floating desktop-lyrics window.
 *
 * The overlay is a separate always-on-top Electron window; from here we push it
 * the active line, the karaoke sweep percentage, the track progress and the
 * live accent colours so it re-tints with the rest of the app.
 */
export function useDesktopLyrics() {
  const on = useStore((s) => s.settings.desktopLyrics);

  useEffect(() => {
    if (!native) return;
    native.toggleLyricsWindow(on);
    const off = native.onLyricsClosed(() => useStore.getState().setSetting("desktopLyrics", false));
    return () => off();
  }, [on]);

  useEffect(() => {
    if (!native || !on) return;
    const api = native;
    let raf = 0;
    let last = 0;

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < 1000 / 15) return; // 15 fps is plenty for a lyric strip
      last = ts;

      const s = useStore.getState();
      const t = s.tracks.find((x) => x.id === s.currentId);
      if (!t) { api.pushLyrics({}); return; }

      const e = getEngine();
      const pos = e.position;
      const dur = e.duration || t.duration || 0;
      const lines = t.lyrics;
      let line = "", sub = "", sweep = 0;

      if (lines?.length) {
        const i = currentLineIndex(lines, pos);
        if (i >= 0) {
          line = lines[i].text || "\u266a";
          sub = (s.settings.showTranslation && lines[i].translation) || lines[i + 1]?.text || "";
          const end = i + 1 < lines.length ? lines[i + 1].time : dur;
          if (s.settings.karaoke && end > lines[i].time) {
            sweep = Math.max(0, Math.min(100, ((pos - lines[i].time) / (end - lines[i].time)) * 100));
          } else sweep = 100;
        } else {
          line = t.title;
          sub = t.artist;
        }
      } else {
        line = t.title;
        sub = t.artist;
      }

      api.pushLyrics({
        line, sub,
        title: t.title,
        artist: t.artist,
        sweep,
        progress: dur ? pos / dur : 0,
        accent: s.palette.accent2,
        accent2: s.palette.accent,
        fontSize: Math.round(40 * s.settings.fontScale),
      });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}
