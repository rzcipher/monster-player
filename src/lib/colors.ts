import type { Palette } from "../types";

/**
 * Salt Player-style adaptive theming.
 *
 * Salt Player's signature is that the *whole app* re-tints itself from the
 * current cover: a dominant tone drives the surfaces, a vibrant tone drives
 * accents, and everything is generated from a tonal ramp so contrast stays
 * legible no matter how dark/washed/neon the artwork is.
 *
 * We build a Material-You-ish tonal palette:
 *   1. quantise the cover into perceptual buckets
 *   2. score buckets for "theme-worthiness" (saturation × population × mid-lightness)
 *   3. derive a full ramp (bg / surface / accent / accent2 / text / muted)
 *   4. force WCAG-ish contrast on text against the generated background
 */

export type ThemeMode = "adaptive" | "adaptiveLight" | "midnight" | "monochrome" | "custom";

export const DEFAULT_PALETTE: Palette = {
  bg: "#0d0b14",
  surface: "#17141f",
  accent: "#8b5cf6",
  accent2: "#c084fc",
  text: "#f4f1fa",
  muted: "#9b93ad",
  vibrant: "#a78bfa",
  dominant: "#2a2336",
};

// ------------------------------------------------------------------ colour math
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

export function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(Math.max(0, Math.min(1, s)) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

function relLuminance(r: number, g: number, b: number) {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const la = relLuminance(...a), lb = relLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Nudge lightness until `fg` clears `ratio` against `bg`. */
function ensureContrast(h: number, s: number, l: number, bg: [number, number, number], ratio: number, up: boolean) {
  for (let i = 0; i < 24; i++) {
    if (contrast(hslToRgb(h, s, l), bg) >= ratio) break;
    l += up ? 0.035 : -0.035;
    if (l > 0.99 || l < 0.01) break;
  }
  return Math.max(0.02, Math.min(0.98, l));
}

// ------------------------------------------------------------------ extraction
interface Bucket { n: number; r: number; g: number; b: number; s: number; l: number; h: number }

const cache = new Map<string, Palette>();

async function coverBuckets(url: string): Promise<Bucket[] | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  try { await img.decode(); } catch { return null; }

  const S = 64;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, S, S);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, S, S).data; } catch { return null; }

  const buckets = new Map<string, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // ignore transparent pixels
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    const key = `${Math.round(h / 18)}-${Math.round(s * 5)}-${Math.round(l * 6)}`;
    const bk = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0, l: 0, h: 0 };
    bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.s += s; bk.l += l; bk.h += h;
    buckets.set(key, bk);
  }
  const list = [...buckets.values()].map((b) => ({
    n: b.n, r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, s: b.s / b.n, l: b.l / b.n, h: b.h / b.n,
  }));
  return list.length ? list : null;
}

function build(list: Bucket[], mode: ThemeMode): Palette {
  const byPop = list.slice().sort((a, b) => b.n - a.n);
  const dominant = byPop[0];

  // "theme-worthiness": saturated, well-lit, and reasonably common.
  const score = (x: Bucket) => {
    const satWeight = Math.pow(x.s, 1.35);
    const lightWeight = 1 - Math.abs(x.l - 0.52) * 1.5;
    return satWeight * Math.max(0.05, lightWeight) * Math.sqrt(x.n);
  };
  const ranked = list.filter((x) => x.l > 0.08 && x.l < 0.94).sort((a, b) => score(b) - score(a));
  const vibrant = ranked[0] || dominant;
  // a second hue at least 30° away keeps gradients from looking flat
  const second =
    ranked.find((x) => x !== vibrant && Math.min(Math.abs(x.h - vibrant.h), 360 - Math.abs(x.h - vibrant.h)) > 30) ||
    ranked[1] || vibrant;

  const light = mode === "adaptiveLight";
  const mono = mode === "monochrome";
  const midnight = mode === "midnight";

  const accH = vibrant.h;
  const accS = mono ? 0 : Math.max(0.42, Math.min(0.92, vibrant.s + 0.18));
  const domH = dominant.h;
  const domS = mono ? 0 : Math.min(0.55, Math.max(0.08, dominant.s));

  // background / surface ramp
  const bgL = light ? 0.965 : midnight ? 0.028 : 0.062;
  const surL = light ? 0.915 : midnight ? 0.075 : 0.108;
  const bgS = light ? domS * 0.28 : midnight ? domS * 0.35 : Math.max(0.1, domS * 0.75);
  const bgRgb = hslToRgb(domH, bgS, bgL);

  // accents must read against the background
  const accL = ensureContrast(accH, accS, light ? 0.44 : 0.62, bgRgb, 3.2, !light);
  const acc2L = ensureContrast(second.h, Math.max(0.38, mono ? 0 : second.s), light ? 0.5 : 0.7, bgRgb, 3.0, !light);
  const textL = ensureContrast(domH, light ? 0.35 : 0.16, light ? 0.14 : 0.965, bgRgb, 11, !light);
  const mutedL = ensureContrast(domH, light ? 0.18 : 0.11, light ? 0.42 : 0.63, bgRgb, 4.2, !light);

  return {
    bg: hsl(domH, bgS, bgL),
    surface: hsl(domH, light ? domS * 0.3 : Math.max(0.08, domS * 0.62), surL),
    accent: hsl(accH, accS, accL),
    accent2: hsl(second.h, mono ? 0 : Math.max(0.4, second.s), acc2L),
    text: hsl(domH, light ? 0.35 : 0.16, textL),
    muted: hsl(domH, light ? 0.18 : 0.11, mutedL),
    vibrant: `rgb(${Math.round(vibrant.r)} ${Math.round(vibrant.g)} ${Math.round(vibrant.b)})`,
    dominant: `rgb(${Math.round(dominant.r)} ${Math.round(dominant.g)} ${Math.round(dominant.b)})`,
  };
}

export async function extractPalette(url: string, mode: ThemeMode = "adaptive"): Promise<Palette> {
  const key = `${mode}|${url}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const list = await coverBuckets(url);
  if (!list) return DEFAULT_PALETTE;
  const p = build(list, mode);
  cache.set(key, p);
  return p;
}

/** Fixed palette for the non-adaptive theme modes (no cover / theming disabled). */
export function staticPalette(mode: ThemeMode, hue = 265): Palette {
  const fake: Bucket[] = [
    { n: 100, r: 0, g: 0, b: 0, s: 0.3, l: 0.25, h: hue },
    { n: 60, r: 0, g: 0, b: 0, s: 0.75, l: 0.55, h: hue },
    { n: 40, r: 0, g: 0, b: 0, s: 0.7, l: 0.6, h: hue + 40 },
  ];
  return build(fake, mode);
}

/** Push a palette into CSS custom properties; the whole UI reads from these. */
export function applyPalette(p: Palette) {
  const r = document.documentElement.style;
  r.setProperty("--c-bg", p.bg);
  r.setProperty("--c-surface", p.surface);
  r.setProperty("--c-accent", p.accent);
  r.setProperty("--c-accent2", p.accent2);
  r.setProperty("--c-text", p.text);
  r.setProperty("--c-muted", p.muted);
  r.setProperty("--c-vibrant", p.vibrant);
  r.setProperty("--c-dominant", p.dominant);
}
