import { DEFAULT_THEME } from './themes';
import {
  Arrangement, AutoClip, AutoTarget, Clip, ClipKind, Loop, Project, SNAP_CHOICES, Tool, Track,
} from './types';

export interface UIState {
  tool: Tool;
  snap: number; // ticks, 0 = off
  remPerBeat: number; // horizontal zoom, in root-em units per quarter note
  clipKind: ClipKind;
  focusedLoopId: number | null;
  focusedAutoTarget: AutoTarget;
  selection: number[];       // selected loop-clip ids
  autoSelection: number[];   // selected automation-clip ids
  playing: boolean;
  theme: string;             // id from THEMES
}

interface HistoryEntry {
  bpm: number;
  tracks: Track[];
  clips: Clip[];
  autoClips: AutoClip[];
}

export interface AppState {
  project: Project;
  ui: UIState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastGesture: string | null;
  nextId: number;
  status: string; // transient status-bar message
}

export type Action =
  | { type: 'load-project'; project: Project }
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-snap'; snap: number }
  | { type: 'set-zoom'; remPerBeat: number }
  | { type: 'set-clip-kind'; clipKind: ClipKind }
  | { type: 'focus-loop'; loopId: number }
  | { type: 'focus-auto-target'; target: AutoTarget }
  | { type: 'set-selection'; clipIds: number[]; autoClipIds: number[] }
  | { type: 'set-playing'; playing: boolean }
  | { type: 'set-bpm'; bpm: number }
  | { type: 'set-master-volume'; volume: number }
  | { type: 'set-project-name'; name: string }
  | { type: 'update-track'; track: Track }
  | {
      type: 'edit';           // any arrangement edit (clips / autoClips / tracks)
      clips?: Clip[];
      autoClips?: AutoClip[];
      tracks?: Track[];
      gesture?: string;       // same gesture id -> single undo entry
    }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'set-status'; status: string }
  | { type: 'set-theme'; theme: string }
  | { type: 'add-loop'; loop: Loop };

const snapshot = (p: Project): HistoryEntry => ({
  bpm: p.bpm,
  tracks: p.tracks,
  clips: p.clips,
  autoClips: p.autoClips,
});

const maxId = (arr: Arrangement): number => {
  let m = 0;
  for (const c of arr.clips) m = Math.max(m, c.id);
  for (const a of arr.autoClips) m = Math.max(m, a.id);
  for (const t of arr.tracks) m = Math.max(m, t.id);
  return m;
};

export const initialUI: UIState = {
  tool: 'draw',
  snap: SNAP_CHOICES[1].ticks, // Beat
  remPerBeat: 2,
  clipKind: 'loop',
  focusedLoopId: null,
  focusedAutoTarget: 'track.volume',
  selection: [],
  autoSelection: [],
  playing: false,
  theme: DEFAULT_THEME,
};

export const makeInitialState = (project: Project, theme?: string): AppState => ({
  project,
  ui: {
    ...initialUI,
    focusedLoopId: project.loops.length ? project.loops[0].id : null,
    theme: theme ?? initialUI.theme,
  },
  past: [],
  future: [],
  lastGesture: null,
  nextId: maxId(project) + 1,
  status: 'ready',
});

const HISTORY_LIMIT = 100;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load-project':
      return makeInitialState(action.project, state.ui.theme);
    case 'set-tool':
      return { ...state, ui: { ...state.ui, tool: action.tool } };
    case 'set-snap':
      return { ...state, ui: { ...state.ui, snap: action.snap } };
    case 'set-zoom':
      return { ...state, ui: { ...state.ui, remPerBeat: Math.min(10, Math.max(0.4, action.remPerBeat)) } };
    case 'set-clip-kind':
      return { ...state, ui: { ...state.ui, clipKind: action.clipKind } };
    case 'focus-loop':
      return { ...state, ui: { ...state.ui, focusedLoopId: action.loopId, clipKind: 'loop' } };
    case 'focus-auto-target':
      return { ...state, ui: { ...state.ui, focusedAutoTarget: action.target, clipKind: 'automation' } };
    case 'set-selection':
      return { ...state, ui: { ...state.ui, selection: action.clipIds, autoSelection: action.autoClipIds } };
    case 'set-playing':
      return { ...state, ui: { ...state.ui, playing: action.playing } };
    case 'set-bpm': {
      const bpm = Math.min(300, Math.max(40, action.bpm));
      if (bpm === state.project.bpm) return state;
      return {
        ...state,
        project: { ...state.project, bpm },
        past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        lastGesture: null,
      };
    }
    case 'set-master-volume':
      return { ...state, project: { ...state.project, masterVolume: Math.min(1.25, Math.max(0, action.volume)) } };
    case 'set-project-name':
      return { ...state, project: { ...state.project, name: action.name } };
    case 'update-track':
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t => (t.id === action.track.id ? action.track : t)),
        },
      };
    case 'edit': {
      const sameGesture = action.gesture !== undefined && action.gesture === state.lastGesture;
      const past = sameGesture ? state.past : [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT);
      return {
        ...state,
        project: {
          ...state.project,
          clips: action.clips ?? state.project.clips,
          autoClips: action.autoClips ?? state.project.autoClips,
          tracks: action.tracks ?? state.project.tracks,
        },
        past,
        future: [],
        lastGesture: action.gesture ?? null,
        nextId: Math.max(
          state.nextId,
          maxId({
            clips: action.clips ?? [],
            autoClips: action.autoClips ?? [],
            tracks: action.tracks ?? [],
          }) + 1,
        ),
      };
    }
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        project: { ...state.project, ...prev },
        past: state.past.slice(0, -1),
        future: [snapshot(state.project), ...state.future],
        lastGesture: null,
        ui: { ...state.ui, selection: [], autoSelection: [] },
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        project: { ...state.project, ...next },
        past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        lastGesture: null,
        ui: { ...state.ui, selection: [], autoSelection: [] },
      };
    }
    case 'set-status':
      return { ...state, status: action.status };
    case 'set-theme':
      return { ...state, ui: { ...state.ui, theme: action.theme } };
    case 'add-loop':
      return {
        ...state,
        project: { ...state.project, loops: [...state.project.loops, action.loop] },
        nextId: Math.max(state.nextId, action.loop.id + 1),
        ui: { ...state.ui, focusedLoopId: action.loop.id, clipKind: 'loop' },
        status: `added "${action.loop.name}" to the library`,
      };
  }
}
