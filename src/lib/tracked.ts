import { useCallback, useDebugValue, useRef, useSyncExternalStore } from "react";
import { useStore } from "../store";
import type { State } from "../store";

/**
 * Access-tracked store hook.
 *
 * `useStore()` with no selector subscribes a component to *every* state
 * change. With 17 components doing that, a single unrelated write — the
 * 5-second resume-position save, a scan-progress tick, a status message —
 * re-rendered the title bar, sidebar, track table and player bar together.
 * That is what made the UI feel sticky while scanning or playing.
 *
 * `useTracked()` returns a Proxy over the state. Every key the component reads
 * during render is recorded, and the component only re-renders when one of
 * *those* keys changes identity. Components keep the ergonomic `s.foo` style —
 * no selector boilerplate — but pay only for what they actually use.
 *
 * Implemented directly on React's `useSyncExternalStore` rather than
 * `zustand/traditional`: that entry point pulls in the optional peer package
 * `use-sync-external-store`, which npm does not install, and Vite happily
 * emitted a bundle with an unresolved bare import — a blank window at runtime.
 * React has had this hook built in since 18, so the shim is unnecessary.
 *
 * Caveats worth knowing:
 *  - Tracking is shallow: reading `s.settings` subscribes to the whole
 *    `settings` object, so any setting change re-renders. That is fine, since
 *    settings are written rarely. It does mean you should read the narrow
 *    thing (`s.tracks`) rather than destructure a broad parent.
 *  - Keys read outside render (in an event handler) are not tracked, which is
 *    what we want — handlers should see fresh state, and they do, because the
 *    proxy reads through to whatever snapshot it was built from.
 */
export function useTracked(): State {
  // Keys this component read during its most recent render.
  const tracked = useRef<Set<keyof State>>(new Set());
  // The snapshot we last handed to React. `useSyncExternalStore` re-renders
  // whenever getSnapshot returns a new identity, so we must keep returning
  // this same object until a *tracked* key actually changes.
  const cached = useRef<State | null>(null);

  const getSnapshot = useCallback(() => {
    const live = useStore.getState();
    const prev = cached.current;
    if (prev === null) { cached.current = live; return live; }
    if (prev === live) return prev;
    for (const k of tracked.current) {
      if (!Object.is(prev[k], live[k])) { cached.current = live; return live; }
    }
    // Only untracked keys changed — keep the old identity so React bails out.
    return prev;
  }, []);

  const snap = useSyncExternalStore(useStore.subscribe, getSnapshot, getSnapshot);

  // Start a fresh key set for this render, so a component that stops reading a
  // key also stops being subscribed to it.
  const read = new Set<keyof State>();
  tracked.current = read;
  useDebugValue(read);

  return new Proxy(snap, {
    get(target, prop: string) {
      if (prop in target) read.add(prop as keyof State);
      return target[prop as keyof State];
    },
  }) as State;
}
