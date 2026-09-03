import { useEffect, useState } from "react";
import { getEngine } from "./store";
import type { Transition } from "./engine/AudioEngine";

/** Smooth playhead readout without pushing 60fps updates through the store. */
export function usePosition(fps = 20) {
  const [st, setSt] = useState({ pos: 0, dur: 0, transition: null as Transition | null, paused: true });
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      if (t - last > 1000 / fps) {
        last = t;
        const e = getEngine();
        setSt({ pos: e.position, dur: e.duration, transition: e.transition.active ? { ...e.transition } : null, paused: e.isPaused });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
  return st;
}

export function useSpectrum(bins = 48) {
  const [data, setData] = useState<number[]>(() => new Array(bins).fill(0));
  useEffect(() => {
    const e = getEngine();
    const arr = new Uint8Array(e.analyser.frequencyBinCount);
    let raf = 0;
    const loop = () => {
      e.getSpectrum(arr);
      const out: number[] = [];
      const n = arr.length;
      for (let i = 0; i < bins; i++) {
        // log spacing
        const lo = Math.floor(Math.pow(n, i / bins)), hi = Math.max(lo + 1, Math.floor(Math.pow(n, (i + 1) / bins)));
        let m = 0; for (let k = lo; k < hi && k < n; k++) m = Math.max(m, arr[k]);
        out.push(m / 255);
      }
      setData(out);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bins]);
  return data;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return now;
}
