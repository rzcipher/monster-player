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
const { app } = require("electron");

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

  // FNV-1a over sampled bytes — cheap and good enough to dedupe artwork
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(bytes.length / 2048));
  for (let i = 0; i < bytes.length; i += step) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  const ext = /png/i.test(front.format || "") ? "png" : "jpg";
  const id = `${bytes.length.toString(36)}-${(h >>> 0).toString(36)}.${ext}`;
  const file = path.join(artDir(), id);

  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(artDir(), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
  } catch { return null; }
  return id;
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
      if (!used.has(f)) { try { fs.unlinkSync(path.join(artDir(), f)); } catch { /* ignore */ } }
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
