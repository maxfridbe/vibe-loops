# Vibe Loops

A serverless, single-page loop-based DAW that runs entirely in one browser.
FL-Studio-style non-linear playlist in the middle, a modern ribbon shell in
the [vibe_sheet](https://github.com/maxfridbe/vibe_sheet) paradigm on top, and
a loop library that lives inside a SQLite file — opened with SQLite WASM,
saved back out as a self-contained `.vibeloop` project, and exported to MP3
without ever touching a server.

All implemented functionality is tracked with requirement IDs in
[requirements.md](requirements.md).

## What it does

- **Browser pane (left)** — the loop library, grouped by category with BPM /
  key / license badges. Click to audition, drag onto the playlist to place.
- **Playlist (middle)** — decoupled clip tracks hosting **loop clips**
  (waveform previews, loop tiling, slip offsets) and **automation clips**
  (tension-curve splines targeting track volume, track pan, or master volume)
  on the same lanes.
- **Ribbon (top)** — project (new/open/save), undo/redo, transport
  (play/stop, bar.beat readout, BPM, master volume), tools
  (draw/paint/slice/mute/select + snap), clip placement mode, MP3/WAV export.
- **True time-stretch** — every loop is conformed to the project tempo by a
  WSOLA pitch-preserving stretcher written in TypeScript; change the BPM and
  everything re-locks.
- **`.vibeloop` files** — projects are SQLite databases with the loops'
  mp3 audio embedded as BLOBs, so a project file is fully portable.
- **Export** — the arrangement renders offline (faster than realtime) through
  the same scheduler as playback, then encodes to MP3 (lamejs) or WAV.
- **Themes** — 20 color themes (10 dark, 10 light) implemented as CSS
  custom-property sets, switchable live from the ribbon and remembered in
  `localStorage`.

### Controls

| Action | Input |
|---|---|
| Place focused clip | Draw tool (P), click empty lane |
| Stamp repeated clips | Paint tool (B), drag |
| Move / cross-track move | drag a clip |
| Resize | drag clip edges |
| Slip audio inside clip | Shift-drag |
| Split clip | Slice tool (C), click |
| Toggle clip mute | Mute tool (T), click |
| Marquee select | Select tool (E), drag; Del deletes |
| Delete clip | right-click |
| Bypass snap | hold Alt |
| Add automation point | Ctrl-click the curve |
| Remove automation point | right-click the point |
| Segment tension | drag the square mid-segment handle |
| Play / stop | Space |
| Seek / scrub | click / drag the bar ruler |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |

## Architecture

No Node/npm dependency chain. The repository contains everything needed to
build and run:

- **`src/`** — TypeScript sources, compiled by `tsc` alone
  (`--module amd --outFile`) into the single bundle `dist/vibe-loops.js`.
  Module loading in the page is done by `lib/mini-amd.js`, a ~40-line AMD
  loader that is part of this project. No webpack, no babel, no bundler.
- **`lib/`** — vendored, version-pinned runtime libraries committed to the
  repo: React + ReactDOM (UMD), sql.js (SQLite WASM), lamejs.
  `scripts/fetch-libs.sh` re-downloads them; `scripts/gen-index.sh` injects a
  `sha384` SRI hash for every `<script>` into `index.html` at build time, so
  the hashes in the HTML always match the shipped files.
- **`typings/`** — dev-only `.d.ts` files (React types etc.), fetched once
  from npm tarballs and committed. Never shipped.
- **`assets/loops/`** + **`assets/loops.tsv`** — the starter collection:
  12 CC0 loops from the Sonic Pi sample library (flac→mp3 via ffmpeg) and
  4 loops synthesized from scratch by ffmpeg expression filters
  (`scripts/make-loops.sh`). All under 20 seconds.
- **`scripts/build-library.sh`** — packs the loops + metadata into
  `dist/library.vibeloop` using only the `sqlite3` CLI (`readfile()`).
- **UI scaling** — every dimension in the interface is `em`/`rem` based
  (`%`/`vh` only for full-viewport fills), so the whole DAW scales
  typographically with the browser's root font size.

### Build

```sh
./Build.sh
```

Steps: `tsc` → single AMD bundle · `sqlite3` → `library.vibeloop` · copy
static assets · `openssl` → SRI-hashed `index.html`. Output is a fully
static `dist/` you can serve from anywhere (e.g.
`python3 -m http.server -d dist`).

Requirements: `tsc` (TypeScript 6), `sqlite3`, `openssl`. Regenerating the
loop collection additionally needs `curl` and `ffmpeg`.

### Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages (set the repository's Pages source to
"GitHub Actions").

### `.vibeloop` format

A `.vibeloop` file is a SQLite database (schema v1, see
`scripts/schema.sql`): `meta` (name, bpm, ppq…), `loops` (metadata + mp3
BLOB), `tracks`, `clips` (tick-based, 96 PPQ), `automation_clips` +
`automation_points` (normalized positions, values, tension). The shipped
starter library is the same format with an empty arrangement.

## Licenses

- Project code: ISC.
- Sonic Pi sample loops: CC0 ([source](https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples)).
- Synthesized loops: CC0 by construction.
- Vendored libraries: React/ReactDOM (MIT), sql.js (MIT), lamejs (LGPL-3.0,
  vendored unmodified as a separate file).
