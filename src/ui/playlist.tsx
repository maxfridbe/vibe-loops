// The Playlist: FL-style non-linear multitrack timeline. Tracks are
// type-agnostic clip lanes hosting loop clips and automation clips.
//
// All layout is rem-based so the whole surface scales typographically;
// mouse coordinates (px) are converted through the live root font size.

import { AudioEngine } from '../engine/audio';
import { autoValueAt } from '../engine/automation';
import { Action, AppState } from '../store';
import {
  AutoClip, Clip, Loop, PPQ, Track, loopLengthTicks, snapTicks,
} from '../types';
import { LoopDrag } from './browser';

const TRACK_H = 4;        // rem
const RULER_H = 1.625;    // rem
const HEADER_W = 9.5;     // rem
const CLIP_LABEL_H = 0.875; // rem
const EDGE_GRAB = 0.5;    // rem, resize handle width
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
  | { kind: 'move'; ids: number[]; startTicks: Map<number, number>; startTrackIdx: number; grabTick: number; auto: boolean }
  | { kind: 'resize-r'; id: number; auto: boolean }
  | { kind: 'resize-l'; id: number; auto: boolean }
  | { kind: 'slip'; id: number; grabTick: number; startOffset: number }
  | { kind: 'paint'; trackId: number }
  | { kind: 'marquee'; x0: number; y0: number }
  | { kind: 'scrub' }
  | { kind: 'auto-point'; clipId: number; index: number }
  | { kind: 'auto-tension'; clipId: number; index: number; startY: number; startTension: number };

let gestureCounter = 0;

export const Playlist = ({
  state, dispatch, engine, playheadTicks, onSeek, dragLoop, onDragConsumed,
}: PlaylistProps): React.ReactElement => {
  const { project, ui } = state;
  const rpb = ui.remPerBeat;
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const playheadRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{ g: Gesture; id: string } | null>(null);
  // marquee kept in rem coordinates
  const [marquee, setMarquee] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

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

  // --- window-level gesture handling ---------------------------------------
  React.useEffect(() => {
    const onMove = (e: MouseEvent): void => {
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
          const moveOne = <T extends Clip | AutoClip>(c: T): T => {
            const base = g.startTicks.get(c.id)!;
            const idx = Math.min(sortedTracks.length - 1, Math.max(0, (trackIdxById.get(c.trackId) ?? 0) + trackDelta));
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
      }
    };
    const onUp = (): void => {
      if (gestureRef.current?.g.kind === 'marquee') setMarquee(null);
      gestureRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  // --- browser drag-and-drop ------------------------------------------------
  React.useEffect(() => {
    if (!dragLoop) return;
    const onUp = (e: MouseEvent): void => {
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
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
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

  // --- mousedown dispatchers ------------------------------------------------
  const beginGesture = (g: Gesture): void => {
    gestureRef.current = { g, id: `g${++gestureCounter}` };
  };

  const onEmptyMouseDown = (e: React.MouseEvent, trackIdx: number): void => {
    if (e.button === 2) return;
    const p = pos(e);
    const bypass = e.altKey;
    if (ui.tool === 'draw' || ui.tool === 'paint') {
      if (ui.clipKind === 'loop') {
        const loop = ui.focusedLoopId !== null ? loopById.get(ui.focusedLoopId) : undefined;
        if (!loop) return;
        const id = `g${++gestureCounter}`;
        if (ui.tool === 'paint') {
          gestureRef.current = { g: { kind: 'paint', trackId: 0 }, id };
          const len = loopLengthTicks(loop);
          newClipFromLoop(loop, Math.floor(p.tick / len) * len, trackIdx, id);
        } else {
          const clip = newClipFromLoop(loop, snap(p.tick, bypass), trackIdx, id);
          if (clip) {
            gestureRef.current = {
              g: {
                kind: 'move', ids: [clip.id],
                startTicks: new Map([[clip.id, clip.startTicks]]),
                startTrackIdx: trackIdx, grabTick: p.tick, auto: false,
              },
              id,
            };
          }
        }
      } else {
        // automation clip
        const track = sortedTracks[Math.min(sortedTracks.length - 1, Math.max(0, trackIdx))];
        if (!track) return;
        const start = snap(p.tick, bypass);
        const clip: AutoClip = {
          id: state.nextId,
          trackId: track.id,
          target: ui.focusedAutoTarget,
          startTicks: start,
          lengthTicks: PPQ * 16,
          muted: false,
          points: [
            { pos: 0, value: 0.8, tension: 0 },
            { pos: 1, value: 0.8, tension: 0 },
          ],
        };
        dispatch({ type: 'edit', autoClips: [...project.autoClips, clip], gesture: `g${++gestureCounter}` });
      }
    } else if (ui.tool === 'select') {
      beginGesture({ kind: 'marquee', x0: p.x, y0: p.y });
      dispatch({ type: 'set-selection', clipIds: [], autoClipIds: [] });
    }
  };

  const onClipMouseDown = (e: React.MouseEvent, clip: Clip): void => {
    e.stopPropagation();
    if (e.button === 2) {
      editClips(project.clips.filter(c => c.id !== clip.id), `g${++gestureCounter}`);
      return;
    }
    const p = pos(e);
    const rectX = HEADER_W + ticksToRem(clip.startTicks, rpb);
    const w = ticksToRem(clip.lengthTicks, rpb);
    const nearR = p.x > rectX + w - EDGE_GRAB;
    const nearL = p.x < rectX + EDGE_GRAB;
    switch (ui.tool) {
      case 'slice': {
        const at = snap(p.tick, e.altKey);
        if (at > clip.startTicks && at < clip.startTicks + clip.lengthTicks) {
          const first: Clip = { ...clip, lengthTicks: at - clip.startTicks };
          const second: Clip = {
            ...clip,
            id: state.nextId,
            startTicks: at,
            lengthTicks: clip.startTicks + clip.lengthTicks - at,
            offsetTicks: clip.offsetTicks + (at - clip.startTicks),
          };
          editClips(project.clips.flatMap(c => (c.id === clip.id ? [first, second] : [c])), `g${++gestureCounter}`);
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
        beginGesture({
          kind: 'move', ids,
          startTicks: new Map(project.clips.filter(c => ids.includes(c.id)).map(c => [c.id, c.startTicks])),
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
          beginGesture({
            kind: 'move', ids,
            startTicks: new Map(project.clips.filter(c => ids.includes(c.id)).map(c => [c.id, c.startTicks])),
            startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
            grabTick: p.tick, auto: false,
          });
        }
      }
    }
  };

  const onAutoClipMouseDown = (e: React.MouseEvent, clip: AutoClip, zone: 'label' | 'body'): void => {
    e.stopPropagation();
    if (e.button === 2) {
      editAuto(project.autoClips.filter(c => c.id !== clip.id), `g${++gestureCounter}`);
      return;
    }
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
        startTrackIdx: trackIdxById.get(clip.trackId) ?? 0,
        grabTick: p.tick, auto: true,
      });
    } else if (e.ctrlKey || e.metaKey) {
      // add a point at the cursor
      const relPos = Math.min(1, Math.max(0, (p.tick - clip.startTicks) / clip.lengthTicks));
      const idx = trackIdxById.get(clip.trackId) ?? 0;
      const laneTop = RULER_H + idx * TRACK_H + CLIP_LABEL_H;
      const laneH = TRACK_H - CLIP_LABEL_H - 0.25;
      const value = Math.min(1, Math.max(0, 1 - (p.y - laneTop) / laneH));
      const pts = [...clip.points, { pos: relPos, value, tension: 0 }].sort((a, b) => a.pos - b.pos);
      const index = pts.findIndex(pt => pt.pos === relPos && pt.value === value);
      editAuto(project.autoClips.map(c => (c.id === clip.id ? { ...c, points: pts } : c)), `g${++gestureCounter}`);
      beginGesture({ kind: 'auto-point', clipId: clip.id, index });
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
    <div className="playlist" onContextMenu={e => e.preventDefault()}>
      <div className="pl-scroll">
        <div
          className="pl-content"
          ref={contentRef}
          style={{ width: `${contentW}rem`, height: `${RULER_H + sortedTracks.length * TRACK_H + 2.25}rem` }}
        >
          <div className="pl-ruler" style={{ width: `${contentW}rem`, height: `${RULER_H}rem` }}
            onMouseDown={e => {
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
              onEmptyMouseDown={onEmptyMouseDown}
              onClipMouseDown={onClipMouseDown}
              onAutoClipMouseDown={onAutoClipMouseDown}
              beginPointGesture={(clipId, index) => beginGesture({ kind: 'auto-point', clipId, index })}
              beginTensionGesture={(clipId, index, startY, startTension) =>
                beginGesture({ kind: 'auto-tension', clipId, index, startY, startTension })}
              removePoint={(clipId, index) => {
                editAuto(project.autoClips.map(c => {
                  if (c.id !== clipId || c.points.length <= 2) return c;
                  return { ...c, points: c.points.filter((_, i) => i !== index) };
                }), `g${++gestureCounter}`);
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
    </div>
  );
};

const TRACK_COLORS = ['#e06c5c', '#e0a75c', '#d9d05b', '#7fc95e', '#5bd9b1', '#5b8dd9', '#8d6cd9', '#d95bb4'];

interface TrackRowProps {
  track: Track;
  state: AppState;
  gridBg: React.CSSProperties;
  contentW: number;
  onEmptyMouseDown: (e: React.MouseEvent, trackIdx: number) => void;
  onClipMouseDown: (e: React.MouseEvent, clip: Clip) => void;
  onAutoClipMouseDown: (e: React.MouseEvent, clip: AutoClip, zone: 'label' | 'body') => void;
  beginPointGesture: (clipId: number, index: number) => void;
  beginTensionGesture: (clipId: number, index: number, startY: number, startTension: number) => void;
  removePoint: (clipId: number, index: number) => void;
  dispatch: (a: Action) => void;
  engine: AudioEngine;
}

const TrackRow = ({
  track, state, gridBg, contentW, onEmptyMouseDown, onClipMouseDown, onAutoClipMouseDown,
  beginPointGesture, beginTensionGesture, removePoint, dispatch, engine,
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
      onMouseDown={e => onEmptyMouseDown(e, track.idx)}
    >
      <div className="pl-head" style={{ width: `${HEADER_W}rem` }} onMouseDown={e => e.stopPropagation()}>
        <div className="pl-head-top">
          <span className="pl-head-swatch" style={{ background: track.color }} />
          <span
            className="pl-head-name"
            title="double-click to rename"
            onDoubleClick={() => {
              const name = prompt('track name', track.name);
              if (name) dispatch({ type: 'update-track', track: { ...track, name } });
            }}
          >{track.name}</span>
          <button
            className={`pl-head-mute${track.muted ? ' on' : ''}`}
            title="mute track"
            onClick={() => dispatch({ type: 'update-track', track: { ...track, muted: !track.muted } })}
          >M</button>
        </div>
        <div className="pl-head-sliders">
          <input
            type="range" min="0" max="1.25" step="0.01" value={track.volume} title="volume"
            onChange={e => dispatch({ type: 'update-track', track: { ...track, volume: Number(e.target.value) } })}
          />
          <input
            type="range" min="-1" max="1" step="0.01" value={track.pan} title="pan"
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
            engine={engine}
            onMouseDown={e => onClipMouseDown(e, clip)}
          />
        );
      })}

      {autoClips.map(clip => (
        <AutoClipView
          key={clip.id}
          clip={clip}
          rpb={rpb}
          selected={ui.autoSelection.includes(clip.id)}
          onMouseDown={(e, zone) => onAutoClipMouseDown(e, clip, zone)}
          beginPointGesture={beginPointGesture}
          beginTensionGesture={beginTensionGesture}
          removePoint={removePoint}
        />
      ))}
    </div>
  );
};

const ClipView = ({ clip, loop, color, rpb, selected, engine, onMouseDown }: {
  clip: Clip; loop: Loop; color: string; rpb: number; selected: boolean;
  engine: AudioEngine;
  onMouseDown: (e: React.MouseEvent) => void;
}): React.ReactElement => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const wRem = Math.max(0.125, ticksToRem(clip.lengthTicks, rpb));
  const hRem = TRACK_H - 0.25;

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
    const loopTicks = loopLengthTicks(loop);
    const labelPx = CLIP_LABEL_H * unit;
    const waveH = hPx - labelPx - 2;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < wPx; x++) {
      const tick = clip.offsetTicks + remToTicks(x / unit, rpb);
      const inLoop = ((tick % loopTicks) + loopTicks) % loopTicks;
      const bucket = Math.min(peaks.length - 1, Math.floor((inLoop / loopTicks) * peaks.length));
      const p = peaks[bucket];
      const bh = Math.max(1, p * waveH);
      ctx.fillRect(x, labelPx + (waveH - bh) / 2, 1, bh);
    }
    // loop repeat boundaries
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = Math.ceil(clip.offsetTicks / loopTicks); ; k++) {
      const xRem = ticksToRem(k * loopTicks - clip.offsetTicks, rpb);
      const x = xRem * unit;
      if (x >= wPx) break;
      if (x > 0) ctx.fillRect(Math.round(x), labelPx, 1, waveH);
    }
  });

  return (
    <div
      className={`pl-clip${selected ? ' selected' : ''}${clip.muted ? ' muted' : ''}`}
      style={{
        left: `${HEADER_W + ticksToRem(clip.startTicks, rpb)}rem`,
        width: `${wRem}rem`,
        height: `${hRem}rem`,
        background: color,
      }}
      onMouseDown={onMouseDown}
    >
      <div className="pl-clip-label">{loop.name}</div>
      <canvas ref={canvasRef} />
    </div>
  );
};

const AUTO_COLOR = '#d98d3a';

const AutoClipView = ({ clip, rpb, selected, onMouseDown, beginPointGesture, beginTensionGesture, removePoint }: {
  clip: AutoClip; rpb: number; selected: boolean;
  onMouseDown: (e: React.MouseEvent, zone: 'label' | 'body') => void;
  beginPointGesture: (clipId: number, index: number) => void;
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
      onMouseDown={e => onMouseDown(e, 'body')}
    >
      <div className="pl-clip-label" onMouseDown={e => onMouseDown(e, 'label')}>
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
              cx={x} cy={y} r="0.22"
              className="pl-auto-point"
              onMouseDown={e => {
                e.stopPropagation();
                if (e.button === 2) {
                  removePoint(clip.id, i);
                } else {
                  beginPointGesture(clip.id, i);
                }
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
              x={x - 0.16} y={y - 0.16} width="0.32" height="0.32"
              className="pl-auto-tension"
              onMouseDown={e => {
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
