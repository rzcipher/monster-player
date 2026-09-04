// SaltBee — native Windows/macOS/Linux shell.
//
//  * frameless, acrylic-ish window with custom title bar
//  * AIMP-style dock: the window becomes a strip across the top of the display,
//    always-on-top, and AUTO-HIDES to a 3px sliver. Move the mouse to the top
//    edge of the screen and it slides back down ("call it down on hover").
//  * native folder scanning (no browser File System Access API needed)
//  * global media hotkeys, tray icon, single-instance, window-state memory
//  * local CLI bridge for the tagging/Demucs helpers
const { app, BrowserWindow, ipcMain, screen, shell, dialog, globalShortcut, Tray, Menu, nativeImage, powerSaveBlocker, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const library = require("./library.cjs");

const DOCK_HEIGHT = 58;
const DOCK_EXPANDED_HEIGHT = 720;
const PEEK = 3;              // pixels of window left on screen when auto-hidden
const HOVER_ZONE = 4;        // how close to the top edge the cursor must get
const REVEAL_MS = 90;        // animation step interval
const HIDE_DELAY = 700;      // grace period before hiding again

protocol.registerSchemesAsPrivileged([
  { scheme: "saltbee-art", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

const isWin = process.platform === "win32";
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

let win = null;
let tray = null;
let normalBounds = null;
let dock = { on: false, expanded: false, autoHide: true, revealed: true };
let hoverTimer = null;
let hideTimer = null;
let animTimer = null;
let psb = null;
let lyricsWin = null;

// ---------------------------------------------------------------- audio flags
// Give the Web Audio graph the cleanest path Chromium offers; the native
// WASAPI-exclusive / ASIO hook lives in an optional addon (see README).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", [
  "AudioServiceOutOfProcess",     // keep audio in-process: one less child process
  "HardwareMediaKeyHandling",     // we register our own global media keys
  "MediaSessionService",
  "SpareRendererForSitePerProcess", // Chromium keeps a spare renderer warm (~80 MB) — we only ever have one page
  "Translate",
  "OptimizationHints",
  "CalculateNativeWinOcclusion",
  "site-per-process",             // single local origin — isolation costs a process each
  "IsolateOrigins",
  "BackForwardCache",             // no navigation in this app
].join(","));
app.commandLine.appendSwitch("enable-features", "WebAudioSinkSelection");
// A music player has no business holding a 4 GB heap. Cap it so V8 collects
// decoded PCM aggressively instead of letting it pile up.
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=384 --expose-gc");
app.commandLine.appendSwitch("renderer-process-limit", "1");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
// We are a single-origin local app: site isolation buys us nothing and costs a
// process (plus its own heap) per site. This is what trims the helper count.
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("process-per-site");


// ------------------------------------------------------- blob-storage cleanup
/**
 * Reclaim leaked Chromium blob spill files.
 *
 * Older builds wrapped every scanned track in `new File([bytes])` and kept it
 * alive on the Track object. Chromium registers each of those in its blob
 * store and, past an in-memory quota, pages them out to
 * %APPDATA%/SaltBee/blob_storage/<uuid>/ as ~10 MB chunk files — which is how
 * a single library import grew to ~11 GB on disk.
 *
 * The renderer no longer creates those blobs at all, but existing installs
 * still have the spill directory. Blob storage is scratch space that Chromium
 * recreates on demand, so deleting it at startup (before any window exists) is
 * safe and frees the space immediately.
 */
function reclaimBlobStorage() {
  const dir = path.join(app.getPath("userData"), "blob_storage");
  let freed = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        for (const f of fs.readdirSync(full)) {
          try { freed += fs.statSync(path.join(full, f)).size; } catch { /* ignore */ }
        }
      } catch {
        try { freed += fs.statSync(full).size; } catch { /* ignore */ }
      }
      fs.rmSync(full, { recursive: true, force: true });
    }
  } catch { /* in use — Chromium will clean it up itself */ }
  if (freed > 0) console.log(`[SaltBee] reclaimed ${(freed / 1073741824).toFixed(2)} GB of stale blob storage`);
  return freed;
}

let reclaimedBytes = 0;
ipcMain.handle("app:reclaimed", () => reclaimedBytes);
ipcMain.handle("app:diskUsage", () => {
  const root = app.getPath("userData");
  const walk = (d) => {
    let n = 0;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) n += walk(full);
      else { try { n += fs.statSync(full).size; } catch { /* ignore */ } }
    }
    return n;
  };
  return { path: root, bytes: walk(root) };
});

// -------------------------------------------------------------- window state
function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return null; }
}
function saveState() {
  if (!win || win.isDestroyed() || dock.on) return;
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getBounds(), maximized: win.isMaximized() }));
  } catch { /* ignore */ }
}

function createWindow() {
  const st = readState();
  win = new BrowserWindow({
    width: st?.width || 1500,
    height: st?.height || 900,
    x: st?.x, y: st?.y,
    minWidth: 940, minHeight: DOCK_HEIGHT,
    frame: false,
    backgroundColor: "#0d0b14",
    titleBarStyle: "hidden",
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false,
      webSecurity: true,
    },
  });
  if (st?.maximized) win.maximize();

  const devUrl = process.env.SALTBEE_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  win.once("ready-to-show", () => win.show());
  win.on("maximize", () => win.webContents.send("win:state", { maximized: true }));
  win.on("unmaximize", () => win.webContents.send("win:state", { maximized: false }));
  win.on("resize", saveState);
  win.on("move", saveState);
  win.on("close", saveState);
  win.on("closed", () => (win = null));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  // keep the audio clock accurate while the app is minimised / screen sleeps
  if (!psb) psb = powerSaveBlocker.start("prevent-app-suspension");

  // Ask the OS to reclaim our working set when the window isn't on screen.
  // On Windows this hands pages back to the system rather than squatting on them.
  const trim = () => {
    if (!win || win.isDestroyed()) return;
    try { win.webContents.send("app:trimMemory"); } catch { /* ignore */ }
  };
  win.on("minimize", trim);
  win.on("hide", trim);
}

// ------------------------------------------------------------------ docking
function displayForCursor() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

function dockHeight() {
  return dock.expanded ? DOCK_EXPANDED_HEIGHT : DOCK_HEIGHT;
}

function applyDockBounds(y) {
  const d = displayForCursor();
  win.setBounds({ x: d.x, y, width: d.width, height: dockHeight() }, false);
}

/** Slide the docked strip to `targetY` with a short ease-out animation. */
function slideTo(targetY, done) {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  const step = () => {
    if (!win || win.isDestroyed()) return stop();
    const y = win.getBounds().y;
    const delta = targetY - y;
    if (Math.abs(delta) <= 2) { applyDockBounds(targetY); return stop(); }
    applyDockBounds(Math.round(y + delta * 0.34));
  };
  const stop = () => { clearInterval(animTimer); animTimer = null; done?.(); };
  animTimer = setInterval(step, REVEAL_MS / 6);
}

function reveal() {
  if (!dock.on || dock.revealed) return;
  dock.revealed = true;
  const d = displayForCursor();
  slideTo(d.y);
  win.webContents.send("dock:revealed", true);
}

function conceal() {
  if (!dock.on || !dock.revealed || !dock.autoHide || dock.expanded) return;
  dock.revealed = false;
  const d = displayForCursor();
  slideTo(d.y - dockHeight() + PEEK);
  win.webContents.send("dock:revealed", false);
}

/** Poll the cursor: near the top edge → call the player down; away → hide. */
function startHoverWatch() {
  if (hoverTimer) return;
  hoverTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !dock.on || !dock.autoHide) return;
    const p = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(p).workArea;
    const nearTop = p.y <= d.y + HOVER_ZONE;
    const b = win.getBounds();
    const insideStrip = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

    if (nearTop && !dock.revealed) {
      clearTimeout(hideTimer);
      reveal();
    } else if (dock.revealed && !insideStrip && !nearTop) {
      if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = null; conceal(); }, HIDE_DELAY);
    } else if (insideStrip || nearTop) {
      clearTimeout(hideTimer); hideTimer = null;
    }
  }, 120);
}
function stopHoverWatch() {
  clearInterval(hoverTimer); hoverTimer = null;
  clearTimeout(hideTimer); hideTimer = null;
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
}

function setDocked(on) {
  if (!win) return;
  dock.on = !!on;
  if (dock.on) {
    if (!win.isMaximized()) normalBounds = win.getBounds();
    win.unmaximize();
    win.setResizable(false);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    dock.revealed = true;
    applyDockBounds(displayForCursor().y);
    startHoverWatch();
  } else {
    stopHoverWatch();
    dock.expanded = false;
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
    win.setResizable(true);
    if (normalBounds) win.setBounds(normalBounds);
  }
  win.webContents.send("dock:state", dock);
}

ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());
ipcMain.on("win:dock", (_e, on) => setDocked(on));
ipcMain.on("win:dockAutoHide", (_e, on) => {
  dock.autoHide = !!on;
  if (dock.on) { if (dock.autoHide) startHoverWatch(); else { stopHoverWatch(); reveal(); } }
  win?.webContents.send("dock:state", dock);
});
ipcMain.on("win:dockExpand", (_e, expanded) => {
  if (!win) return;
  dock.expanded = !!expanded;
  if (dock.on) applyDockBounds(displayForCursor().y);
  win.webContents.send("dock:state", dock);
});
ipcMain.on("win:pin", (_e, on) => win?.setAlwaysOnTop(!!on, "screen-saver"));
ipcMain.on("win:opacity", (_e, v) => win?.setOpacity(Math.max(0.25, Math.min(1, Number(v) || 1))));
ipcMain.handle("win:isMaximized", () => !!win?.isMaximized());

// --------------------------------------------------------- native filesystem
const AUDIO_EXT = library.AUDIO_EXT;

ipcMain.handle("fs:pickFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Choose your music folder" });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("fs:pickFiles", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }],
  });
  return r.canceled ? [] : r.filePaths;
});

/** Recursively list audio files under `root` (native, fast, no permission prompts). */
/**
 * Indexed library API.
 *
 * lib:cached  — instant: whatever the on-disk index already knows
 * lib:scan    — walk + parse in the main process, streaming batches back;
 *               unchanged files (same size+mtime) are reused from the index
 */
ipcMain.handle("lib:cached", (_e, roots) => library.cachedFor(roots || []));

ipcMain.handle("lib:scan", async (e, roots, opts) => {
  const send = (batch, progress) => {
    if (e.sender.isDestroyed()) return;
    if (batch && batch.length) e.sender.send("lib:batch", batch);
    if (progress) e.sender.send("lib:progress", progress);
  };
  try {
    return await library.scanRoots(roots || [], send, opts || {});
  } catch (err) {
    console.warn("[SaltBee] scan failed", err);
    return { total: 0, reused: 0, parsed: 0, error: String(err && err.message) };
  }
});

ipcMain.handle("lib:clearIndex", () => { library.clearIndex(); return true; });


ipcMain.handle("fs:read", async (_e, file) => {
  const buf = await fsp.readFile(file);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
ipcMain.handle("fs:readText", async (_e, file) => { try { return await fsp.readFile(file, "utf8"); } catch { return null; } });
ipcMain.handle("fs:writeText", async (_e, file, text) => { await fsp.writeFile(file, text, "utf8"); return true; });
ipcMain.handle("fs:stat", async (_e, file) => { try { const s = await fsp.stat(file); return { size: s.size, mtime: s.mtimeMs }; } catch { return null; } });
ipcMain.on("shell:reveal", (_e, file) => shell.showItemInFolder(file));
ipcMain.on("shell:open", (_e, url) => shell.openExternal(url));

// ------------------------------------------------------------------- CLI bridge
function runCli(payload) {
  return new Promise((resolve) => {
    const { action, path: file, isrc, mbid } = payload;
    const cli = process.env.SALTBEE_CLI || "musiccli";
    const args = {
      "fix-metadata": ["fix", file, ...(mbid ? ["--mbid", mbid] : isrc ? ["--isrc", isrc] : [])],
      retranslate: ["translate", file, "--force"],
      "demucs-acapella": ["demucs", file, "--stem", "vocals", "--sidecar"],
      retag: ["retag", file],
    }[action];
    if (!args) return resolve({ code: 400, out: "unknown action" });
    const child = spawn(cli, args, { shell: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => resolve({ code: 500, out: String(err) }));
    child.on("close", (code) => resolve({ code: code === 0 ? 200 : 500, out }));
  });
}
ipcMain.handle("cli:run", (_e, payload) => runCli(payload));

function startCliBridge() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method !== "POST" || req.url !== "/action") { res.writeHead(404); return res.end(); }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const r = await runCli(JSON.parse(body));
        res.writeHead(r.code === 200 ? 200 : r.code, { "Content-Type": "text/plain" });
        res.end(r.out);
      } catch (err) { res.writeHead(400); res.end(String(err)); }
    });
  });
  server.on("error", () => { /* port busy — the IPC path still works */ });
  server.listen(7788, "127.0.0.1");
}

// ------------------------------------------------- Salt Player desktop lyrics
// A frameless, click-through-ish always-on-top strip that floats over every
// other window and shows the current line. Drag it anywhere; it remembers where.
function createLyricsWindow() {
  if (lyricsWin && !lyricsWin.isDestroyed()) { lyricsWin.show(); return; }
  const d = screen.getPrimaryDisplay().workArea;
  const W = Math.min(1000, Math.round(d.width * 0.62));
  const H = 150;
  lyricsWin = new BrowserWindow({
    width: W, height: H,
    x: d.x + Math.round((d.width - W) / 2),
    y: d.y + d.height - H - 70,
    frame: false, transparent: true, resizable: true, movable: true,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  lyricsWin.setAlwaysOnTop(true, "screen-saver");
  lyricsWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lyricsWin.loadFile(path.join(__dirname, "lyrics.html"));
  lyricsWin.on("closed", () => { lyricsWin = null; win?.webContents.send("lyrics:closed"); });
}

ipcMain.on("lyrics:toggle", (_e, on) => {
  if (on) createLyricsWindow();
  else if (lyricsWin && !lyricsWin.isDestroyed()) lyricsWin.close();
});
// the renderer pushes {line, next, title, artist, accent, progress}; we relay it
ipcMain.on("lyrics:update", (_e, payload) => {
  if (lyricsWin && !lyricsWin.isDestroyed()) lyricsWin.webContents.send("lyrics:data", payload);
});
ipcMain.on("lyrics:lock", (_e, locked) => {
  if (!lyricsWin || lyricsWin.isDestroyed()) return;
  lyricsWin.setIgnoreMouseEvents(!!locked, { forward: true });
});
ipcMain.on("lyrics:control", (_e, action) => {
  if (action === "close") { lyricsWin?.close(); return; }
  win?.webContents.send(`media:${action}`);
});

// ------------------------------------------------------------- tray + hotkeys
function trayIcon() {
  const p = path.join(__dirname, "..", "build", "icon.png");
  if (fs.existsSync(p)) return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
  return nativeImage.createEmpty();
}
function buildTray() {
  try {
    tray = new Tray(trayIcon());
    const send = (ch) => () => win?.webContents.send(ch);
    tray.setToolTip("SaltBee");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show / hide", click: () => (win?.isVisible() ? win.hide() : (win?.show(), win?.focus())) },
      { label: "Play / pause", click: send("media:playpause") },
      { label: "Next", click: send("media:next") },
      { label: "Previous", click: send("media:prev") },
      { type: "separator" },
        { label: "Dock to top of screen", type: "checkbox", checked: dock.on, click: (i) => setDocked(i.checked) },
      { label: "Desktop lyrics", type: "checkbox", checked: !!lyricsWin, click: (i) => (i.checked ? createLyricsWindow() : lyricsWin?.close()) },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on("click", () => (win?.isVisible() ? win.focus() : win?.show()));
  } catch { /* no tray on this platform */ }
}

function registerHotkeys() {
  const map = {
    MediaPlayPause: "media:playpause",
    MediaNextTrack: "media:next",
    MediaPreviousTrack: "media:prev",
    MediaStop: "media:stop",
    "CommandOrControl+Alt+D": "media:dock",
    "CommandOrControl+Alt+L": "media:lyrics",
    "CommandOrControl+Alt+K": "media:desktopLyrics",
  };
  for (const [accel, ch] of Object.entries(map)) {
    try { globalShortcut.register(accel, () => { if (ch === "media:dock") setDocked(!dock.on); else win?.webContents.send(ch); }); } catch { /* taken */ }
  }
}

// ------------------------------------------------------------------ lifecycle
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    const files = argv.slice(1).filter((a) => AUDIO_EXT.has(path.extname(a).toLowerCase()));
    if (files.length) win.webContents.send("open:files", files);
  });

  app.whenReady().then(() => {
    if (isWin) app.setAppUserModelId("com.saltbee.player");
    // must run before any renderer starts using blob storage
    reclaimedBytes = reclaimBlobStorage();
    // Serve cover art straight off disk. Chromium caches and evicts these
    // itself, so artwork never sits permanently in the JS heap.
    protocol.handle("saltbee-art", (req) => {
      const id = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ""));
      if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return new Response(null, { status: 400 });
      let file = path.join(library.artDir(), id);
      // ".full" is optional — small covers only have the one derivative
      if (id.endsWith(".full") && !fs.existsSync(file)) file = file.slice(0, -5);
      if (!fs.existsSync(file)) return new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    const n = library.loadIndex();
    if (n) console.log(`[SaltBee] library index loaded: ${n} tracks`);
    createWindow();
    startCliBridge();
    buildTray();
    registerHotkeys();
    const files = process.argv.slice(1).filter((a) => AUDIO_EXT.has(path.extname(a).toLowerCase()));
    if (files.length) win.webContents.once("did-finish-load", () => win.webContents.send("open:files", files));
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on("will-quit", () => {
  library.saveIndexNow(); globalShortcut.unregisterAll(); stopHoverWatch(); });
  app.on("window-all-closed", () => app.quit());
}
