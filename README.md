# SaltBee

A MusicBee × AIMP desktop music player with Salt Player's Now-Playing/lyrics look and cover-adaptive theming.

## Run as a desktop app

```bash
npm install
npm run build
npx electron electron/main.cjs        # frameless window, dock-to-top, CLI bridge on :7788
```

Package it with `npx electron-builder` (or `electron-packager`) pointing at `electron/main.cjs` as the entry.
Set `SALTBEE_CLI` to your tagging CLI executable so the **Re-tag via CLI** menu (fix metadata / re-translate / Demucs acapella) shells out to it.

## Notes on the engine

* Decoding + DSP run on the Web Audio graph in 32-bit float (FLAC, ALAC*, MP3, AAC, Opus, Vorbis, WAV, AIFF).
  `*` ALAC/DSD/APE decode depends on the platform codecs; the Electron build can bundle an FFmpeg decoder.
* Gapless is engine-level: the next track is decoded ahead and scheduled on the audio clock. Crossfade uses
  per-transition curves (equal-power, linear, S-curve, log) and shows progress on the seek bar.
* "Bit-perfect" mode re-clocks the AudioContext to the source sample rate so no engine resampling occurs.
  WASAPI-exclusive / ASIO host selection is where a native addon plugs in (see `electron/main.cjs`).
