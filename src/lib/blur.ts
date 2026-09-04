/**
 * Pre-blurred backdrop textures.
 *
 * The cover backdrop used to be two viewport-sized layers with a live
 * `filter: blur(20px)` on each, scaled 1.35x and slowly animated. A CSS blur
 * on an animated, viewport-sized layer is re-rasterised by the compositor as
 * the layer moves, and the GPU has to keep a surface that large for each one —
 * which is where most of the 130 MB GPU process went.
 *
 * Instead we bake the blur *once*, into a 48px-wide image, and let the
 * compositor scale that tiny texture up. Upscaling a 48px image is
 * indistinguishable from a heavy Gaussian blur (that is essentially what a
 * blur is), costs one small texture instead of a full-screen surface, and
 * needs no per-frame filtering at all.
 *
 * Results are cached per source URL, and the cache is bounded because the
 * backdrop only ever shows the current and previous cover.
 */

const SIZE = 48;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const LIMIT = 8;

function put(key: string, url: string) {
  cache.set(key, url);
  // drop the oldest entries; these are data URLs, not object URLs, so there is
  // nothing to revoke — letting them fall out of the map is enough.
  while (cache.size > LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Synchronously return a baked texture if we already have one. */
export function peekBlurred(src: string | null): string | null {
  return src ? cache.get(src) ?? null : null;
}

/**
 * Downscale `src` to a 48px square and return it as a data URL.
 *
 * A light canvas blur is applied while drawing so the result is smooth rather
 * than blocky when the compositor scales it back up.
 */
export function makeBlurred(src: string | null): Promise<string | null> {
  if (!src) return Promise.resolve(null);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(src);
  if (pending) return pending;

  const job = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = SIZE; c.height = SIZE;
        const g = c.getContext("2d");
        if (!g) return resolve(null);
        // A small blur at this size ≈ a very large blur at full size.
        g.filter = "blur(2px)";
        g.drawImage(img, 0, 0, SIZE, SIZE);
        const url = c.toDataURL("image/jpeg", 0.72);
        put(src, url);
        resolve(url);
      } catch {
        resolve(null);
      } finally {
        inflight.delete(src);
      }
    };
    img.onerror = () => { inflight.delete(src); resolve(null); };
    img.src = src;
  });
  inflight.set(src, job);
  return job;
}
