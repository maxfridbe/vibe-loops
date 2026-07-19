// Ribbon bar in the vibe_sheet toolbar paradigm: grouped icon buttons with
// captions, driving global project/transport/tool/export state.

import { Action, AppState } from '../store';
import { THEMES } from '../themes';
import { AutoTarget, PPQ, SNAP_CHOICES, Tool } from '../types';
import {
  BrushIcon, DownloadIcon, FilePlusIcon, FolderOpenIcon, LoopIcon, MuteIcon, MusicIcon,
  PencilIcon, PlayIcon, RedoIcon, SaveIcon, ScissorsIcon, SelectIcon, SpeakerIcon,
  SplineIcon, StopIcon, UndoIcon, WaveIcon,
} from './icons';

export const RibbonButton = ({ icon: IconEl, active, disabled, onClick, label, caption }: {
  icon: (p: { size?: number }) => React.ReactElement;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  caption?: string;
}): React.ReactElement => (
  <button
    onClick={onClick}
    title={label}
    disabled={disabled}
    className={`rb-btn${active ? ' active' : ''}`}
  >
    <IconEl size={18} />
    {caption && <span className="rb-btn-caption">{caption}</span>}
  </button>
);

const RibbonGroup = ({ label, children }: { label: string; children?: React.ReactNode }): React.ReactElement => (
  <div className="rb-group">
    <div className="rb-group-controls">{children}</div>
    <div className="rb-group-label">{label}</div>
  </div>
);

interface RibbonProps {
  state: AppState;
  dispatch: (a: Action) => void;
  playheadTicks: number;
  onPlay: () => void;
  onStop: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExportMp3: () => void;
  onExportWav: () => void;
}

const TOOLS: Array<{ tool: Tool; label: string; icon: (p: { size?: number }) => React.ReactElement; key: string }> = [
  { tool: 'draw', label: 'Draw (P) — drag to move, edges resize, Shift-drag slips, Alt bypasses snap, right-click deletes', icon: PencilIcon, key: 'P' },
  { tool: 'paint', label: 'Paint (B) — drag to place repeated clips', icon: BrushIcon, key: 'B' },
  { tool: 'slice', label: 'Slice (C) — click a clip to split it', icon: ScissorsIcon, key: 'C' },
  { tool: 'mute', label: 'Mute (T) — click a clip to toggle it', icon: MuteIcon, key: 'T' },
  { tool: 'select', label: 'Select (E) — marquee select, Del deletes', icon: SelectIcon, key: 'E' },
];

export const Ribbon = ({
  state, dispatch, playheadTicks, onPlay, onStop, onNew, onOpen, onSave, onExportMp3, onExportWav,
}: RibbonProps): React.ReactElement => {
  const { project, ui } = state;
  const bar = Math.floor(playheadTicks / (PPQ * 4)) + 1;
  const beat = Math.floor((playheadTicks % (PPQ * 4)) / PPQ) + 1;
  const focusedLoop = project.loops.find(l => l.id === ui.focusedLoopId);

  return (
    <div className="ribbon">
      <div className="rb-brand">
        <LoopIcon size={20} />
        <div className="rb-brand-text">
          <span className="rb-brand-name">VIBE LOOPS</span>
          <input
            className="rb-project-name"
            value={project.name}
            title="project name"
            onChange={e => dispatch({ type: 'set-project-name', name: e.target.value })}
          />
        </div>
      </div>

      <RibbonGroup label="project">
        <RibbonButton icon={FilePlusIcon} onClick={onNew} label="New project (starter library)" />
        <RibbonButton icon={FolderOpenIcon} onClick={onOpen} label="Open .vibeloop…" />
        <RibbonButton icon={SaveIcon} onClick={onSave} label="Save .vibeloop" />
      </RibbonGroup>

      <RibbonGroup label="history">
        <RibbonButton icon={UndoIcon} onClick={() => dispatch({ type: 'undo' })} label="Undo (Ctrl+Z)" disabled={state.past.length === 0} />
        <RibbonButton icon={RedoIcon} onClick={() => dispatch({ type: 'redo' })} label="Redo (Ctrl+Shift+Z)" disabled={state.future.length === 0} />
      </RibbonGroup>

      <RibbonGroup label="transport">
        {ui.playing
          ? <RibbonButton icon={StopIcon} onClick={onStop} label="Stop (Space)" active />
          : <RibbonButton icon={PlayIcon} onClick={onPlay} label="Play (Space)" />}
        <div className="rb-pos" title="bar.beat">{bar}.{beat}</div>
        <label className="rb-field">
          <input
            type="number" min="40" max="300" step="1" value={project.bpm}
            onChange={e => dispatch({ type: 'set-bpm', bpm: Number(e.target.value) })}
          />
          <span>bpm</span>
        </label>
        <label className="rb-field rb-master" title="master volume">
          <SpeakerIcon size={14} />
          <input
            type="range" min="0" max="1.25" step="0.01" value={project.masterVolume}
            onChange={e => dispatch({ type: 'set-master-volume', volume: Number(e.target.value) })}
          />
        </label>
      </RibbonGroup>

      <RibbonGroup label="tools">
        {TOOLS.map(t => (
          <RibbonButton
            key={t.tool}
            icon={t.icon}
            active={ui.tool === t.tool}
            onClick={() => dispatch({ type: 'set-tool', tool: t.tool })}
            label={t.label}
          />
        ))}
        <label className="rb-field">
          <select
            value={ui.snap}
            onChange={e => dispatch({ type: 'set-snap', snap: Number(e.target.value) })}
          >
            {SNAP_CHOICES.map(s => <option key={s.label} value={s.ticks}>{s.label}</option>)}
          </select>
          <span>snap</span>
        </label>
      </RibbonGroup>

      <RibbonGroup label="place">
        <RibbonButton
          icon={WaveIcon}
          active={ui.clipKind === 'loop'}
          onClick={() => dispatch({ type: 'set-clip-kind', clipKind: 'loop' })}
          label="Place loop clips (pick a loop in the browser)"
        />
        <RibbonButton
          icon={SplineIcon}
          active={ui.clipKind === 'automation'}
          onClick={() => dispatch({ type: 'set-clip-kind', clipKind: 'automation' })}
          label="Place automation clips"
        />
        {ui.clipKind === 'loop' ? (
          <div className="rb-focused" title="focused loop">
            <MusicIcon size={13} />
            <span>{focusedLoop ? focusedLoop.name : '—'}</span>
          </div>
        ) : (
          <label className="rb-field">
            <select
              value={ui.focusedAutoTarget}
              onChange={e => dispatch({ type: 'focus-auto-target', target: e.target.value as AutoTarget })}
            >
              <option value="track.volume">track volume</option>
              <option value="track.pan">track pan</option>
              <option value="master.volume">master volume</option>
            </select>
            <span>target</span>
          </label>
        )}
      </RibbonGroup>

      <RibbonGroup label="export">
        <RibbonButton icon={DownloadIcon} onClick={onExportMp3} label="Export mixdown as MP3" caption="mp3" />
        <RibbonButton icon={DownloadIcon} onClick={onExportWav} label="Export mixdown as WAV" caption="wav" />
      </RibbonGroup>

      <RibbonGroup label="view">
        <label className="rb-field">
          <select
            value={ui.theme}
            title="color theme"
            onChange={e => dispatch({ type: 'set-theme', theme: e.target.value })}
          >
            <optgroup label="dark">
              {THEMES.filter(t => t.dark).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </optgroup>
            <optgroup label="light">
              {THEMES.filter(t => !t.dark).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </optgroup>
          </select>
          <span>theme</span>
        </label>
      </RibbonGroup>

      <div className="rb-spacer" />
      <div className="rb-status">{state.status}</div>
    </div>
  );
};
