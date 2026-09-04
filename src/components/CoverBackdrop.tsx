import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { makeBlurred, peekBlurred } from "../lib/blur";

/**
 * Salt Player's signature backdrop: the current cover, blown up, heavily
 * blurred and slowly drifting behind the library, cross-fading whenever the
 * track changes. Two stacked layers give us the fade without a flash of
 * background between covers.
 *
 * The blur is baked into a 48px texture up front (see lib/blur.ts) rather than
 * applied as a live CSS filter — the compositor then only has to scale a tiny
 * image, instead of re-filtering two viewport-sized surfaces every frame.
 */
export default function CoverBackdrop() {
  const enabled = useStore((s) => s.settings.coverBackdrop);
  const strength = useStore((s) => s.settings.backdropStrength);
  const animations = useStore((s) => s.settings.animations);
  const currentId = useStore((s) => s.currentId);
  const cover = useStore((s) => {
    const t = s.tracks.find((x) => x.id === currentId);
    return t?.coverFull || t?.coverUrl || null;
  });

  const [layers, setLayers] = useState<{ a: string | null; b: string | null; showA: boolean }>({ a: null, b: null, showA: true });
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (cover === last.current) return;
    last.current = cover;
    let cancelled = false;
    const apply = (baked: string | null) => {
      if (cancelled) return;
      setLayers((l) => (l.showA ? { ...l, b: baked, showA: false } : { ...l, a: baked, showA: true }));
    };
    // If it's already baked, swap synchronously to avoid a blank frame.
    const ready = peekBlurred(cover);
    if (ready || !cover) apply(ready);
    else makeBlurred(cover).then(apply);
    return () => { cancelled = true; };
  }, [cover]);

  if (!enabled) return null;
  const op = Math.max(0, Math.min(1, strength));

  const layer = (url: string | null, visible: boolean, drift: string) => (
    <div
      className="absolute inset-0 bg-center"
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        opacity: url && visible ? 0.34 * op : 0,
        // No `filter` here: the texture is already blurred, so the compositor
        // just stretches 48px up to the viewport. Saturate is cheap enough to
        // keep as it doesn't force a separate filter surface at this size.
        filter: "saturate(1.6)",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        transform: "scale(1.35)",
        // only opacity/transform animate, so the layer never needs re-rastering
        willChange: animations ? "opacity, transform" : "opacity",
        transition: animations ? "opacity 1.1s ease" : "none",
        animation: animations ? `${drift} 46s ease-in-out infinite alternate` : undefined,
      }}
    />
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {layer(layers.a, layers.showA, "drift-a")}
      {layer(layers.b, !layers.showA, "drift-b")}
      {/* tonal scrim so text keeps its contrast over any artwork */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--c-bg) 72%, transparent), color-mix(in srgb, var(--c-bg) 94%, transparent))" }} />
      {/*
        Grain. This used `mix-blend-mode: overlay`, which forces the compositor
        to keep everything beneath it in one blended group — an extra
        full-screen surface. Plain low-opacity grain looks near-identical here.
      */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}
