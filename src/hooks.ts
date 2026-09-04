import { useEffect, useState } from "react";
import { getEngine } from "./store";
import type { Transition } from "./engine/AudioEngine";

/** Smooth playhead readout without pushing 60fps updates through the store. */
export function usePosition(fps = 20) {
  const [st, setSt] = useState({ pos: 0, dur: 0, transition: null as Transition | null, paused: true });
  useEffect(() => {
    let raf = 0, last = 0;
    let prev = { pos: -1, dur: -1, active: false, paused: true };
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 1000 / fps) return;
      last = t;
      const e = getEngine();
      const pos = e.position, dur = e.duration, active = e.transition.active, paused = e.isPaused;
      // Skip the setState (and the whole subtree re-render) when nothing the
      // UI can actually show has changed — e.g. while paused.
      if (paused === prev.paused && active === prev.active && dur === prev.dur && Math.abs(pos - prev.pos) < 0.05) return;
      prev = { pos, dur, active, paused };
      setSt({ pos, dur, transition: active ? { ...e.transition } : null, paused });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
  return st;
}

export function useSpectrum(bins = 48, fps = 30) {
  const [data, setData] = useState<number[]>(() => new Array(bins).fill(0));
  useEffect(() => {
    const e = getEngine();
    const arr = new Uint8Array(e.analyser.frequencyBinCount);
    // precompute the log-spaced band edges once instead of per frame
    const n = arr.length;
    const edges: [number, number][] = [];
    for (let i = 0; i < bins; i++) {
      const lo = Math.floor(Math.pow(n, i / bins));
      edges.push([lo, Math.max(lo + 1, Math.floor(Math.pow(n, (i + 1) / bins)))]);
    }
    const out = new Array(bins).fill(0);
    let raf = 0, last = 0, idleFrames = 0;

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 1000 / fps) return;
      last = t;
      // don't burn GPU/CPU animating a spectrum nobody can see
      if (document.hidden) return;
      if (e.isPaused) {
        // let the bars fall to zero, then stop updating entirely
        if (idleFrames > 20) return;
        idleFrames++;
        for (let i = 0; i < bins; i++) out[i] = 0;
        setData(out.slice());
        return;
      }
      idleFrames = 0;
      e.getSpectrum(arr);
      for (let i = 0; i < bins; i++) {
        const [lo, hi] = edges[i];
        let m = 0;
        for (let k = lo; k < hi && k < n; k++) if (arr[k] > m) m = arr[k];
        out[i] = m / 255;
      }
      setData(out.slice());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bins, fps]);
  return data;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, intervalMs);
    return () => clearInterval(i);
  }, [intervalMs]);
  return now;
}
