/**
 * Main-process library indexer.
 *
 * Replaces the old design where the renderer asked for a file list, then
 * pulled every file's *entire contents* across IPC (10 MB a piece) just to
 * read its tags. That was slow, blew up RAM, and spilled to blob storage.
 *
 * Here we:
 *   1. walk the folder tree with a bounded worker pool,
 *   2. parse tags with music-metadata's streaming Node reader, which only
 *      touches the header/footer of each file rather than the whole thing,
 *   3. persist the result to an on-disk index keyed by path+size+mtime, so a
 *      relaunch is a single JSON read instead of a full rescan,
 *   4. stream results back in batches so the UI fills in progressively.
 *
 * Only small plain objects ever cross the IPC boundary.
 */

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { app, nativeImage } = require("electron");

const AUDIO_EXT = new Set([".flac", ".mp3", ".m4a", ".aac", ".alac", ".ogg", ".oga", ".opus", ".wav", ".wave", ".aif", ".aiff", ".aifc", ".wma", ".ape", ".wv", ".mpc", ".tta", ".dsf", ".dff", ".cue"]);
const SKIP_DIRS = new Set(["node_modules", "$RECYCLE.BIN", "System Volume Information", "__MACOSX"]);

const INDEX_VERSION = 4;
const indexFile = () => path.join(app.getPath("userData"), "library-index.json");
const artDir = () => path.join(app.getPath("userData"), "artwork");

// music-metadata is ESM-only; load it once, lazily.
let mmPromise = null;
const mm = () => (mmPromise ||= import("music-metadata"));

/** path -> record. Persisted between runs. */
let index = new Map();
let indexDirty = false;
let saveTimer = null;

function loadIndex() {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(), "utf8"));
    if (raw && raw.v === INDEX_VERSION && Array.isArray(raw.tracks)) {
      index = new Map(raw.tracks.map((t) => [t.path, t]));
      return index.size;
    }
  } catch { /* no index yet, or it's stale */ }
  index = new Map();
  return 0;
}

function saveIndexNow() {
  saveTimer = null;
  if (!indexDirty) return;
  indexDirty = false;
  const tmp = indexFile() + ".tmp";
  try {
    // atomic replace so a crash mid-write can't corrupt the index
    fs.writeFileSync(tmp, JSON.stringify({ v: INDEX_VERSION, saved: Date.now(), tracks: [...index.values()] }));
    fs.renameSync(tmp, indexFile());
  } catch (e) {
    console.warn("[SaltBee] index save failed", e.message);
  }
}

function scheduleSave() {
  indexDirty = true;
  if (!saveTimer) saveTimer = setTimeout(saveIndexNow, 2000);
}

// ------------------------------------------------------------------ walking
async function walk(root, onFile) {
  const stack = [root];
  let depth = 0;
  while (stack.length && depth < 200000) {
    const dir = stack.pop();
    depth++;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const name = ent.name;
      if (ent.isDirectory()) {
        if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
        stack.push(path.join(dir, name));
      } else if (ent.isFile() && AUDIO_EXT.has(path.extname(name).toLowerCase())) {
        onFile(path.join(dir, name), dir, name);
      }
    }
  }
}

// ------------------------------------------------------------------ parsing
/**
 * Extract cover art to a content-addressed file on disk.
 *
 * Base64 in the index was a mistake: an album's 15 tracks each carried the
 * same 200 KB image, so a 1200-track library produced a 313 MB JSON file that
 * had to be parsed into memory at every launch.
 *
 * Instead we hash the bytes, write one file per distinct image, and store only
 * the hash. Identical album art collapses to a single file, and the renderer
 * loads it lazily via a file:// URL that Chromium can cache and evict on its
 * own terms.
 */
function pickCover(pictures) {
  if (!pictures || !pictures.length) return null;
  const front = pictures.find((p) => /front|cover/i.test(p.type || "")) || pictures[0];
  if (!front || !front.data || !front.data.length) return null;
  const bytes = Buffer.from(front.data);

  // Hash the FULL buffer. A sampled hash collided across different album art
  // (covers often share headers/palettes and differ only in the middle), which
  // would silently show the wrong artwork. sha1 over ~200 KB is ~0.1 ms — far
  // cheaper than the disk read we just did.
  const digest = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 20);
  const ext = /png/i.test(front.format || "") ? "png" : "jpg";
  const id = `${digest}.${ext}`;
  const file = path.join(artDir(), id);

  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(artDir(), { recursive: true });
      writeResized(file, bytes, id);
    }
  } catch { return null; }
  return id;
}

/**
 * Write two derivatives instead of the raw embedded image.
 *
 * Chromium decodes artwork to uncompressed RGBA when it paints: a 3000x3000
 * cover costs ~34 MB of renderer/GPU memory *each*. Lists only ever show them
 * a few hundred pixels wide, so storing the original was the single biggest
 * driver of GPU + renderer RSS.
 *
 *   <id>       thumbnail (320px) — grids, tables, the dock
 *   <id>.full  detail (900px)    — Now Playing / backdrop
 */
const THUMB_PX = 320;
const FULL_PX = 900;

function writeResized(file, bytes, id) {
  let img;
  try { img = nativeImage.createFromBuffer(bytes); } catch { img = null; }
  if (!img || img.isEmpty()) { fs.writeFileSync(file, bytes); return; }

  const { width, height } = img.getSize();
  const isPng = id.endsWith(".png");
  const encode = (im) => (isPng ? im.toPNG() : im.toJPEG(86));

  const big = Math.max(width, height);
  const thumb = big > THUMB_PX ? img.resize({ width: Math.max(1, Math.round(width * THUMB_PX / big)), quality: "good" }) : img;
  fs.writeFileSync(file, encode(thumb));

  // only keep a separate large copy when it's meaningfully bigger
  if (big > FULL_PX * 1.15) {
    const full = img.resize({ width: Math.max(1, Math.round(width * FULL_PX / big)), quality: "good" });
    fs.writeFileSync(file + ".full", encode(full));
  } else if (big > THUMB_PX) {
    fs.writeFileSync(file + ".full", encode(img));
  }
}

function firstTag(native, keys) {
  if (!native) return null;
  for (const tags of Object.values(native)) {
    for (const t of tags) if (keys.includes(t.id) && t.value != null) return String(t.value);
  }
  return null;
}

async function parseOne(file, dir, name, stat) {
  const { parseFile } = await mm();
  const rec = {
    path: file, folder: dir, name,
    size: stat.size, mtime: stat.mtimeMs,
    title: name.replace(/\.[^.]+$/, ""),
    artist: "", albumArtist: "", album: "", genre: "", composer: "", lyricist: "",
    year: null, trackNo: null, trackOf: null, discNo: null, discOf: null,
    duration: 0, bitrate: 0, sampleRate: 44100, bitDepth: null, channels: 2,
    codec: path.extname(name).slice(1).toUpperCase(), lossless: false,
    isrc: null, mbid: null, bpm: null, key: null,
    rgTrackGain: null, rgTrackPeak: null,
    coverId: null, lyrics: null,
  };
  try {
    const m = await parseFile(file, { duration: true, skipPostHeaders: false });
    const c = m.common || {}, f = m.format || {};
    if (c.title) rec.title = c.title;
    rec.artist = c.artists?.join("; ") || c.artist || "";
    rec.albumArtist = c.albumartist || "";
    rec.album = c.album || "";
    rec.genre = (c.genre || []).join("; ");
    rec.composer = (c.composer || []).join("; ");
    rec.lyricist = (c.lyricist || []).join("; ");
    rec.year = c.year ?? null;
    rec.trackNo = c.track?.no ?? null; rec.trackOf = c.track?.of ?? null;
    rec.discNo = c.disk?.no ?? null; rec.discOf = c.disk?.of ?? null;
    rec.duration = f.duration || 0;
    rec.bitrate = f.bitrate ? Math.round(f.bitrate / 1000) : 0;
    rec.sampleRate = f.sampleRate || 44100;
    rec.bitDepth = f.bitsPerSample ?? null;
    rec.channels = f.numberOfChannels || 2;
    rec.codec = f.codec || rec.codec;
    rec.lossless = !!f.lossless;
    rec.isrc = (c.isrc || [])[0] || null;
    rec.mbid = c.musicbrainz_recordingid || firstTag(m.native, ["UFID", "MusicBrainz Track Id"]) || null;
    rec.bpm = c.bpm ? Math.round(Number(c.bpm)) : null;
    rec.key = c.key || firstTag(m.native, ["TKEY", "initialkey", "INITIALKEY"]) || null;
    rec.rgTrackGain = c.replaygain_track_gain?.dB ?? null;
    rec.rgTrackPeak = c.replaygain_track_peak?.ratio ?? null;
    rec.coverId = pickCover(c.picture);
    const sylt = c.lyrics?.find((l) => l.syncText?.length);
    if (sylt?.syncText) {
      rec.lyrics = { synced: true, ms: sylt.timeStampFormat === "milliseconds" || sylt.timeStampFormat === 2,
        lines: sylt.syncText.filter((x) => x.timestamp !== undefined).map((x) => ({ t: x.timestamp || 0, x: (x.text || "").trim() })) };
    } else {
      const text = c.lyrics?.map((l) => (typeof l === "string" ? l : l.text || "")).join("\n") || null;
      if (text) rec.lyrics = { synced: false, text };
    }
  } catch {
    rec.parseError = true;
  }
  return rec;
}

// ------------------------------------------------------------------ scanning
/**
 * Scan `roots`, reusing cached records whose size+mtime are unchanged.
 * Streams batches to `send(batch, progress)`.
 */
async function scanRoots(roots, send, { force = false, concurrency = 8 } = {}) {
  const found = [];
  for (const root of roots) {
    await walk(root, (file, dir, name) => found.push({ file, dir, name }));
  }

  const total = found.length;
  send(null, { phase: "walked", total, done: 0 });

  const results = [];
  let done = 0, reused = 0, parsed = 0;
  let batch = [];

  const flush = (finalise = false) => {
    if (!batch.length && !finalise) return;
    const b = batch; batch = [];
    send(b, { phase: "parsing", total, done, reused, parsed });
  };

  let cursor = 0;
  const seenPaths = new Set();

  async function worker() {
    while (cursor < found.length) {
      const { file, dir, name } = found[cursor++];
      seenPaths.add(file);
      let stat;
      try { stat = await fsp.stat(file); } catch { done++; continue; }

      const cached = index.get(file);
      let rec;
      if (!force && cached && cached.size === stat.size && Math.abs(cached.mtime - stat.mtimeMs) < 2) {
        rec = cached; reused++;
      } else {
        rec = await parseOne(file, dir, name, stat);
        index.set(file, rec);
        scheduleSave();
        parsed++;
      }
      results.push(rec);
      batch.push(rec);
      done++;
      if (batch.length >= 150) flush();
      // let the event loop breathe so the window stays responsive
      if (done % 300 === 0) await new Promise((r) => setImmediate(r));
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  flush(true);

  // drop index entries for files that no longer exist under these roots
  for (const key of [...index.keys()]) {
    if (!seenPaths.has(key) && roots.some((r) => key.startsWith(r))) { index.delete(key); indexDirty = true; }
  }
  saveIndexNow();
  pruneArtwork();

  send(null, { phase: "done", total, done, reused, parsed });
  return { total, reused, parsed };
}

/** Everything already known for these roots — served from the on-disk index. */
function cachedFor(roots) {
  if (!roots.length) return [];
  const out = [];
  for (const rec of index.values()) if (roots.some((r) => rec.path.startsWith(r))) out.push(rec);
  return out;
}

/** Remove artwork files no longer referenced by any indexed track. */
function pruneArtwork() {
  try {
    const used = new Set();
    for (const r of index.values()) if (r.coverId) used.add(r.coverId);
    for (const f of fs.readdirSync(artDir())) {
      const base = f.endsWith(".full") ? f.slice(0, -5) : f;
      if (!used.has(base)) { try { fs.unlinkSync(path.join(artDir(), f)); } catch { /* ignore */ } }
    }
  } catch { /* no artwork dir yet */ }
}

function clearIndex() {
  index = new Map();
  indexDirty = true;
  saveIndexNow();
  try { fs.rmSync(artDir(), { recursive: true, force: true }); } catch { /* ignore */ }
}

module.exports = { loadIndex, saveIndexNow, scanRoots, cachedFor, clearIndex, AUDIO_EXT, indexFile, artDir };
