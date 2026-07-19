// Ribbon bar in the vibe_sheet paradigm, organized into tabs (Home /
// Export / View) with an always-visible transport cluster on the tab strip.

import { Action, AppState } from '../store';
import { THEMES, UI_SCALES } from '../themes';
import { AutoTarget, PPQ, SNAP_CHOICES, Tool } from '../types';
import {
  BrushIcon, DownloadIcon, EnvelopeIcon, FilePlusIcon, FolderOpenIcon, LoopIcon, MicIcon, MuteIcon,
  MusicIcon, PencilIcon, PlayIcon, RedoIcon, SaveIcon, ScissorsIcon, SelectIcon, SpeakerIcon,
  SplineIcon, StepBackIcon, StopIcon, StretchIcon, UndoIcon, UploadIcon, WaveIcon,
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

type RibbonTab = 'home' | 'export' | 'view';

interface RibbonProps {
  state: AppState;
  dispatch: (a: Action) => void;
  playheadTicks: number;
  uiScale: number;
  onSetUiScale: (pct: number) => void;
  onPlay: () => void;
  onPlayFromStart: () => void;
  onStop: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onImport: () => void;
  onRecord: () => void;
  onExportMp3: () => void;
  onExportWav: () => void;
  onHelp: () => void;
}

const TOOLS: Array<{ tool: Tool; label: string; icon: (p: { size?: number }) => React.ReactElement }> = [
  { tool: 'draw', label: 'Draw (P) — click places the focused clip; drag moves, edges resize, Shift-drag slips audio, Alt bypasses snap, right-click deletes', icon: PencilIcon },
  { tool: 'paint', label: 'Paint (B) — click-drag stamps repeated copies of the focused loop', icon: BrushIcon },
  { tool: 'slice', label: 'Slice (C) — click a clip to split it at that (snapped) position', icon: ScissorsIcon },
  { tool: 'mute', label: 'Mute (T) — click a clip to toggle it silent without removing it', icon: MuteIcon },
  { tool: 'select', label: 'Select (E) — drag a marquee across clips; Shift toggles, Del deletes, dragging moves the whole selection', icon: SelectIcon },
  { tool: 'stretch', label: 'Stretch (S) — grab a clip\'s beginning or end and drag to time-stretch the audio in place (pitch preserved, 0.25×–4×)', icon: StretchIcon },
];

export const Ribbon = (props: RibbonProps): React.ReactElement => {
  const {
    state, dispatch, playheadTicks, uiScale, onSetUiScale,
    onPlay, onPlayFromStart, onStop, onNew, onOpen, onSave, onImport, onRecord, onExportMp3, onExportWav,
    onHelp,
  } = props;
  const { project, ui } = state;
  const [tab, setTab] = React.useState<RibbonTab>('home');
  const bar = Math.floor(playheadTicks / (PPQ * 4)) + 1;
  const beat = Math.floor((playheadTicks % (PPQ * 4)) / PPQ) + 1;
  const focusedLoop = project.loops.find(l => l.id === ui.focusedLoopId);

  const TABS: Array<{ id: RibbonTab; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'export', label: 'Export' },
    { id: 'view', label: 'View' },
  ];

  return (
    <div className="ribbon">
      <div className="rb-top">
        <div className="rb-brand" title="vibe loops">
          <LoopIcon size={18} />
          <div className="rb-brand-text">
            <span className="rb-brand-name">VIBE LOOPS</span>
            <input
              className="rb-project-name"
              value={project.name}
              title="project name — used for saved .vibeloop and exported audio filenames"
              onChange={e => dispatch({ type: 'set-project-name', name: e.target.value })}
            />
          </div>
        </div>

        <div className="rb-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              className={`rb-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        <div className="rb-top-spacer" />

        <div className="rb-transport" title="transport">
          <RibbonButton
            icon={StepBackIcon}
            onClick={onPlayFromStart}
            label="Play from the beginning of the arrangement (Ctrl+Space)"
          />
          {ui.playing
            ? <RibbonButton icon={StopIcon} onClick={onStop} label="Stop playback — the playhead stays where it stopped (Space)" active />
            : <RibbonButton icon={PlayIcon} onClick={onPlay} label="Play from the playhead position (Space). Click or drag the bar ruler to move the playhead." />}
          <div className="rb-pos" title="playhead position as bar.beat — click or drag the bar ruler above the playlist to seek">{bar}.{beat}</div>
          <label className="rb-field" title="project tempo in beats per minute (40–300) — every loop is time-stretched to follow it, so changing it re-locks the whole arrangement">
            <input
              type="number" min="40" max="300" step="1" value={project.bpm}
              onChange={e => dispatch({ type: 'set-bpm', bpm: Number(e.target.value) })}
            />
            <span>bpm</span>
          </label>
          <label className="rb-field rb-master" title="master output volume — applies to playback, previews, and exported audio">
            <SpeakerIcon size={14} />
            <input
              type="range" min="0" max="1.25" step="0.01" value={project.masterVolume}
              onChange={e => dispatch({ type: 'set-master-volume', volume: Number(e.target.value) })}
            />
          </label>
        </div>

        <button className="rb-help" title="keyboard shortcuts and mouse reference (?)" onClick={onHelp}>?</button>
        <div className="rb-status" title="status">{state.status}</div>
      </div>

      <div className="rb-groups">
        {tab === 'home' && (
          <>
            <RibbonGroup label="project">
              <RibbonButton icon={FilePlusIcon} onClick={onNew} label="New project — reloads the starter library (unsaved changes are lost)" />
              <RibbonButton icon={FolderOpenIcon} onClick={onOpen} label="Open a .vibeloop project file from disk" />
              <RibbonButton icon={SaveIcon} onClick={onSave} label="Save the project as a self-contained .vibeloop file (loops embedded)" />
            </RibbonGroup>

            <RibbonGroup label="history">
              <RibbonButton icon={UndoIcon} onClick={() => dispatch({ type: 'undo' })} label="Undo (Ctrl+Z)" disabled={state.past.length === 0} />
              <RibbonButton icon={RedoIcon} onClick={() => dispatch({ type: 'redo' })} label="Redo (Ctrl+Shift+Z / Ctrl+Y)" disabled={state.future.length === 0} />
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
              <RibbonButton
                icon={EnvelopeIcon}
                active={ui.envelopeMode}
                onClick={() => dispatch({ type: 'toggle-envelope-mode' })}
                label="Clip envelope mode — overlays an editable volume-envelope spline on every loop clip: click the clip to add a point, drag points freely (horizontal + vertical), drag the square mid-segment handles for tension, right-click a point to remove it (right-click an end point to clear the whole envelope)"
              />
              <label className="rb-field" title="grid snap resolution — placement, moves and slices round to this; hold Alt to bypass">
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
                label="Place loop clips — pick which loop in the library browser"
              />
              <RibbonButton
                icon={SplineIcon}
                active={ui.clipKind === 'automation'}
                onClick={() => dispatch({ type: 'set-clip-kind', clipKind: 'automation' })}
                label="Place automation clips — spline curves that drive a parameter over time"
              />
              {ui.clipKind === 'loop' ? (
                <div className="rb-focused" title="the loop the draw/paint tools will place — click a loop in the library to change">
                  <MusicIcon size={13} />
                  <span>{focusedLoop ? focusedLoop.name : '—'}</span>
                </div>
              ) : (
                <label className="rb-field" title="the parameter new automation clips will control">
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

            <RibbonGroup label="library">
              <RibbonButton icon={UploadIcon} onClick={onImport} label="Import loops into the library from .mp3, .wav or .mid files (MIDI is rendered with a built-in synth); a trim dialog follows" />
              <RibbonButton icon={MicIcon} onClick={onRecord} label="Record a loop from the microphone, then trim it into the library" />
            </RibbonGroup>
          </>
        )}

        {tab === 'export' && (
          <RibbonGroup label="export mixdown">
            <RibbonButton icon={DownloadIcon} onClick={onExportMp3} caption="mp3" label="Render the arrangement offline and download it as MP3 (192 kbps, encoded in the browser)" />
            <RibbonButton icon={DownloadIcon} onClick={onExportWav} caption="wav" label="Render the arrangement offline and download it as 16-bit WAV" />
          </RibbonGroup>
        )}

        {tab === 'view' && (
          <>
            <RibbonGroup label="appearance">
              <label className="rb-field" title="color theme — 10 dark and 10 light, remembered between sessions">
                <select
                  value={ui.theme}
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
              <label className="rb-field" title="interface size — scales the entire UI typographically (everything is rem-based)">
                <select value={uiScale} onChange={e => onSetUiScale(Number(e.target.value))}>
                  {UI_SCALES.map(s => <option key={s} value={s}>{s}%</option>)}
                </select>
                <span>ui size</span>
              </label>
            </RibbonGroup>
            <RibbonGroup label="zoom">
              <label className="rb-field rb-zoom" title="horizontal zoom of the playlist (width of one beat)">
                <input
                  type="range" min="0.5" max="8" step="0.25" value={ui.remPerBeat}
                  onChange={e => dispatch({ type: 'set-zoom', remPerBeat: Number(e.target.value) })}
                />
                <span>{ui.remPerBeat.toFixed(2)}rem/beat</span>
              </label>
            </RibbonGroup>
          </>
        )}
      </div>
    </div>
  );
};
