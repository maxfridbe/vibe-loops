// Shared data model for vibe-loops. Mirrors the .vibeloop SQLite schema
// (scripts/schema.sql), version 1.

export const PPQ = 96; // ticks per quarter-note beat

export interface Loop {
  id: number;
  name: string;
  file: string;
  category: string;
  bpm: number;
  beats: number;
  keySig: string;
  license: string;
  source: string;
  mp3: Uint8Array;
}

export interface Track {
  id: number;
  idx: number;
  name: string;
  color: string;
  volume: number; // 0..1.25
  pan: number;    // -1..1
  muted: boolean;
}

export interface Clip {
  id: number;
  trackId: number;
  loopId: number;
  startTicks: number;
  lengthTicks: number;
  offsetTicks: number; // slip offset into the loop
  gain: number;
  muted: boolean;
  // Optional non-destructive volume envelope over the clip (FL-style):
  // pos 0..1 across the clip, value 0..1 gain multiplier. Absent = flat.
  envelope?: AutoPoint[];
  // Timeline ticks one loop repetition occupies in this clip. Absent = the
  // loop's natural length; other values time-stretch the audio in place.
  stretchTicks?: number;
}

export type AutoTarget = 'master.volume' | 'track.volume' | 'track.pan';

export interface AutoPoint {
  pos: number;     // 0..1 across the clip
  value: number;   // normalized 0..1
  tension: number; // -1..1 curvature of the segment leaving this point
}

export interface AutoClip {
  id: number;
  trackId: number;
  target: AutoTarget;
  startTicks: number;
  lengthTicks: number;
  muted: boolean;
  points: AutoPoint[]; // sorted by pos
}

export interface Arrangement {
  tracks: Track[];
  clips: Clip[];
  autoClips: AutoClip[];
}

export interface Project extends Arrangement {
  name: string;
  bpm: number;
  masterVolume: number;
  loops: Loop[];
}

export type Tool = 'draw' | 'paint' | 'slice' | 'mute' | 'select' | 'stretch';

// Ticks one repetition of the clip's loop occupies (stretch-aware).
export const clipPeriodTicks = (clip: { stretchTicks?: number }, loop: Loop): number =>
  clip.stretchTicks ?? loopLengthTicks(loop);

// Stretch ratio relative to the loop's natural musical length.
export const clipStretchRatio = (clip: { stretchTicks?: number }, loop: Loop): number =>
  clipPeriodTicks(clip, loop) / loopLengthTicks(loop);

export type ClipKind = 'loop' | 'automation';

// Snap resolution in ticks; 0 = no snapping.
export const SNAP_CHOICES: Array<{ label: string; ticks: number }> = [
  { label: 'Bar', ticks: PPQ * 4 },
  { label: 'Beat', ticks: PPQ },
  { label: '1/2 beat', ticks: PPQ / 2 },
  { label: '1/4 beat', ticks: PPQ / 4 },
  { label: 'None', ticks: 0 },
];

export const secondsPerTick = (bpm: number): number => 60 / (bpm * PPQ);
export const ticksToSeconds = (ticks: number, bpm: number): number => ticks * secondsPerTick(bpm);
export const secondsToTicks = (s: number, bpm: number): number => s / secondsPerTick(bpm);

// Musical length of a loop in ticks (independent of project tempo).
export const loopLengthTicks = (loop: Loop): number => loop.beats * PPQ;

export const snapTicks = (ticks: number, snap: number): number =>
  snap <= 0 ? Math.round(ticks) : Math.round(ticks / snap) * snap;

export const arrangementEndTicks = (arr: Arrangement): number => {
  let end = 0;
  for (const c of arr.clips) end = Math.max(end, c.startTicks + c.lengthTicks);
  for (const a of arr.autoClips) end = Math.max(end, a.startTicks + a.lengthTicks);
  return end;
};
