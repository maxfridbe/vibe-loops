# vibe-loops — Requirements Register

Running register of all implemented functionality. Every feature added to the
project gets an ID here. Categories:

| Prefix | Meaning |
|---|---|
| `REQ-ARCH` | Architecture & build system |
| `REQ-WFE`  | Web front-end (ribbon, browser, playlist UI) |
| `REQ-AUD`  | Audio engine |
| `REQ-DAT`  | Data model & persistence |
| `REQ-DEP`  | Deployment |
| `REQ-NFR`  | Non-functional |

Status: ✅ implemented · 🚧 planned

## Architecture & build system

| ID | Requirement | Status |
|---|---|---|
| REQ-ARCH-0001 | The application is a fully serverless single-page application; all functionality runs in one browser with no backend. | ✅ |
| REQ-ARCH-0002 | The project has **zero npm/Node package dependencies**: no `package.json`, no `node_modules`, no bundler. | ✅ |
| REQ-ARCH-0003 | All third-party runtime libraries (React, ReactDOM, sql.js, lamejs) are vendored as files in `lib/`, pinned by version in `scripts/fetch-libs.sh`. | ✅ |
| REQ-ARCH-0004 | Every `<script>` in `index.html` carries a Subresource Integrity `sha384` hash that matches the shipped file; hashes are computed and injected at build time (`scripts/gen-index.sh` from `index.html.tpl`). | ✅ |
| REQ-ARCH-0005 | TypeScript is compiled by `tsc` alone (`--module amd --outFile`) into a single bundle `dist/vibe-loops.js`; module loading is provided by the project's own ~40-line `lib/mini-amd.js`, not a third-party loader. | ✅ |
| REQ-ARCH-0006 | The build is orchestrated by `Build.sh` using only `tsc`, `sqlite3`, `openssl`, `ffmpeg` (asset prep) and coreutils. | ✅ |
| REQ-ARCH-0007 | TypeScript type definitions for vendored libraries are checked in under `typings/` (dev-only, fetched once from npm tarballs, never shipped). | ✅ |
| REQ-ARCH-0008 | The starter loop collection is assembled at build time from `assets/loops/*.mp3` + `assets/loops.tsv` into a SQLite database `dist/library.vibeloop` by `scripts/build-library.sh` (sqlite3 CLI `readfile()`; no scripting runtime). | ✅ |
| REQ-ARCH-0009 | Starter loops are acquired reproducibly by `scripts/make-loops.sh`: CC0 downloads (17 Sonic Pi samples, flac→mp3 via ffmpeg) plus 19 loops synthesized from scratch with ffmpeg expression filters (36 total); all < 20 s. | ✅ |

## Web front-end

| ID | Requirement | Status |
|---|---|---|
| REQ-WFE-0001 | The shell is a ribbon bar in the vibe_sheet paradigm: grouped icon controls with captions (project, history, transport, tools, place, export) above the workspace. | ✅ |
| REQ-WFE-0002 | A left-hand browser pane lists the loop library grouped by category with name/key/BPM, live text filtering, and collapsible categories. | ✅ |
| REQ-WFE-0003 | Clicking a loop in the browser auditions it immediately and makes it the focused clip source. | ✅ |
| REQ-WFE-0004 | Loops can be dragged from the browser onto the playlist; the drop point (track, time, snapped) instantiates a clip; a ghost label follows the cursor. | ✅ |
| REQ-WFE-0005 | The playlist is a non-linear multitrack timeline with decoupled, type-agnostic clip tracks: loop clips and automation clips coexist on any track. | ✅ |
| REQ-WFE-0006 | Loop clips render their name and a waveform preview (peaks from decoded audio), including loop-repeat tiling and slip offset; repeat boundaries are marked. | ✅ |
| REQ-WFE-0007 | Draw tool (P): click empty space places the focused clip; drag moves clips across time (X) and tracks (Y); clip edges resize; left-edge resize preserves audio phase (adjusts slip offset). | ✅ |
| REQ-WFE-0008 | Paint tool (B): click-drag stamps consecutive copies of the focused loop at loop-length cells. | ✅ |
| REQ-WFE-0009 | Slice tool (C): clicking a clip splits it into two independent clips at the (snapped) position, offsetting the second part's audio correctly. | ✅ |
| REQ-WFE-0010 | Mute tool (T): clicking a clip toggles its active state; muted clips stay visible but silent. | ✅ |
| REQ-WFE-0011 | Select tool (E): marquee selection across tracks/time; Shift toggles membership; Delete/Backspace removes the selection; dragging a selected clip moves the whole selection. | ✅ |
| REQ-WFE-0012 | Slip editing: Shift-drag shifts a clip's audio content within its static boundaries (FR-EDT-005 analogue). | ✅ |
| REQ-WFE-0013 | Grid snapping with selectable resolution (Bar, Beat, 1/2, 1/4, off); Alt temporarily bypasses snap during any gesture (FR-TLB-003/004). | ✅ |
| REQ-WFE-0014 | Right-click deletes the clip under the cursor (loop and automation clips); the browser context menu is suppressed inside the playlist. | ✅ |
| REQ-WFE-0015 | Automation clips render as tension-curve splines with draggable points; Ctrl+click adds a point, right-click removes one, square mid-segment handles drag vertically to set tension. | ✅ |
| REQ-WFE-0016 | Transport: play/stop (Space), click/scrub the ruler to seek (re-schedules live playback), animated playhead line, bar.beat position readout. | ✅ |
| REQ-WFE-0017 | Global tempo control (40–300 BPM) in the ribbon; changing it re-quantizes the grid and re-stretches audio (FR-TLB-002). | ✅ |
| REQ-WFE-0018 | Track headers: color swatch, rename (double-click), mute toggle, volume and pan sliders; tracks can be added at runtime. | ✅ |
| REQ-WFE-0019 | Undo/redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) with gesture coalescing: one drag = one history entry; 100-entry history. | ✅ |
| REQ-WFE-0020 | Tool keyboard shortcuts match the FRD: P/B/C/T/E. | ✅ |
| REQ-WFE-0021 | Horizontal zoom (0.4–10 rem per beat) adjustable from state; playlist width grows with the arrangement. | ✅ |
| REQ-WFE-0022 | A status readout in the ribbon reports the last operation (saving, rendering, errors). | ✅ |
| REQ-WFE-0023 | 20 color themes (10 dark, 10 light) implemented purely as CSS custom-property sets (`:root[data-theme=…]`); a ribbon theme picker (view group) switches them live and persists the choice in `localStorage`. | ✅ |
| REQ-WFE-0024 | UI icons are Nerd Font glyphs served from the repo's `fonts/` directory (Symbols Nerd Font via `@font-face`); icon sizes are rem-based so they scale with the interface. | ✅ |
| REQ-WFE-0025 | The ribbon is organized into tabs (Home / Export / View) with an always-visible transport cluster (play-from-start, play/stop, position, BPM, master volume) on the tab strip. | ✅ |
| REQ-WFE-0026 | The playlist cursor reflects the active tool (move for draw, copy for paint, col-resize for slice, pointer for mute, crosshair for select). | ✅ |
| REQ-WFE-0027 | Library rows expose a hover play/stop button for previews; previews respect the master volume and can be stopped mid-play. Clicking a row focuses the loop without auto-playing. | ✅ |
| REQ-WFE-0028 | Track rename uses an in-app modal dialog (Enter/Escape/buttons), not the browser prompt. | ✅ |
| REQ-WFE-0029 | The track color swatch opens a color picker on click. | ✅ |
| REQ-WFE-0030 | A play-from-beginning transport button exists with the Ctrl+Space (Cmd+Space) shortcut. | ✅ |
| REQ-WFE-0031 | The View tab offers an interface-size control (80–150%) that scales the whole rem-based UI via the root font size, persisted in `localStorage`. | ✅ |
| REQ-WFE-0032 | Every ribbon/transport control carries an explanatory hover tooltip (`title`). | ✅ |
| REQ-WFE-0033 | Clip move gestures apply deltas relative to the gesture-start position (never the current one), so dragging cannot accelerate or compound. | ✅ |
| REQ-WFE-0034 | Clip envelope mode (ribbon toggle): loop clips overlay an editable volume-envelope spline — click adds a point, points drag horizontally and vertically, mid-segment handles set tension, right-click removes a point (end point clears the envelope). Clips with envelopes always display the curve. | ✅ |
| REQ-WFE-0035 | Stretch tool (S): dragging a clip's beginning or end time-stretches the audio in place (per-clip ratio 0.25×–4×, pitch preserved); the clip label shows the ratio and the slip offset scales with it. | ✅ |
| REQ-WFE-0036 | Library loops (including imported and recorded ones) can be renamed via double-click on the browser row, using the in-app rename modal. | ✅ |
| REQ-WFE-0037 | Track volume and pan sliders are visually distinct: volume is an accent-colored ramp with a round thumb; pan has a center-notched track with a square warm-colored thumb. Both tooltips report the current value. | ✅ |
| REQ-WFE-0038 | Pressing `?` (or the ribbon help button) opens a reference dialog listing every keyboard, mouse, and touch interaction with descriptions; Esc closes it. | ✅ |
| REQ-WFE-0039 | The app works on touchscreen tablets: all gestures use Pointer Events; clips/points/ruler/trim handles own their touches (`touch-action: none`) while lanes and the browser stay scrollable; with the draw tool a tap places a clip and a drag scrolls; long-press deletes (clips, automation clips, points); double-tap adds automation points; browser loops drag out on horizontal pull and scroll on vertical swipe; coarse pointers get larger edge/point targets; preview buttons stay visible without hover; app chrome suppresses double-tap zoom. | ✅ |

## Audio engine

| ID | Requirement | Status |
|---|---|---|
| REQ-AUD-0001 | Playback uses the Web Audio API with a per-project graph: clip gain → track volume → automation gain → stereo panner → master automation → master volume. | ✅ |
| REQ-AUD-0002 | Loop mp3s are decoded once and cached; waveform peak data is derived from the decoded buffers. | ✅ |
| REQ-AUD-0003 | True time-stretching (pitch-preserving WSOLA, implemented in `src/engine/stretch.ts`) conforms every loop to the project tempo; stretched buffers are cached per (loop, BPM). | ✅ |
| REQ-AUD-0004 | The scheduler tiles loop audio across each clip with slip offset and phase anchoring, sample-scheduled via `AudioBufferSourceNode.start(when, offset, duration)`. | ✅ |
| REQ-AUD-0005 | Automation clips drive AudioParams (track volume, track pan, master volume) with interpolated tension curves via `setValueCurveAtTime`; values before/after a clip hold correctly relative to the play position. | ✅ |
| REQ-AUD-0006 | Auditioning plays a loop immediately on a preview path without interrupting arrangement playback state (FR-BRW-002 analogue). | ✅ |
| REQ-AUD-0007 | Playback stops automatically at the end of the arrangement and reports the playhead accurately during playback. | ✅ |
| REQ-AUD-0008 | Offline export renders the identical scheduling graph through `OfflineAudioContext` (faster than realtime) at 44.1 kHz stereo. | ✅ |
| REQ-AUD-0009 | Per-clip volume envelopes are applied as tension-interpolated gain curves on the clip's gain node (before the track chain) in both realtime playback and offline export, correctly windowed when playback starts mid-clip. | ✅ |
| REQ-AUD-0010 | Per-clip stretch ratios render through the WSOLA stretcher with a (loop, BPM, ratio)-keyed cache; clip audio tiles at the stretched period. | ✅ |

## Data model & persistence

| ID | Requirement | Status |
|---|---|---|
| REQ-DAT-0001 | The `.vibeloop` project format **is a SQLite database** (schema v1: `meta`, `loops`, `tracks`, `clips`, `automation_clips`, `automation_points`), read and written in-browser via sql.js (SQLite WASM). | ✅ |
| REQ-DAT-0002 | `.vibeloop` files are fully self-contained: every loop's mp3 audio is embedded as a BLOB alongside the arrangement, so a project file travels with its sounds. | ✅ |
| REQ-DAT-0003 | The starter library ships as `library.vibeloop` (same format, empty arrangement, 16 embedded loops) and is fetched once at app start; “New project” reloads it. | ✅ |
| REQ-DAT-0004 | Save downloads the current project as `<name>.vibeloop`; Open loads any `.vibeloop` from disk via file picker. | ✅ |
| REQ-DAT-0005 | Timeline data is tick-based (96 PPQ) and tempo-independent; loop metadata stores musical length in beats plus native BPM. | ✅ |
| REQ-DAT-0006 | Editing is non-destructive: slicing, slipping, and resizing store metadata only; source mp3 blobs are never modified (INT-DAT-001 analogue). | ✅ |
| REQ-DAT-0007 | Mixdown export encodes MP3 in-browser via vendored lamejs (192 kbps) and WAV (16-bit PCM), delivered as downloads. | ✅ |
| REQ-DAT-0008 | Loop provenance (license, source URL) is tracked per loop from `assets/loops.tsv` into the database. | ✅ |
| REQ-DAT-0009 | Users can import `.mp3` and `.wav` files into the library; imports pass through a trim dialog (waveform, draggable in/out handles, preview, name/category/beats) and are re-encoded to mp3 for storage. | ✅ |
| REQ-DAT-0010 | Users can import `.mid`/`.midi` files: a built-in SMF parser (formats 0/1, PPQ, tempo) feeds a small offline synth (detuned triangles + lowpass) whose render enters the same trim dialog. | ✅ |
| REQ-DAT-0011 | Users can record loops from the microphone (getUserMedia + MediaRecorder) into the same trim dialog and thus into the library. | ✅ |
| REQ-DAT-0012 | Imported/recorded loops persist like any other: they are embedded in saved `.vibeloop` files and auto-focused for immediate placement. | ✅ |
| REQ-DAT-0013 | Clip envelopes persist in `.vibeloop` (format v2, `clip_envelope_points` table); v1 files without the table load cleanly. Slicing a clip splits its envelope correctly across both halves. | ✅ |
| REQ-DAT-0014 | Per-clip stretch persists as `clips.stretch_ticks` (NULL = natural length); v1 files load with no stretch. | ✅ |

## Deployment

| ID | Requirement | Status |
|---|---|---|
| REQ-DEP-0001 | `git push` to `main` triggers a GitHub Actions workflow that runs `Build.sh` and publishes `dist/` to GitHub Pages. | ✅ |
| REQ-DEP-0002 | The deployed site is static-host friendly: same-origin fetches only, no custom headers required (no SharedArrayBuffer/COOP/COEP). | ✅ |

## Non-functional

| ID | Requirement | Status |
|---|---|---|
| REQ-NFR-0001 | All UI sizing uses `rem`/`em` units (with `%`/`vh` only for full-viewport fills) so the entire interface scales typographically with the root font size; mouse math converts px→rem through the live root font size. | ✅ |
| REQ-NFR-0002 | The playhead animates via `requestAnimationFrame` with direct style updates (no React re-render per frame). | ✅ |
| REQ-NFR-0003 | Waveform peak extraction is decimated (800 buckets, stride sampling) to keep clip rendering cheap. | ✅ |
| REQ-NFR-0004 | Undo history is bounded (100 entries) and snapshots share structure (arrays are reused, audio blobs are never copied). | ✅ |
| REQ-NFR-0005 | Headless smoke tests exercise the built bundle (module graph, `.vibeloop` round-trip, stretch invariants, encoders) before deployment. | ✅ |
