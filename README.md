# SaltBee

A **desktop application** (not a web app) that fuses the three best music players around:

| Source | What SaltBee takes from it |
| --- | --- |
| **MusicBee** | the artist browser — album-artist aggregation, multi-value artist tags, "appears on" cross-links, alphabetical index rail, cover mosaics, aggregate stats |
| **AIMP** | the engine and the organisation — 18-band EQ + DSP chain, ReplayGain/peak normalisation, gapless & crossfade, silence removal, playlist **grouping** and multi-field **sort templates**, and the dock-to-top-of-screen bar that hides off-screen and is called down on hover |
| **Salt Player** | the design — the whole UI re-tints itself from the current cover art, blurred drifting artwork backdrop, karaoke lyric sweep, floating desktop lyrics, tonal surfaces, adjustable roundness/type scale |

---

## Build the `.exe`

```bash
npm install
npm run dist:win        # → release/SaltBee-1.0.0-x64-setup.exe  +  SaltBee-1.0.0-portable.exe
```

`dist:win` produces both an **NSIS installer** (Start-menu + desktop shortcuts, choosable
install directory, per-user so no UAC prompt) and a **single-file portable .exe**.

Other targets:

```bash
npm run dist:linux      # AppImage + .deb
npm run dist:mac        # dmg + zip
npm start               # build once and run the app locally
npm run dev:app         # Vite HMR inside the real Electron window
```

CI (`.github/workflows/build.yml`) builds the Windows installer on every push and attaches
the artifacts; pushing a `v*` tag publishes a GitHub Release with the binaries. That's the
easiest way to get an `.exe` if you're not on Windows yourself.

Icons are generated from `build/icon.png` by `npm run icons` (pure Node, no native deps).

---

## The three pillars

### 1. MusicBee — the artist view

`src/components/ArtistsView.tsx` + `src/lib/grouping.ts`

* One entry per **album artist**, built by splitting multi-value tags on
  `;`, `/`, `feat.`, `ft.`, `&`, `with`, `vs.` — exactly the separators MusicBee/foobar use.
* **"Appears on"** section: releases where the artist performs but isn't the album artist,
  pulled from the track `artist` tag and `(feat. …)` in titles. No duplicate files needed.
* `sortName()` moves leading articles (`The Beatles` → `Beatles, The`) so the A–Z rail
  behaves like MusicBee's.
* Per-artist aggregates: album count, track count, total time, play count, year range,
  top genres, average rating. Cover **mosaic** (2×2) when there's no artist photo.
* Albums expand in place with per-disc grouping, inline star rating, Camelot key and
  quality badge per track.

### 2. AIMP — organisation, the engine, and the dock

**Grouping** (`GROUP_OPTIONS`) — any list buckets under sticky collapsible headers by
album · album artist · artist · genre · year · decade · folder · rating · format/quality ·
musical key · tempo range · date added. Each header carries its own count, total duration
and average rating, plus play/queue buttons.

**Sort templates** (`SORT_PRESETS`) — AIMP sorts by a *template*, not one column:
album order (artist→year→album→disc→track), artist→title, most played, top rated,
best quality first, chronological, genre→artist→album, longest, tempo ramp, and
**DJ set (Camelot → BPM)**. Click any column header to fall back to single-column sorting.

**Engine** — 32-bit float Web Audio graph, gapless scheduling on the audio clock,
crossfade with equal-power/linear/S-curve/log transitions, 18-band EQ, echo/reverb/
flanger/chorus/bass/stereo-width/pitch/tempo/voice-remover, ReplayGain from tags *or*
on-the-fly analysis, peak normalisation, loudness compensation, limiter, silence removal,
per-track trim knobs, and bit-perfect mode that re-clocks the context to the source rate.

**The dock** (`electron/main.cjs` + `src/components/DockBar.tsx`) — this is the headline
feature you asked for:

* The OS window becomes a strip across the top of the display, always-on-top and visible
  on all workspaces, including over full-screen apps.
* With **auto-hide** on it slides up until only a 3 px sliver remains. The main process
  polls the cursor; the moment it touches the top edge of the screen the strip **slides
  back down** with an ease-out animation, and parks again ~0.7 s after you leave it.
* `▾` drops the entire library down beneath the strip; `▴` collapses it again.
* Toggle from the bar, the tray, `Ctrl+D` in-app, or `Ctrl+Alt+D` from anywhere in Windows.

### 3. Salt Player — the design

`src/lib/colors.ts` builds a Material-You-style **tonal palette** from every cover:

1. quantise the artwork into perceptual hue/sat/light buckets,
2. score them for theme-worthiness (`saturation^1.35 × mid-lightness × √population`),
3. derive background, surface, two accents, text and muted tones from a dominant +
   vibrant + complementary-hue triad,
4. iteratively nudge lightness until text clears ~11:1 and accents ~3:1 contrast against
   the generated background — so neon, washed-out and near-black covers all stay legible.

Everything else reads from those CSS variables, so the whole app cross-fades to the new
colours the moment the track changes. Four modes: **adaptive dark**, **adaptive light**,
**midnight** (true-black OLED) and **monochrome**.

Also from Salt Player:

* **Blurred cover backdrop** — two stacked layers cross-fade between tracks while slowly
  drifting/breathing, with a tonal scrim and film grain over the top. Strength adjustable.
* **Karaoke lyrics** — the active line fills with the accent colour left-to-right across
  its own duration; neighbouring lines blur and shrink with distance. Click any line to seek.
  Bilingual LRC shows the translation underneath.
* **Floating desktop lyrics** (`electron/lyrics.html`) — a frameless, transparent,
  always-on-top overlay that floats above every other window with the current line,
  karaoke sweep, progress bar and transport controls. Drag it anywhere, or lock it
  click-through so it never steals a click. `Ctrl+Alt+K`.
* **Adjustable design tokens** — corner radius (0–26 px), text scale (85–135 %) and a
  master motion switch, all live.

---

## Everything else it does

* **Native library scanning** — real recursive disk walk over 25 audio extensions via IPC,
  no browser permission prompts, watched folders remembered and rescannable.
* **Formats** — FLAC, ALAC, MP3, AAC, Opus, Vorbis, WAV, AIFF, WavPack, APE, DSD, plus
  **CUE sheets** split into virtual tracks.
* **Deep tags** — title/artist/album-artist/album/year/track/disc/genre/composer/lyricist/
  ISRC/BPM/key/advisory/MusicBrainz ID, embedded art, SYLT + USLT + LRC lyrics.
* **Analysis** — loudness (ReplayGain), peak, key detection, BPM detection, waveform peaks
  and energy, run in a background queue after import.
* **Camelot key-mixing** — key chips on every row, a key-mix playback mode that picks the
  next track within ±1 on the Camelot wheel, and suggestions in Now Playing.
* **Duplicate quarantine** — groups the same recording by ISRC / MBID / title+artist+duration,
  scores each source, quarantines the losers and offers one-click "upgrade to best source"
  and "merge group" (which sums play counts and keeps the highest rating).
* **Smart playlists** with rule builders, fuzzy quick-search with operators
  (`bpm:>120 key:8A genre:pop year:<2000`), 26 sortable columns, star ratings, per-track
  trim knobs.
* **ListenBrainz scrobbling** with exact `recording_mbid`/ISRC — no fuzzy matching.
* **LRCLIB** lyric fetching, and a **CLI bridge** (IPC + `127.0.0.1:7788`) that shells out
  to your own tagging tool for fix-metadata / re-translate / Demucs acapella. Point
  `SALTBEE_CLI` at your executable.
* **Desktop integration** — tray menu, global media keys, single-instance, file
  associations (double-click a FLAC → it opens in SaltBee), window-state memory,
  "show in file explorer", drag-and-drop disk mode.

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `←` `→` | seek 5 s (`Shift` = 30 s) |
| `Ctrl+↑` `Ctrl+↓` | volume |
| `Ctrl+N` / `Ctrl+P` | next / previous |
| `L` | lyrics |
| `Ctrl+E` | sound effects |
| `Ctrl+F` | search |
| `Ctrl+D` | dock / undock |
| `Ctrl+Alt+D` | dock from anywhere in Windows *(global)* |
| `Ctrl+Alt+L` | lyrics *(global)* |
| `Ctrl+Alt+K` | floating desktop lyrics *(global)* |
| media keys | play/pause, next, previous, stop *(global)* |

## Layout

```
electron/          main process — window, hover-dock, native fs, tray, hotkeys, CLI bridge
  main.cjs         · dock auto-hide + cursor watcher + desktop-lyrics window
  preload.cjs      · contextBridge surface
  lyrics.html      · floating always-on-top lyric overlay
src/
  engine/          32-bit float Web Audio graph, gapless, crossfade, DSP
  lib/
    colors.ts      Salt Player adaptive tonal palette
    grouping.ts    AIMP grouping + MusicBee artist aggregation
    native.ts      typed bridge to the main process (null in the browser)
    desktopLyrics.ts  feeds the floating overlay
    analysis.ts    loudness / key / BPM / waveform
    metadata.ts    tag parsing, CUE splitting
  components/      ArtistsView · TrackTable · CoverGrid · DockBar · NowPlaying · …
build/             app icons (icon.png → icon.ico via scripts/make-icons.cjs)
```

Runs in a browser too (`npm run dev`) — `native` is simply `null` and it falls back to the
File System Access API, with the dock simulated in-page. The packaged `.exe` is the real
product.
