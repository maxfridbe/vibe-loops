// The Playlist: FL-style non-linear multitrack timeline. Tracks are
// type-agnostic clip lanes hosting loop clips and automation clips.
//
// All layout is rem-based so the whole surface scales typographically;
// mouse coordinates (px) are converted through the live root font size.

import { AudioEngine } from '../engine/audio';
import { autoValueAt } from '../engine/automation';
import { Action, AppState } from '../store';
import {
  AutoClip, AutoPoint, Clip, Loop, PPQ, Track, clipPeriodTicks, loopLengthTicks, snapTicks,
} from '../types';
import { LoopDrag } from './browser';

const TRACK_H = 4;        // rem
const RULER_H = 1.625;    // rem
const HEADER_W = 9.5;     // rem
const CLIP_LABEL_H = 0.875; // rem
// Coarse (touch) pointers get larger grab targets throughout.
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const EDGE_GRAB = COARSE ? 0.9 : 0.5; // rem, resize handle width
const POINT_R = COARSE ? 0.34 : 0.22; // rem, envelope/automation point radius
const HANDLE_R = COARSE ? 0.26 : 0.16; // rem, tension handle half-size
const TAP_SLOP_PX = 12;
const MIN_CLIP_TICKS = PPQ / 8;

const rootRem = (): number =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export const ticksToRem = (ticks: number, remPerBeat: number): number => (ticks / PPQ) * remPerBeat;
export const remToTicks = (rem: number, remPerBeat: number): number => (rem / remPerBeat) * PPQ;

interface PlaylistProps {
  state: AppState;
  dispatch: (a: Action) => void;
  engine: AudioEngine;
  playheadTicks: number;
  onSeek: (ticks: number) => void;
  dragLoop: LoopDrag | null;
  onDragConsumed: () => void;
}

type Gesture =
  | {
      kind: 'move'; ids: number[]; startTicks: Map<number, number>;
      startTrackIdxs: Map<number, number>; // track idx of each clip at gesture start
      startTrackIdx: number; grabTick: number; auto: boolean;
    }
  | { kind: 'resize-r'; id: number; auto: boolean }
  | { kind: 'resize-l'; id: number; auto: boolean }
  | { kind: 'slip'; id: number; grabTick: number; startOffset: number }
  | { kind: 'paint'; trackId: number }
  | { kind: 'marquee'; x0: number; y0: number }
  | { kind: 'scrub' }
  | { kind: 'auto-point'; clipId: number; index: number }
  | { kind: 'auto-tension'; clipId: number; index: number; startY: number; startTension: number }
  | { kind: 'stretch-l' | 'stretch-r'; id: number; origStart: number; origLen: number; origPeriod: number; origOffset: number; natural: number }
  | { kind: 'env-point'; clipId: number; index: number }
  | { kind: 'env-tension'; clipId: number; index: number; startY: number; startTension: number }
  // touch draw: clip placement happens on tap release, so touch drags can
  // still scroll the playlist
  | { kind: 'tap-place'; x0: number; y0: number; trackIdx: number };

// Splits a clip envelope at frac (0..1) into two envelopes rescaled to 0..1.
const splitEnvelope = (points: AutoPoint[], frac: number): [AutoPoint[], AutoPoint[]] => {
  const boundary = autoValueAt(points, frac);
  const left = points.filter(pt => pt.pos < frac).map(pt => ({ ...pt, pos: pt.pos / frac }));
  left.push({ pos: 1, value: boundary, tension: 0 });
  const right = points.filter(pt => pt.pos > frac).map(pt => ({ ...pt, pos: (pt.pos - frac) / (1 - frac) }));
  right.unshift({ pos: 0, value: boundary, tension: 0 });
  return [left, right];
};

let gestureCounter = 0;

export const Playlist = ({
  state, dispatch, engine, playheadTicks, onSeek, dragLoop, onDragConsumed,
}: PlaylistProps): React.ReactElement => {
  const { project, ui } = state;
  const rpb = ui.remPerBeat;
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const playheadRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{ g: Gesture; id: string } | null>(null);
  // touch long-press: iPadOS Safari fires no contextmenu, so deletes get an
  // explicit timer (cancelled by movement or release)
  const longPressRef = React.useRef<{ timer: number; x0: number; y0: number } | null>(null);
  const cancelLongPress = (): void => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  };
  const armLongPress = (e: React.PointerEvent, fn: () => void): void => {
    if (e.pointerType !== 'touch') return;
    cancelLongPress();
    const x0 = e.clientX;
    const y0 = e.clientY;
    longPressRef.current = {
      x0, y0,
      timer: window.setTimeout(() => {
        longPressRef.current = null;
        gestureRef.current = null;
        fn();
      }, 600),
    };
  };
  // marquee kept in rem coordinates
  const [marquee, setMarquee] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [renaming, setRenaming] = React.useState<{ track: Track; name: string } | null>(null);

  let endBeats = 64;
  for (const c of project.clips) endBeats = Math.max(endBeats, (c.startTicks + c.lengthTicks) / PPQ);
  for (const a of project.autoClips) endBeats = Math.max(endBeats, (a.startTicks + a.lengthTicks) / PPQ);
  const contentBeats = Math.ceil((endBeats + 32) / 16) * 16;
  const contentW = HEADER_W + ticksToRem(contentBeats * PPQ, rpb); // rem
  const bars = Math.ceil(contentBeats / 4);

  const trackIdxById = new Map(project.tracks.map(t => [t.id, t.idx]));
  const sortedTracks = [...project.tracks].sort((a, b) => a.idx - b.idx);

  // --- coordinate helpers (client px -> rem -> ticks) -----------------------
  const pos = (e: { clientX: number; clientY: number }): { tick: number; trackIdx: number; x: number; y: number } => {
    const r = contentRef.current!.getBoundingClientRect();
    const unit = rootRem();
    const x = (e.clientX - r.left) / unit;
    const y = (e.clientY - r.top) / unit;
    return {
      tick: Math.max(0, remToTicks(x - HEADER_W, rpb)),
      trackIdx: Math.floor((y - RULER_H) / TRACK_H),
      x, y,
    };
  };
  const snap = (t: number, bypass: boolean): number => snapTicks(t, bypass ? 0 : ui.snap);

  // --- edit helpers ---------------------------------------------------------
  const editClips = (clips: Clip[], gesture: string): void => dispatch({ type: 'edit', clips, gesture });
  const editAuto = (autoClips: AutoClip[], gesture: string): void => dispatch({ type: 'edit', autoClips, gesture });

  const loopById = new Map<number, Loop>(project.loops.map(l => [l.id, l]));

  const newClipFromLoop = (loop: Loop, tick: number, trackIdx: number, gesture: string): Clip | null => {
    const track = sortedTracks[Math.min(sortedTracks.length - 1, Math.max(0, trackIdx))];
    if (!track) return null;
    const clip: Clip = {
      id: state.nextId,
      trackId: track.id,
      loopId: loop.id,
      startTicks: Math.max(0, tick),
      lengthTicks: loopLengthTicks(loop),
      offsetTicks: 0,
      gain: 1,
      muted: false,
    };
    dispatch({ type: 'edit', clips: [...project.clips, clip], gesture });
    return clip;
  };

  // --- window-level gesture handling (pointer events: mouse + touch + pen) --
  React.useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const lp = longPressRef.current;
      if (lp && (Math.abs(e.clientX - lp.x0) > TAP_SLOP_PX || Math.abs(e.clientY - lp.y0) > TAP_SLOP_PX)) {
        cancelLongPress();
      }
      const entry = gestureRef.current;
      if (!entry || !contentRef.current) return;
      const g = entry.g;
      const p = pos(e);
      const bypass = e.altKey;

      switch (g.kind) {
        case 'scrub':
          onSeek(Math.max(0, snap(p.tick, bypass)));
          break;
        case 'move': {
          const delta = snap(p.tick - g.grabTick, bypass);
          const trackDelta = Math.min(
            sortedTracks.length - 1,
            Math.max(0, p.trackIdx),
          ) - g.startTrackIdx;
          // deltas are always applied to the gesture-start position, never the
          // current one, so movement cannot compound across mousemove events
          const moveOne = <T extends Clip | AutoClip>(c: T): T => {
            const base = g.startTicks.get(c.id)!;
            const baseIdx = g.startTrackIdxs.get(c.id) ?? 0;
            const idx = Math.min(sortedTracks.length - 1, Math.max(0, baseIdx + trackDelta));
            return { ...c, startTicks: Math.max(0, base + delta), trackId: sortedTracks[idx].id };
          };
          if (g.auto) {
            editAuto(project.autoClips.map(c => (g.ids.includes(c.id) ? moveOne(c) : c)), entry.id);
          } else {
            editClips(project.clips.map(c => (g.ids.includes(c.id) ? moveOne(c) : c)), entry.id);
          }
          break;
        }
        case 'resize-r': {
          const t = snap(p.tick, bypass);
          if (g.auto) {
            editAuto(project.autoClips.map(c => c.id === g.id
              ? { ...c, lengthTicks: Math.max(MIN_CLIP_TICKS, t - c.startTicks) }
              : c), entry.id);
          } else {
            editClips(project.clips.map(c => c.id === g.id
              ? { ...c, lengthTicks: Math.max(MIN_CLIP_TICKS, t - c.startTicks) }
              : c), entry.id);
          }
          break;
        }
        case 'resize-l': {
          const t = snap(p.tick, bypass);
          if (g.auto) {
            editAuto(project.autoClips.map(c => {
              if (c.id !== g.id) return c;
              const end = c.startTicks + c.lengthTicks;
              const ns = Math.max(0, Math.min(t, end - MIN_CLIP_TICKS));
              return { ...c, startTicks: ns, lengthTicks: end - ns };
            }), entry.id);
          } else {
            editClips(project.clips.map(c => {
              if (c.id !== g.id) return c;
              const end = c.startTicks + c.lengthTicks;
              const ns = Math.max(0, Math.min(t, end - MIN_CLIP_TICKS));
              return { ...c, startTicks: ns, lengthTicks: end - ns, offsetTicks: c.offsetTicks + (ns - c.startTicks) };
            }), entry.id);
          }
          break;
        }
        case 'slip': {
          const delta = Math.round(p.tick - g.grabTick);
          editClips(project.clips.map(c => c.id === g.id
            ? { ...c, offsetTicks: g.startOffset - delta }
            : c), entry.id);
          break;
        }
        case 'paint': {
          const loop = ui.focusedLoopId !== null ? loopById.get(ui.focusedLoopId) : undefined;
          if (!loop) break;
          const len = loopLengthTicks(loop);
          const cell = Math.floor(p.tick / len) * len;
          const track = sortedTracks[Math.min(sortedTracks.length - 1, Math.max(0, p.trackIdx))];
          if (!track) break;
          const occupied = project.clips.some(c =>
            c.trackId === track.id && c.loopId === loop.id && c.startTicks === cell);
          if (!occupied) {
            dispatch({
              type: 'edit',
              clips: [...project.clips, {
                id: state.nextId, trackId: track.id, loopId: loop.id,
                startTicks: cell, lengthTicks: len, offsetTicks: 0, gain: 1, muted: false,
              }],
              gesture: entry.id,
            });
          }
          break;
        }
        case 'marquee': {
          const m = { x0: g.x0, y0: g.y0, x1: p.x, y1: p.y };
          setMarquee(m);
          const [mx0, mx1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
          const [my0, my1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
          const hitTicks0 = remToTicks(mx0 - HEADER_W, rpb);
          const hitTicks1 = remToTicks(mx1 - HEADER_W, rpb);
          const rowHit = (trackId: number): boolean => {
            const idx = trackIdxById.get(trackId) ?? -1;
            const top = RULER_H + idx * TRACK_H;
            return top < my1 && top + TRACK_H > my0;
          };
          dispatch({
            type: 'set-selection',
            clipIds: project.clips
              .filter(c => rowHit(c.trackId) && c.startTicks < hitTicks1 && c.startTicks + c.lengthTicks > hitTicks0)
              .map(c => c.id),
            autoClipIds: project.autoClips
              .filter(c => rowHit(c.trackId) && c.startTicks < hitTicks1 && c.startTicks + c.lengthTicks > hitTicks0)
              .map(c => c.id),
          });
          break;
        }
        case 'auto-point': {
          const clip = project.autoClips.find(c => c.id === g.clipId);
          if (!clip) break;
          const relPos = (p.tick - clip.startTicks) / clip.lengthTicks;
          const idx = trackIdxById.get(clip.trackId) ?? 0;
          const laneTop = RULER_H + idx * TRACK_H + CLIP_LABEL_H;
          const laneH = TRACK_H - CLIP_LABEL_H - 0.25;
          const value = Math.min(1, Math.max(0, 1 - (p.y - laneTop) / laneH));
          editAuto(project.autoClips.map(c => {
            if (c.id !== g.clipId) return c;
            const pts = c.points.map((pt, i) => {
              if (i !== g.index) return pt;
              const lo = i === 0 ? 0 : c.points[i - 1].pos + 0.001;
              const hi = i === c.points.length - 1 ? 1 : c.points[i + 1].pos - 0.001;
              const fixed = i === 0 ? 0 : i === c.points.length - 1 ? 1 : Math.min(hi, Math.max(lo, relPos));
              return { ...pt, pos: fixed, value };
            });
            return { ...c, points: pts };
          }), entry.id);
          break;
        }
        case 'auto-tension': {
          const dyRem = (e.clientY - g.startY) / rootRem();
          const tension = Math.min(1, Math.max(-1, g.startTension + dyRem / 4));
          editAuto(project.autoClips.map(c => {
            if (c.id !== g.clipId) return c;
            const pts = c.points.map((pt, i) => (i === g.index ? { ...pt, tension } : pt));
            return { ...c, points: pts };
          }), entry.id);
          break;
        }
        case 'stretch-l':
        case 'stretch-r': {
          const t = snap(p.tick, bypass);
          const origEnd = g.origStart + g.origLen;
          let newLen: number;
          if (g.kind === 'stretch-r') {
            newLen = Math.max(MIN_CLIP_TICKS, t - g.origStart);
          } else {
            newLen = Math.max(MIN_CLIP_TICKS, origEnd - Math.min(t, origEnd - MIN_CLIP_TICKS));
          }
          // clamp the resulting stretch ratio to a usable range
          let factor = newLen / g.origLen;
          const ratio = Math.min(4, Math.max(0.25, (g.origPeriod * factor) / g.natural));
          const newPeriod = g.natural * ratio;
          factor = newPeriod / g.origPeriod;
          const len = Math.max(MIN_CLIP_TICKS, Math.round(g.origLen * factor));
          editClips(project.clips.map(c => {
            if (c.id !== g.id) return c;
            return {
              ...c,
              startTicks: g.kind === 'stretch-l' ? Math.max(0, origEnd - len) : g.origStart,
              lengthTicks: len,
              offsetTicks: Math.round(g.origOffset * factor),
              stretchTicks: Math.abs(ratio - 1) < 0.01 ? undefined : Math.round(newPeriod),
            };
          }), entry.id);
          break;
        }
        case 'env-point': {
          const clip = project.clips.find(c => c.id === g.clipId);
          if (!clip || !clip.envelope) break;
          const relPos = (p.tick - clip.startTicks) / clip.lengthTicks;
          const idx = trackIdxById.get(clip.trackId) ?? 0;
          const laneTop = RULER_H + idx * TRACK_H + CLIP_LABEL_H;
          const laneH = TRACK_H - CLIP_LABEL_H - 0.25;
          const value = Math.min(1, Math.max(0, 1 - (p.y - laneTop) / laneH));
          editClips(project.clips.map(c => {
            if (c.id !== g.clipId || !c.envelope) return c;
            const pts = c.envelope.map((pt, i) => {
              if (i !== g.index) return pt;
              const lo = i === 0 ? 0 : c.envelope![i - 1].pos + 0.001;
              const hi = i === c.envelope!.length - 1 ? 1 : c.envelope![i + 1].pos - 0.001;
              const fixed = i === 0 ? 0 : i === c.envelope!.length - 1 ? 1 : Math.min(hi, Math.max(lo, relPos));
              return { ...pt, pos: fixed, value };
            });
            return { ...c, envelope: pts };
          }), entry.id);
          break;
        }
        case 'env-tension': {
          const dyRem = (e.clientY - g.startY) / rootRem();
          const tension = Math.min(1, Math.max(-1, g.startTension + dyRem / 4));
          editClips(project.clips.map(c => {
            if (c.id !== g.clipId || !c.envelope) return c;
            const pts = c.envelope.map((pt, i) => (i === g.index ? { ...pt, tension } : pt));
            return { ...c, envelope: pts };
          }), entry.id);
          break;
        }
        case 'tap-place':
          // finger wandered: it's a scroll, not a tap
          if (Math.abs(e.clientX - g.x0) > TAP_SLOP_PX || Math.abs(e.clientY - g.y0) > TAP_SLOP_PX) {
            gestureRef.current = null;
          }
          break;
      }
    };
    const onUp = (e: PointerEvent): void => {
      cancelLongPress();
      const entry = gestureRef.current;
      if (entry?.g.kind === 'tap-place' && contentRef.current) {
        const g = entry.g;
        if (Math.abs(e.clientX - g.x0) <= TAP_SLOP_PX && Math.abs(e.clientY - g.y0) <= TAP_SLOP_PX) {
          placeAt(pos(e).tick, g.trackIdx, e.altKey, entry.id);
        }
      }
      if (entry?.g.kind === 'marquee') setMarquee(null);
      gestureRef.current = null;
    };
    const onCancel = (): void => {
      cancelLongPress();
      if (gestureRef.current?.g.kind === 'marquee') setMarquee(null);
      gestureRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  });

  // --- browser drag-and-drop ------------------------------------------------
  React.useEffect(() => {
    if (!dragLoop) return;
    const onUp = (e: PointerEvent): void => {
      onDragConsumed();
      if (!contentRef.current) return;
      const r = contentRef.current.getBoundingClientRect();
      const unit = rootRem();
      if (e.clientX < r.left + HEADER_W * unit || e.clientY < r.top + RULER_H * unit
        || e.clientX > r.right || e.clientY > r.bottom) return;
      const p = pos(e);
      const loop = loopById.get(dragLoop.loopId);
      if (!loop) return;
      newClipFromLoop(loop, snap(p.tick, e.altKey), p.trackIdx, `g${++gestureCounter}`);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onDragConsumed);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onDragConsumed);
    };
  });

  // --- playhead animation ---------------------------------------------------
  React.useEffect(() => {
    let raf = 0;
    const step = (): void => {
      if (playheadRef.current) {
        const t = ui.playing ? engine.playheadTicks() : playheadTicks;
        playheadRef.current.style.left = `${HEADER_W + ticksToRem(t, rpb)}rem`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing, playheadTicks, rpb]);

  // --- pointerdown dispatchers ----------------------------------------------
  const beginGesture = (g: Gesture): void => {
    gestureRef.current = { g, id: `g${++gestureCounter}` };
  };

  // Places the focused loop or an automation clip at a playlist position.
  const placeAt = (tick: number, trackIdx: number, bypass: boolean, gesture: string): Clip | null => {
    if (ui.clipKind === 'loop') {
      const loop = ui.focusedLoopId !== null ? loopById.get(ui.focusedLoopId) : undefined;
      if (!loop) return null;
      return newClipFromLoop(loop, snap(tick, bypass), trackIdx, gesture);
    }
    const track = sortedTracks[Math.min(sortedTracks.length - 1, Math.max(0, trackIdx))];
    if (!track) return null;
    const clip: AutoClip = {
      id: state.nextId,
      trackId: track.id,
      target: ui.focusedAutoTarget,
      startTicks: snap(tick, bypass),
      lengthTicks: PPQ * 16,
      muted: false,
      points: [
        { pos: 0, value: 0.8, tension: 0 },
        { pos: 1, value: 0.8, tension: 0 },
      ],
    };
    dispatch({ type: 'edit', autoClips: [...project.autoClips, clip], gesture });
    return null;
  };

  const onEmptyPointerDown = (e: React.PointerEvent, trackIdx: number): void => {
    if (e.button === 2) return;
    const p = pos(e);
    const bypass = e.altKey;
    if (ui.tool === 'draw') {
      if (e.pointerType === 'touch') {
        // defer placement to the tap release so a touch drag can scroll
        gestureRef.current = {
          g: { kind: 'tap-place', x0: e.clientX, y0: e.clientY, trackIdx },
          id: `g${++gestureCounter}`,
        };
        return;
      }
      const id = `g${++gestureCounter}`;
      const clip = placeAt(p.tick, trackIdx, bypass, id);
      if (clip) {
        const clampedIdx = Math.min(sortedTracks.length - 1, Math.max(0, trackIdx));
        gestureRef.current = {
          g: {
            kind: 'move', ids: [clip.id],
            startTicks: new Map([[clip.id, clip.startTicks]]),
            startTrackIdxs: new Map([[clip.id, clampedIdx]]),
            startTrackIdx: clampedIdx, grabTick: p.tick, auto: false,
          },
          id,
        };
      }
    } else if (ui.tool === 'paint') {
      if (ui.clipKind !== 'loop') {
        placeAt(p.tick, trackIdx, bypass, `g${++gestureCounter}`);
        return;
      }
      const loop = ui.focusedLoopId !== null ? loopById.get(ui.focusedLoopId) : undefined;
      if (!loop) return;
      const id = `g${++gestureCounter}`;
      gestureRef.current = { g: { kind: 'paint', trackId: 0 }, id };
      const len = loopLengthTicks(loop);
      newClipFromLoop(loop, Math.floor(p.tick / len) * len, trackIdx, id);
    } else if (ui.tool === 'select') {
      beginGesture({ kind: 'marquee', x0: p.x, y0: p.y });
      dispatch({ type: 'set-selection', clipIds: [], autoClipIds: [] });
    }
  };

  const deleteClip = (clip: Clip): void => {
    editClips(project.clips.filter(c => c.id !== clip.id), `g${++gestureCounter}`);
  };

  const removeEnvPoint = (clip: Clip, index: number): void => {
    const isEndpoint = index === 0 || index === (clip.envelope?.length ?? 0) - 1;
    editClips(project.clips.map(c => {
      if (c.id !== clip.id || !c.envelope) return c;
      if (isEndpoint || c.envelope.length <= 2) return { ...c, envelope: undefined };
      return { ...c, envelope: c.envelope.filter((_, i) => i !== index) };
    }), `g${++gestureCounter}`);
  };

  const onClipPointerDown = (e: React.PointerEvent, clip: Clip): void => {
    e.stopPropagation();
    if (ui.envelopeMode) {
      // envelope editing takes over: click adds a point and drags it
      if (e.button === 2) return;
      const p0 = pos(e);
      const relPos = Math.min(1, Math.max(0, (p0.tick - clip.startTicks) / clip.lengthTicks));
      const idx = trackIdxById.get(clip.trackId) ?? 0;
      const laneTop = RULER_H + idx * TRACK_H + CLIP_LABEL_H;
      const laneH = TRACK_H - CLIP_LABEL_H - 0.25;
      const value = Math.min(1, Math.max(0, 1 - (p0.y - laneTop) / laneH));
      const base = clip.envelope ?? [
        { pos: 0, value: 1, tension: 0 },
        { pos: 1, value: 1, tension: 0 },
      ];
      const pts = [...base, { pos: relPos, value, tension: 0 }].sort((a, b) => a.pos - b.pos);
      const index = pts.findIndex(pt => pt.pos === relPos && pt.value === value);
      const id = `g${++gestureCounter}`;
      editClips(project.clips.map(c => (c.id === clip.id ? { ...c, envelope: pts } : c)), id);
      gestureRef.current = { g: { kind: 'env-point', clipId: clip.id, index }, id };
      return;
    }
    if (e.button === 2) return; // deletion handled by the contextmenu event
    armLongPress(e, () => deleteClip(clip));
    const p = pos(e);
    const rectX = HEADER_W + ticksToRem(clip.startTicks, rpb);
    const w = ticksToRem(clip.lengthTicks, rpb);
    const nearR = p.x > rectX + w - EDGE_GRAB;
    const nearL = p.x < rectX + EDGE_GRAB;
    switch (ui.tool) {
      case 'slice': {
        const at = snap(p.tick, e.altKey);
        if (at > clip.startTicks && at < clip.startTicks + clip.lengthTicks) {
          const frac = (at - clip.startTicks) / clip.lengthTicks;
          const [envL, envR] = clip.envelope ? splitEnvelope(clip.envelope, frac) : [undefined, undefined];
          const first: Clip = { ...clip, lengthTicks: at - clip.startTicks, envelope: envL };
          const second: Clip = {
            ...clip,
            id: state.nextId,
            startTicks: at,
            lengthTicks: clip.startTicks + clip.lengthTicks - at,
            offsetTicks: clip.offsetTicks + (at - clip.startTicks),
            envelope: envR,
          };
          editClips(project.clips.flatMap(c => (c.id === clip.id ? [first, second] : [c])), `g${++gestureCounter}`);
        }
        break;
      }
      case 'stretch': {
        const loop = loopById.get(clip.loopId);
        if (!loop) break;
        if (nearR || nearL) {
          beginGesture({
            kind: nearR ? 'stretch-r' : 'stretch-l',
            id: clip.id,
            origStart: clip.startTicks,
            origLen: clip.lengthTicks,
            origPeriod: clipPeriodTicks(clip, loop),
            origOffset: clip.offsetTicks,
            natural: loopLengthTicks(loop),
          });
        } else {
          const members = [clip];
          beginGesture({
            kind: 'move', ids: [clip.id],
            startTicks: new Map(members.map(c => [c.id, c.startTicks])),
            startTrackIdxs: new Map(members.map(c => [c.id, trackIdxById.get(c.trackId) ?? 0])),
            startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
            grabTick: p.tick, auto: false,
          });
        }
        break;
      }
      case 'mute':
        editClips(project.clips.map(c => (c.id === clip.id ? { ...c, muted: !c.muted } : c)), `g${++gestureCounter}`);
        break;
      case 'select': {
        const already = ui.selection.includes(clip.id);
        const clipIds = e.shiftKey
          ? (already ? ui.selection.filter(i => i !== clip.id) : [...ui.selection, clip.id])
          : (already ? ui.selection : [clip.id]);
        dispatch({ type: 'set-selection', clipIds, autoClipIds: e.shiftKey ? ui.autoSelection : [] });
        const ids = clipIds.includes(clip.id) ? clipIds : [clip.id];
        const members = project.clips.filter(c => ids.includes(c.id));
        beginGesture({
          kind: 'move', ids,
          startTicks: new Map(members.map(c => [c.id, c.startTicks])),
          startTrackIdxs: new Map(members.map(c => [c.id, trackIdxById.get(c.trackId) ?? 0])),
          startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
          grabTick: p.tick, auto: false,
        });
        break;
      }
      default: { // draw / paint -> manipulate
        if (e.shiftKey) {
          beginGesture({ kind: 'slip', id: clip.id, grabTick: p.tick, startOffset: clip.offsetTicks });
        } else if (nearR) {
          beginGesture({ kind: 'resize-r', id: clip.id, auto: false });
        } else if (nearL) {
          beginGesture({ kind: 'resize-l', id: clip.id, auto: false });
        } else {
          const ids = ui.selection.includes(clip.id) ? ui.selection : [clip.id];
          const members = project.clips.filter(c => ids.includes(c.id));
          beginGesture({
            kind: 'move', ids,
            startTicks: new Map(members.map(c => [c.id, c.startTicks])),
            startTrackIdxs: new Map(members.map(c => [c.id, trackIdxById.get(c.trackId) ?? 0])),
            startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
            grabTick: p.tick, auto: false,
          });
        }
      }
    }
  };

  const deleteAutoClip = (clip: AutoClip): void => {
    editAuto(project.autoClips.filter(c => c.id !== clip.id), `g${++gestureCounter}`);
  };

  // Adds an automation point at the event position (Ctrl+click / double-tap).
  const addAutoPointAt = (e: { clientX: number; clientY: number }, clip: AutoClip, drag: boolean): void => {
    const p = pos(e);
    const relPos = Math.min(1, Math.max(0, (p.tick - clip.startTicks) / clip.lengthTicks));
    const idx = trackIdxById.get(clip.trackId) ?? 0;
    const laneTop = RULER_H + idx * TRACK_H + CLIP_LABEL_H;
    const laneH = TRACK_H - CLIP_LABEL_H - 0.25;
    const value = Math.min(1, Math.max(0, 1 - (p.y - laneTop) / laneH));
    const pts = [...clip.points, { pos: relPos, value, tension: 0 }].sort((a, b) => a.pos - b.pos);
    const index = pts.findIndex(pt => pt.pos === relPos && pt.value === value);
    editAuto(project.autoClips.map(c => (c.id === clip.id ? { ...c, points: pts } : c)), `g${++gestureCounter}`);
    if (drag) beginGesture({ kind: 'auto-point', clipId: clip.id, index });
  };

  const onAutoClipPointerDown = (e: React.PointerEvent, clip: AutoClip, zone: 'label' | 'body'): void => {
    e.stopPropagation();
    if (e.button === 2) return; // deletion handled by the contextmenu event
    armLongPress(e, () => deleteAutoClip(clip));
    const p = pos(e);
    const rectX = HEADER_W + ticksToRem(clip.startTicks, rpb);
    const w = ticksToRem(clip.lengthTicks, rpb);
    if (ui.tool === 'mute') {
      editAuto(project.autoClips.map(c => (c.id === clip.id ? { ...c, muted: !c.muted } : c)), `g${++gestureCounter}`);
      return;
    }
    if (ui.tool === 'select') {
      const already = ui.autoSelection.includes(clip.id);
      dispatch({
        type: 'set-selection',
        clipIds: e.shiftKey ? ui.selection : [],
        autoClipIds: e.shiftKey
          ? (already ? ui.autoSelection.filter(i => i !== clip.id) : [...ui.autoSelection, clip.id])
          : [clip.id],
      });
    }
    if (p.x > rectX + w - EDGE_GRAB) {
      beginGesture({ kind: 'resize-r', id: clip.id, auto: true });
    } else if (p.x < rectX + EDGE_GRAB) {
      beginGesture({ kind: 'resize-l', id: clip.id, auto: true });
    } else if (zone === 'label' || ui.tool === 'select') {
      beginGesture({
        kind: 'move', ids: [clip.id],
        startTicks: new Map([[clip.id, clip.startTicks]]),
        startTrackIdxs: new Map([[clip.id, trackIdxById.get(clip.trackId) ?? 0]]),
        startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
        grabTick: p.tick, auto: true,
      });
    } else if (e.ctrlKey || e.metaKey) {
      addAutoPointAt(e, clip, true);
    }
  };

  // --- render ---------------------------------------------------------------
  const gridBg: React.CSSProperties = {
    backgroundImage:
      `repeating-linear-gradient(to right, var(--grid-bar) 0 0.0625rem, transparent 0.0625rem ${rpb * 4}rem),` +
      `repeating-linear-gradient(to right, var(--grid-beat) 0 0.0625rem, transparent 0.0625rem ${rpb}rem)`,
    backgroundPosition: `${HEADER_W}rem 0`,
  };

  return (
    <div className="playlist" data-tool={ui.tool} onContextMenu={e => e.preventDefault()}>
      <div className="pl-scroll">
        <div
          className="pl-content"
          ref={contentRef}
          style={{ width: `${contentW}rem`, height: `${RULER_H + sortedTracks.length * TRACK_H + 2.25}rem` }}
        >
          <div className="pl-ruler" style={{ width: `${contentW}rem`, height: `${RULER_H}rem` }}
            onPointerDown={e => {
              const p = pos(e);
              onSeek(Math.max(0, snap(p.tick, e.altKey)));
              beginGesture({ kind: 'scrub' });
            }}
          >
            <div className="pl-corner" style={{ width: `${HEADER_W}rem` }}>bars</div>
            {Array.from({ length: bars }, (_, b) => (
              <div key={b} className="pl-bar-label" style={{ left: `${HEADER_W + ticksToRem(b * 4 * PPQ, rpb)}rem` }}>
                {b + 1}
              </div>
            ))}
          </div>

          {sortedTracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              state={state}
              gridBg={gridBg}
              contentW={contentW}
              onEmptyPointerDown={onEmptyPointerDown}
              onClipPointerDown={onClipPointerDown}
              onClipDelete={deleteClip}
              onAutoClipPointerDown={onAutoClipPointerDown}
              onAutoClipDelete={deleteAutoClip}
              onAutoClipAddPoint={addAutoPointAt}
              beginPointGesture={(e, clipId, index) => {
                armLongPress(e, () => {
                  editAuto(project.autoClips.map(c => {
                    if (c.id !== clipId || c.points.length <= 2) return c;
                    return { ...c, points: c.points.filter((_, i) => i !== index) };
                  }), `g${++gestureCounter}`);
                });
                beginGesture({ kind: 'auto-point', clipId, index });
              }}
              beginTensionGesture={(clipId, index, startY, startTension) =>
                beginGesture({ kind: 'auto-tension', clipId, index, startY, startTension })}
              removePoint={(clipId, index) => {
                editAuto(project.autoClips.map(c => {
                  if (c.id !== clipId || c.points.length <= 2) return c;
                  return { ...c, points: c.points.filter((_, i) => i !== index) };
                }), `g${++gestureCounter}`);
              }}
              onRename={track => setRenaming({ track, name: track.name })}
              onEnvPointDown={(e, clip, index) => {
                e.stopPropagation();
                if (e.button !== 2) {
                  armLongPress(e, () => removeEnvPoint(clip, index));
                  beginGesture({ kind: 'env-point', clipId: clip.id, index });
                }
              }}
              onEnvPointRemove={removeEnvPoint}
              onEnvTensionDown={(e, clip, index, startTension) => {
                e.stopPropagation();
                if (e.button === 0) {
                  beginGesture({ kind: 'env-tension', clipId: clip.id, index, startY: e.clientY, startTension });
                }
              }}
              dispatch={dispatch}
              engine={engine}
            />
          ))}

          <div className="pl-addtrack" style={{ left: 0, width: `${HEADER_W}rem` }}>
            <button
              onClick={() => {
                const idx = sortedTracks.length;
                dispatch({
                  type: 'edit',
                  tracks: [...project.tracks, {
                    id: state.nextId, idx, name: `Track ${idx + 1}`,
                    color: TRACK_COLORS[idx % TRACK_COLORS.length], volume: 1, pan: 0, muted: false,
                  }],
                  gesture: `g${++gestureCounter}`,
                });
              }}
            >+ add track</button>
          </div>

          <div className="pl-playhead" ref={playheadRef} style={{ left: `${HEADER_W}rem` }} />
          {marquee && (
            <div
              className="pl-marquee"
              style={{
                left: `${Math.min(marquee.x0, marquee.x1)}rem`,
                top: `${Math.min(marquee.y0, marquee.y1)}rem`,
                width: `${Math.abs(marquee.x1 - marquee.x0)}rem`,
                height: `${Math.abs(marquee.y1 - marquee.y0)}rem`,
              }}
            />
          )}
        </div>
      </div>

      {renaming && (
        <div className="vl-modal-backdrop" onMouseDown={() => setRenaming(null)}>
          <div className="vl-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="vl-modal-title">Rename track</div>
            <input
              className="vl-modal-input"
              autoFocus
              value={renaming.name}
              onChange={e => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && renaming.name.trim()) {
                  dispatch({ type: 'update-track', track: { ...renaming.track, name: renaming.name.trim() } });
                  setRenaming(null);
                } else if (e.key === 'Escape') {
                  setRenaming(null);
                }
              }}
            />
            <div className="vl-modal-buttons">
              <button onClick={() => setRenaming(null)}>cancel</button>
              <button
                className="primary"
                disabled={!renaming.name.trim()}
                onClick={() => {
                  dispatch({ type: 'update-track', track: { ...renaming.track, name: renaming.name.trim() } });
                  setRenaming(null);
                }}
              >rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TRACK_COLORS = ['#e06c5c', '#e0a75c', '#d9d05b', '#7fc95e', '#5bd9b1', '#5b8dd9', '#8d6cd9', '#d95bb4'];

interface TrackRowProps {
  track: Track;
  state: AppState;
  gridBg: React.CSSProperties;
  contentW: number;
  onEmptyPointerDown: (e: React.PointerEvent, trackIdx: number) => void;
  onClipPointerDown: (e: React.PointerEvent, clip: Clip) => void;
  onClipDelete: (clip: Clip) => void;
  onAutoClipPointerDown: (e: React.PointerEvent, clip: AutoClip, zone: 'label' | 'body') => void;
  onAutoClipDelete: (clip: AutoClip) => void;
  onAutoClipAddPoint: (e: { clientX: number; clientY: number }, clip: AutoClip, drag: boolean) => void;
  beginPointGesture: (e: React.PointerEvent, clipId: number, index: number) => void;
  beginTensionGesture: (clipId: number, index: number, startY: number, startTension: number) => void;
  removePoint: (clipId: number, index: number) => void;
  onRename: (track: Track) => void;
  onEnvPointDown: (e: React.PointerEvent, clip: Clip, index: number) => void;
  onEnvPointRemove: (clip: Clip, index: number) => void;
  onEnvTensionDown: (e: React.PointerEvent, clip: Clip, index: number, startTension: number) => void;
  dispatch: (a: Action) => void;
  engine: AudioEngine;
}

const TrackRow = ({
  track, state, gridBg, contentW, onEmptyPointerDown, onClipPointerDown, onClipDelete,
  onAutoClipPointerDown, onAutoClipDelete, onAutoClipAddPoint,
  beginPointGesture, beginTensionGesture, removePoint, onRename,
  onEnvPointDown, onEnvPointRemove, onEnvTensionDown, dispatch, engine,
}: TrackRowProps): React.ReactElement => {
  const { project, ui } = state;
  const rpb = ui.remPerBeat;
  const clips = project.clips.filter(c => c.trackId === track.id);
  const autoClips = project.autoClips.filter(c => c.trackId === track.id);
  const loopById = new Map<number, Loop>(project.loops.map(l => [l.id, l]));

  return (
    <div
      className="pl-row"
      style={{ height: `${TRACK_H}rem`, width: `${contentW}rem`, ...gridBg }}
      onPointerDown={e => onEmptyPointerDown(e, track.idx)}
    >
      <div className="pl-head" style={{ width: `${HEADER_W}rem` }} onPointerDown={e => e.stopPropagation()}>
        <div className="pl-head-top">
          <label className="pl-head-swatch" style={{ background: track.color }} title="track color — click to change">
            <input
              type="color"
              value={track.color}
              onChange={e => dispatch({ type: 'update-track', track: { ...track, color: e.target.value } })}
            />
          </label>
          <span
            className="pl-head-name"
            title="double-click to rename"
            onDoubleClick={() => onRename(track)}
          >{track.name}</span>
          <button
            className={`pl-head-mute${track.muted ? ' on' : ''}`}
            title="mute track"
            onClick={() => dispatch({ type: 'update-track', track: { ...track, muted: !track.muted } })}
          >M</button>
        </div>
        <div className="pl-head-sliders">
          <input
            className="vol"
            type="range" min="0" max="1.25" step="0.01" value={track.volume}
            title={`track volume: ${Math.round(track.volume * 100)}%`}
            onChange={e => dispatch({ type: 'update-track', track: { ...track, volume: Number(e.target.value) } })}
          />
          <input
            className="pan"
            type="range" min="-1" max="1" step="0.01" value={track.pan}
            title={`track pan: ${track.pan === 0 ? 'center' : track.pan < 0 ? `${Math.round(-track.pan * 100)}% left` : `${Math.round(track.pan * 100)}% right`}`}
            onChange={e => dispatch({ type: 'update-track', track: { ...track, pan: Number(e.target.value) } })}
          />
        </div>
      </div>

      {clips.map(clip => {
        const loop = loopById.get(clip.loopId);
        if (!loop) return null;
        return (
          <ClipView
            key={clip.id}
            clip={clip}
            loop={loop}
            color={track.color}
            rpb={rpb}
            selected={ui.selection.includes(clip.id)}
            envelopeMode={ui.envelopeMode}
            engine={engine}
            onPointerDown={e => onClipPointerDown(e, clip)}
            onDelete={() => onClipDelete(clip)}
            onEnvPointDown={(e, index) => onEnvPointDown(e, clip, index)}
            onEnvPointRemove={index => onEnvPointRemove(clip, index)}
            onEnvTensionDown={(e, index, t) => onEnvTensionDown(e, clip, index, t)}
          />
        );
      })}

      {autoClips.map(clip => (
        <AutoClipView
          key={clip.id}
          clip={clip}
          rpb={rpb}
          selected={ui.autoSelection.includes(clip.id)}
          onPointerDown={(e, zone) => onAutoClipPointerDown(e, clip, zone)}
          onDelete={() => onAutoClipDelete(clip)}
          onAddPoint={e => onAutoClipAddPoint(e, clip, false)}
          beginPointGesture={beginPointGesture}
          beginTensionGesture={beginTensionGesture}
          removePoint={removePoint}
        />
      ))}
    </div>
  );
};

const ClipView = ({
  clip, loop, color, rpb, selected, envelopeMode, engine, onPointerDown, onDelete,
  onEnvPointDown, onEnvPointRemove, onEnvTensionDown,
}: {
  clip: Clip; loop: Loop; color: string; rpb: number; selected: boolean;
  envelopeMode: boolean;
  engine: AudioEngine;
  onPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
  onEnvPointDown: (e: React.PointerEvent, index: number) => void;
  onEnvPointRemove: (index: number) => void;
  onEnvTensionDown: (e: React.PointerEvent, index: number, startTension: number) => void;
}): React.ReactElement => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const wRem = Math.max(0.125, ticksToRem(clip.lengthTicks, rpb));
  const hRem = TRACK_H - 0.25;
  const period = clipPeriodTicks(clip, loop); // stretch-aware tile length
  const stretched = clip.stretchTicks !== undefined;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const unit = rootRem();
    const wPx = Math.max(2, Math.round(wRem * unit));
    const hPx = Math.round(hRem * unit);
    if (canvas.width !== wPx) canvas.width = wPx;
    if (canvas.height !== hPx) canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, wPx, hPx);
    const peaks = engine.peaksFor(loop, bump);
    if (!peaks) return;
    const labelPx = CLIP_LABEL_H * unit;
    const waveH = hPx - labelPx - 2;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < wPx; x++) {
      const tick = clip.offsetTicks + remToTicks(x / unit, rpb);
      const inLoop = ((tick % period) + period) % period;
      const bucket = Math.min(peaks.length - 1, Math.floor((inLoop / period) * peaks.length));
      const p = peaks[bucket];
      const bh = Math.max(1, p * waveH);
      ctx.fillRect(x, labelPx + (waveH - bh) / 2, 1, bh);
    }
    // loop repeat boundaries
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = Math.ceil(clip.offsetTicks / period); ; k++) {
      const xRem = ticksToRem(k * period - clip.offsetTicks, rpb);
      const x = xRem * unit;
      if (x >= wPx) break;
      if (x > 0) ctx.fillRect(Math.round(x), labelPx, 1, waveH);
    }
  });

  const envLane = hRem - CLIP_LABEL_H - 0.125;
  const envPts = clip.envelope ?? [
    { pos: 0, value: 1, tension: 0 },
    { pos: 1, value: 1, tension: 0 },
  ];
  const envXY = (posn: number, value: number): [number, number] =>
    [posn * wRem, CLIP_LABEL_H + (1 - value) * envLane];
  let envPath = '';
  if (envelopeMode || clip.envelope) {
    const STEPS = Math.max(16, Math.min(128, Math.round(wRem * 4)));
    for (let i = 0; i <= STEPS; i++) {
      const posn = i / STEPS;
      const [x, y] = envXY(posn, autoValueAt(envPts, posn));
      envPath += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }

  return (
    <div
      className={`pl-clip${selected ? ' selected' : ''}${clip.muted ? ' muted' : ''}`}
      style={{
        left: `${HEADER_W + ticksToRem(clip.startTicks, rpb)}rem`,
        width: `${wRem}rem`,
        height: `${hRem}rem`,
        background: color,
      }}
      onPointerDown={onPointerDown}
      onContextMenu={e => {
        // right-click and touch long-press both land here
        e.preventDefault();
        e.stopPropagation();
        if (!envelopeMode) onDelete();
      }}
    >
      <div className="pl-clip-label">
        {loop.name}
        {stretched && (
          <span className="pl-clip-stretch">
            ×{(period / loopLengthTicks(loop)).toFixed(2)}
          </span>
        )}
      </div>
      <canvas ref={canvasRef} />
      {(envelopeMode || clip.envelope) && (
        <svg viewBox={`0 0 ${wRem} ${hRem}`} preserveAspectRatio="none" className="pl-env-svg">
          <path d={`${envPath}L${wRem},${hRem}L0,${hRem}Z`} className="pl-env-fill" stroke="none" />
          <path d={envPath} className="pl-env-line" fill="none" />
          {envelopeMode && clip.envelope && clip.envelope.map((pt, i) => {
            const [x, y] = envXY(pt.pos, pt.value);
            return (
              <circle
                key={i}
                cx={x} cy={y} r={POINT_R}
                className="pl-env-point"
                onPointerDown={e => onEnvPointDown(e, i)}
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEnvPointRemove(i);
                }}
              />
            );
          })}
          {envelopeMode && clip.envelope && clip.envelope.slice(0, -1).map((pt, i) => {
            const next = clip.envelope![i + 1];
            const midPos = (pt.pos + next.pos) / 2;
            const [x, y] = envXY(midPos, autoValueAt(clip.envelope!, midPos));
            return (
              <rect
                key={`t${i}`}
                x={x - HANDLE_R} y={y - HANDLE_R} width={HANDLE_R * 2} height={HANDLE_R * 2}
                className="pl-env-tension"
                onPointerDown={e => onEnvTensionDown(e, i, pt.tension)}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
};

const AUTO_COLOR = '#d98d3a';

const AutoClipView = ({
  clip, rpb, selected, onPointerDown, onDelete, onAddPoint,
  beginPointGesture, beginTensionGesture, removePoint,
}: {
  clip: AutoClip; rpb: number; selected: boolean;
  onPointerDown: (e: React.PointerEvent, zone: 'label' | 'body') => void;
  onDelete: () => void;
  onAddPoint: (e: { clientX: number; clientY: number }) => void;
  beginPointGesture: (e: React.PointerEvent, clipId: number, index: number) => void;
  beginTensionGesture: (clipId: number, index: number, startY: number, startTension: number) => void;
  removePoint: (clipId: number, index: number) => void;
}): React.ReactElement => {
  const wRem = Math.max(0.125, ticksToRem(clip.lengthTicks, rpb));
  const hRem = TRACK_H - 0.25;
  const laneRem = hRem - CLIP_LABEL_H - 0.125;

  // svg viewBox in rem-scaled units (1 unit = 1 rem) so it grows with type
  const xy = (pos: number, value: number): [number, number] =>
    [pos * wRem, CLIP_LABEL_H + (1 - value) * laneRem];

  let path = '';
  const STEPS = Math.max(16, Math.min(128, Math.round(wRem * 4)));
  for (let i = 0; i <= STEPS; i++) {
    const pos = i / STEPS;
    const [x, y] = xy(pos, autoValueAt(clip.points, pos));
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }

  const targetLabel = clip.target === 'master.volume' ? 'master vol'
    : clip.target === 'track.volume' ? 'track vol' : 'track pan';

  return (
    <div
      className={`pl-auto${selected ? ' selected' : ''}${clip.muted ? ' muted' : ''}`}
      style={{ left: `${HEADER_W + ticksToRem(clip.startTicks, rpb)}rem`, width: `${wRem}rem`, height: `${hRem}rem` }}
      onPointerDown={e => onPointerDown(e, 'body')}
      onDoubleClick={e => {
        // double-click / double-tap adds a point (touch-friendly Ctrl+click)
        e.stopPropagation();
        onAddPoint(e);
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
      }}
    >
      <div className="pl-clip-label" onPointerDown={e => onPointerDown(e, 'label')}>
        {targetLabel}
      </div>
      <svg viewBox={`0 0 ${wRem} ${hRem}`} preserveAspectRatio="none" className="pl-auto-svg">
        <path d={`${path}L${wRem},${hRem}L0,${hRem}Z`} fill={AUTO_COLOR} opacity="0.18" stroke="none" />
        <path d={path} stroke={AUTO_COLOR} strokeWidth="0.1" fill="none" />
        {clip.points.map((pt, i) => {
          const [x, y] = xy(pt.pos, pt.value);
          return (
            <circle
              key={i}
              cx={x} cy={y} r={POINT_R}
              className="pl-auto-point"
              onPointerDown={e => {
                e.stopPropagation();
                if (e.button !== 2) beginPointGesture(e, clip.id, i);
              }}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                removePoint(clip.id, i);
              }}
            />
          );
        })}
        {clip.points.slice(0, -1).map((pt, i) => {
          const next = clip.points[i + 1];
          const midPos = (pt.pos + next.pos) / 2;
          const [x, y] = xy(midPos, autoValueAt(clip.points, midPos));
          return (
            <rect
              key={`t${i}`}
              x={x - HANDLE_R} y={y - HANDLE_R} width={HANDLE_R * 2} height={HANDLE_R * 2}
              className="pl-auto-tension"
              onPointerDown={e => {
                e.stopPropagation();
                if (e.button === 0) beginTensionGesture(clip.id, i, e.clientY, pt.tension);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};
