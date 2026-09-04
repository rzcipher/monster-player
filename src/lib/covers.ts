/**
 * Cover-art store.
 *
 * Two problems with holding one blob URL per track:
 *   1. an album's 12 tracks each embed the *same* 300 KB JPEG, so we kept 12
 *      copies of it;
 *   2. nothing was ever revoked, and the browser decodes each one to a
 *      full-resolution bitmap when it first paints (a 3000×3000 cover is
 *      36 MB of RGBA).
 *
 * So: hash the bytes, keep one entry per distinct image, and downscale to a
 * thumbnail for list/grid use. A 20k-track library typically collapses to a
 * couple of thousand distinct covers of ~40 KB each.
 */

const THUMB = 256;

interface Entry { url: string; refs: number }

const byHash = new Map<string, Entry>();

/** FNV-1a over a sampled subset of the bytes — fast and collision-safe enough here. */
function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

async function makeThumb(bytes: Uint8Array, mime: string): Promise<Blob> {
  // Build the source Blob only for the decode, and only for covers we haven't
  // seen before — it is never retained, so nothing accumulates in blob storage.
  const blob = new Blob([bytes as BlobPart], { type: mime || "image/jpeg" });
  // createImageBitmap can downscale during decode, so the full-size bitmap
  // never has to exist in memory.
  try {
    const probe = await createImageBitmap(blob);
    const scale = Math.min(1, THUMB / Math.max(probe.width, probe.height));
    if (scale >= 1) { probe.close(); return blob; } // already small
    const w = Math.max(1, Math.round(probe.width * scale));
    const h = Math.max(1, Math.round(probe.height * scale));
    const bmp = await createImageBitmap(probe, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
    probe.close();
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close(); return blob; }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  } catch {
    return blob; // OffscreenCanvas/webp unsupported — fall back to the original
  }
}

/**
 * Register cover bytes and get back a shared object URL.
 * Identical artwork across an album returns the *same* URL every time.
 */
export async function registerCover(bytes: Uint8Array, mime: string): Promise<string> {
  const key = hashBytes(bytes);
  const hit = byHash.get(key);
  if (hit) { hit.refs++; return hit.url; }

  // placeholder first so concurrent callers for the same album don't race
  const thumb = await makeThumb(bytes, mime);
  const existing = byHash.get(key);
  if (existing) { existing.refs++; return existing.url; }

  const url = URL.createObjectURL(thumb);
  byHash.set(key, { url, refs: 1 });
  return url;
}

/** Drop a reference; the blob is revoked once nothing points at it. */
export function releaseCover(url: string | null) {
  // saltbee-art:// URLs are served from disk by the main process — there is no
  // blob to revoke, and Chromium manages that cache itself.
  if (!url || !url.startsWith("blob:")) return;
  for (const [key, e] of byHash) {
    if (e.url !== url) continue;
    if (--e.refs <= 0) { URL.revokeObjectURL(e.url); byHash.delete(key); }
    return;
  }
}

export function coverStats() {
  return { distinct: byHash.size };
}

/** Revoke everything (library reset). */
export function releaseAllCovers() {
  for (const e of byHash.values()) URL.revokeObjectURL(e.url);
  byHash.clear();
}

/**
 * Register a cover delivered from the main process as base64.
 *
 * Synchronous dedupe on the base64 string itself, so an album's 12 tracks
 * decode the image exactly once. Only new artwork pays the decode cost.
 */
const b64Seen = new Map<string, string>();

export function registerCoverB64(b64: string, mime: string): string {
  const key = `${b64.length}:${b64.slice(0, 64)}:${b64.slice(-32)}`;
  const hit = b64Seen.get(key);
  if (hit) return hit;

  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime || "image/jpeg" }));
  b64Seen.set(key, url);

  // downscale in the background and swap the URL in place once ready
  void (async () => {
    try {
      const thumbUrl = await registerCover(bytes, mime);
      if (thumbUrl !== url) b64Seen.set(key, thumbUrl);
    } catch { /* keep the original */ }
  })();

  return url;
}
