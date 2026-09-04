import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

/**
 * Salt Player's signature backdrop: the current cover, blown up, heavily
 * blurred and slowly drifting behind the library, cross-fading whenever the
 * track changes. Two stacked layers give us the fade without a flash of
 * background between covers.
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
    setLayers((l) => (l.showA ? { ...l, b: cover, showA: false } : { ...l, a: cover, showA: true }));
  }, [cover]);

  if (!enabled) return null;
  const op = Math.max(0, Math.min(1, strength));

  const layer = (url: string | null, visible: boolean, drift: string) => (
    <div
      className="absolute inset-0 bg-center bg-cover"
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        opacity: url && visible ? 0.34 * op : 0,
        // Keep the blur radius modest. A 64px radius makes Chromium allocate
        // and re-filter a very large GPU surface every frame the layer drifts;
        // at 20px over an already-downscaled 900px cover the result looks the
        // same but costs a fraction of the VRAM and fill rate.
        filter: `blur(${Math.round(20 * (0.6 + op * 0.7))}px) saturate(1.6)`,
        transform: "scale(1.35)",
        // hint that only opacity/transform change, so the layer isn't re-rastered
        willChange: animations ? "opacity, transform" : "opacity",
        backgroundSize: "cover",
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
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}
