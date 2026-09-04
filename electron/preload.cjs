const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const h = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("saltbee", {
  isElectron: true,
  platform: process.platform,

  // window
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:isMaximized"),
  onWindowState: on("win:state"),

  // AIMP-style dock
  dock: (v) => ipcRenderer.send("win:dock", v),
  dockExpand: (v) => ipcRenderer.send("win:dockExpand", v),
  dockAutoHide: (v) => ipcRenderer.send("win:dockAutoHide", v),
  pin: (v) => ipcRenderer.send("win:pin", v),
  setOpacity: (v) => ipcRenderer.send("win:opacity", v),
  onDockState: on("dock:state"),
  onDockRevealed: on("dock:revealed"),

  // filesystem
  pickFolder: () => ipcRenderer.invoke("fs:pickFolder"),
  pickFiles: () => ipcRenderer.invoke("fs:pickFiles"),
  scan: (root) => ipcRenderer.invoke("fs:scan", root),
  onScanProgress: on("fs:scanProgress"),
  readFile: (p) => ipcRenderer.invoke("fs:read", p),
  readText: (p) => ipcRenderer.invoke("fs:readText", p),
  writeText: (p, t) => ipcRenderer.invoke("fs:writeText", p, t),
  stat: (p) => ipcRenderer.invoke("fs:stat", p),
  reveal: (p) => ipcRenderer.send("shell:reveal", p),
  openExternal: (u) => ipcRenderer.send("shell:open", u),

  // Salt Player desktop lyrics (floating always-on-top window)
  toggleLyricsWindow: (on) => ipcRenderer.send("lyrics:toggle", on),
  pushLyrics: (payload) => ipcRenderer.send("lyrics:update", payload),
  onLyricsData: on("lyrics:data"),
  onLyricsClosed: on("lyrics:closed"),
  lyricsControl: (action) => ipcRenderer.send("lyrics:control", action),
  lyricsLock: (locked) => ipcRenderer.send("lyrics:lock", locked),

  // helpers
  cli: (payload) => ipcRenderer.invoke("cli:run", payload),

  // global media keys / tray
  onMedia: (cb) => {
    const offs = ["playpause", "next", "prev", "stop", "lyrics"].map((k) =>
      on(`media:${k}`)(() => cb(k))
    );
    return () => offs.forEach((f) => f());
  },
  onOpenFiles: on("open:files"),
  onTrimMemory: on("app:trimMemory"),
});
