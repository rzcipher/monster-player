import { useRef, useCallback } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useStore } from "../store";
import type { State } from "../store";

/**
 * Access-tracked store hook.
 *
 * `useStore()` with no selector subscribes a component to *every* state
 * change. With 17 components doing that, a single unrelated write — the 5-second
 * resume-position save, a scan-progress tick, a status message — re-rendered
 * the title bar, sidebar, track table and player bar together. That is what
 * made the UI feel sticky while scanning or playing.
 *
 * `useTracked()` returns a Proxy over the state. Every key the component reads
 * during render is recorded, and the component only re-renders when one of
 * *those* keys changes identity. Components keep the ergonomic `s.foo` style —
 * no selector boilerplate — but pay only for what they actually use.
 *
 * Caveats worth knowing:
 *  - Tracking is shallow: reading `s.settings` subscribes to the whole
 *    `settings` object, so any setting change re-renders. That is fine, since
 *    settings are written rarely. It does mean you should read the narrow
 *    thing (`s.tracks`) rather than destructure a broad parent.
 *  - Keys read outside render (in an event handler, via the returned object)
 *    are not tracked, which is exactly what we want — handlers should see
 *    fresh state, and they do, because the proxy always reads through to the
 *    live store.
 */
export function useTracked(): State {
  const keys = useRef<Set<keyof State>>(new Set());
  // Re-create the key set on each render so a component that stops reading a
  // key also stops being subscribed to it.
  keys.current = new Set();
  const read = keys.current;

  const equality = useCallback((a: State, b: State) => {
    if (a === b) return true;
    for (const k of read) if (!Object.is(a[k], b[k])) return false;
    return true;
  }, [read]);

  const snap = useStoreWithEqualityFn(useStore, (s) => s, equality);

  return new Proxy(snap, {
    get(target, prop: string) {
      if (prop in target) read.add(prop as keyof State);
      return target[prop as keyof State];
    },
  }) as State;
}
