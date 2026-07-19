// Application shell: loads the starter library, wires the ribbon, browser
// and playlist together with the audio engine, and owns global handlers
// (transport, keyboard, save/open, export).

import { downloadBytes, parseVibeloop, serializeProject } from './db/vibeloop';
import { AudioEngine } from './engine/audio';
import { encodeMp3, encodeWav } from './engine/mp3';
import { renderProject } from './engine/render';
import { parseMidi, renderMidi, sliceBuffer } from './importer';
import { makeInitialState, reducer } from './store';
import { applyTheme, applyUiScale, loadTheme, loadUiScale } from './themes';
import { Loop, Project } from './types';
import { Browser, LoopDrag } from './ui/browser';
import { RecordDialog, TrimDialog, TrimResult } from './ui/importDialog';
import { Playlist } from './ui/playlist';
import { Ribbon } from './ui/ribbon';

type ImportState =
  | { kind: 'record' }
  | { kind: 'trim'; buffer: AudioBuffer; defaultName: string; source: string };

const fetchLibrary = async (): Promise<Project> => {
  const res = await fetch('library.vibeloop');
  if (!res.ok) throw new Error(`failed to fetch library: HTTP ${res.status}`);
  return parseVibeloop(new Uint8Array(await res.arrayBuffer()));
};

export const App = (): React.ReactElement => {
  const [loading, setLoading] = React.useState<string | null>('loading starter library…');
  const [state, dispatch] = React.useReducer(reducer, null, () => makeInitialState({
    name: 'untitled', bpm: 120, masterVolume: 1, loops: [], tracks: [], clips: [], autoClips: [],
  }, loadTheme()));
  const engineRef = React.useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [playheadTicks, setPlayheadTicks] = React.useState(0);
  const [dragLoop, setDragLoop] = React.useState<LoopDrag | null>(null);
  const [uiScale, setUiScale] = React.useState(loadUiScale);
  const [auditioningLoopId, setAuditioningLoopId] = React.useState<number | null>(null);
  const [importState, setImportState] = React.useState<ImportState | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  // keep latest state reachable from stable callbacks
  const stateRef = React.useRef(state);
  stateRef.current = state;

  React.useEffect(() => {
    fetchLibrary()
      .then(project => {
        dispatch({ type: 'load-project', project });
        setLoading(null);
      })
      .catch(err => setLoading(`could not load library: ${String(err)}`));
  }, []);

  React.useEffect(() => {
    engine.onEnded = () => dispatch({ type: 'set-playing', playing: false });
    engine.onAuditionChange = setAuditioningLoopId;
  }, [engine]);

  React.useEffect(() => {
    applyTheme(state.ui.theme);
  }, [state.ui.theme]);

  React.useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);

  const status = (s: string): void => dispatch({ type: 'set-status', status: s });

  const onPlay = React.useCallback((fromTicks?: number) => {
    const st = stateRef.current;
    const from = fromTicks ?? playheadTicks;
    dispatch({ type: 'set-playing', playing: true });
    status('playing');
    void engine.play(st.project, from).catch(err => {
      status(`playback failed: ${String(err)}`);
      dispatch({ type: 'set-playing', playing: false });
    });
  }, [engine, playheadTicks]);

  const onStop = React.useCallback(() => {
    setPlayheadTicks(engine.playheadTicks());
    engine.stop();
    dispatch({ type: 'set-playing', playing: false });
    status('stopped');
  }, [engine]);

  const onSeek = React.useCallback((ticks: number) => {
    setPlayheadTicks(ticks);
    if (stateRef.current.ui.playing) onPlay(ticks);
  }, [onPlay]);

  const onPlayFromStart = React.useCallback(() => {
    setPlayheadTicks(0);
    onPlay(0);
  }, [onPlay]);

  const onToggleAudition = React.useCallback((loop: Loop) => {
    if (engine.currentAuditionLoopId() === loop.id) {
      engine.stopAudition();
    } else {
      void engine.audition(loop, 0.9 * stateRef.current.project.masterVolume);
    }
  }, [engine]);

  // --- keyboard -------------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const st = stateRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          onPlayFromStart();
        } else if (st.ui.playing) {
          onStop();
        } else {
          onPlay();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection, autoSelection } = st.ui;
        if (selection.length || autoSelection.length) {
          dispatch({
            type: 'edit',
            clips: st.project.clips.filter(c => !selection.includes(c.id)),
            autoClips: st.project.autoClips.filter(c => !autoSelection.includes(c.id)),
          });
          dispatch({ type: 'set-selection', clipIds: [], autoClipIds: [] });
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = ({ p: 'draw', b: 'paint', c: 'slice', t: 'mute', e: 'select' } as const)[e.key.toLowerCase()];
        if (tool) dispatch({ type: 'set-tool', tool });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay, onStop, onPlayFromStart]);

  // --- ghost for browser drag ----------------------------------------------
  React.useEffect(() => {
    if (!dragLoop) return;
    const onMove = (e: MouseEvent): void =>
      setDragLoop(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [dragLoop !== null]);

  // --- project I/O ----------------------------------------------------------
  const onNew = (): void => {
    if (!confirm('start a new project from the starter library? unsaved changes are lost.')) return;
    onStop();
    setLoading('loading starter library…');
    fetchLibrary()
      .then(project => {
        dispatch({ type: 'load-project', project });
        setPlayheadTicks(0);
        setLoading(null);
      })
      .catch(err => setLoading(`could not load library: ${String(err)}`));
  };

  const onOpen = (): void => fileInputRef.current?.click();

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onStop();
    status(`opening ${file.name}…`);
    void file.arrayBuffer()
      .then(buf => parseVibeloop(new Uint8Array(buf)))
      .then(project => {
        dispatch({ type: 'load-project', project });
        setPlayheadTicks(0);
        status(`opened ${file.name}`);
      })
      .catch(err => status(`open failed: ${String(err)}`));
  };

  const onSave = (): void => {
    const st = stateRef.current;
    status('saving…');
    void serializeProject(st.project)
      .then(bytes => {
        downloadBytes(bytes, `${st.project.name || 'untitled'}.vibeloop`, 'application/x-sqlite3');
        status('saved');
      })
      .catch(err => status(`save failed: ${String(err)}`));
  };

  // --- library import / recording ------------------------------------------
  const onImport = (): void => importInputRef.current?.click();

  const onImportFileChosen = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const isMidi = /\.midi?$/i.test(file.name);
    status(`importing ${file.name}…`);
    void file.arrayBuffer()
      .then(async buf => {
        if (isMidi) {
          const notes = parseMidi(new Uint8Array(buf));
          return renderMidi(notes);
        }
        return engine.context().decodeAudioData(buf);
      })
      .then(buffer => {
        if (buffer.duration < 0.1) throw new Error('file is too short');
        setImportState({ kind: 'trim', buffer, defaultName: base, source: isMidi ? 'midi import' : 'file import' });
        status('trim the loop, then add it');
      })
      .catch(err => status(`import failed: ${String(err)}`));
  };

  const onTrimConfirmed = (r: TrimResult): void => {
    const st = stateRef.current;
    if (importState?.kind !== 'trim') return;
    try {
      const sliced = sliceBuffer(importState.buffer, r.startSec, r.endSec);
      const mp3 = encodeMp3(sliced);
      const dur = sliced.duration;
      const loop: Loop = {
        id: st.nextId,
        name: r.name,
        file: `${r.name.replace(/[^\w-]+/g, '_')}.mp3`,
        category: r.category,
        bpm: (r.beats * 60) / dur,
        beats: r.beats,
        keySig: '',
        license: '',
        source: importState.source,
        mp3,
      };
      dispatch({ type: 'add-loop', loop });
      setImportState(null);
    } catch (err) {
      status(`could not add loop: ${String(err)}`);
    }
  };

  const exportAudio = (format: 'mp3' | 'wav'): void => {
    const st = stateRef.current;
    status(`rendering ${format}…`);
    void renderProject(engine, st.project)
      .then(buffer => {
        status(`encoding ${format}…`);
        // yield a frame so the status paints before the encode busy-loop
        return new Promise<void>(r => setTimeout(r, 30)).then(() => {
          const bytes = format === 'mp3' ? encodeMp3(buffer) : encodeWav(buffer);
          const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
          downloadBytes(bytes, `${st.project.name || 'untitled'}.${format}`, mime);
          status(`exported ${format}`);
        });
      })
      .catch(err => status(`export failed: ${String(err)}`));
  };

  if (loading !== null) {
    return <div className="app-loading">{loading}</div>;
  }

  return (
    <div className="app">
      <Ribbon
        state={state}
        dispatch={dispatch}
        playheadTicks={playheadTicks}
        uiScale={uiScale}
        onSetUiScale={setUiScale}
        onPlay={() => onPlay()}
        onPlayFromStart={onPlayFromStart}
        onStop={onStop}
        onNew={onNew}
        onOpen={onOpen}
        onSave={onSave}
        onImport={onImport}
        onRecord={() => setImportState({ kind: 'record' })}
        onExportMp3={() => exportAudio('mp3')}
        onExportWav={() => exportAudio('wav')}
      />
      <div className="app-main">
        <Browser
          loops={state.project.loops}
          focusedLoopId={state.ui.focusedLoopId}
          auditioningLoopId={auditioningLoopId}
          engine={engine}
          onFocusLoop={id => dispatch({ type: 'focus-loop', loopId: id })}
          onToggleAudition={onToggleAudition}
          onBeginDrag={(loopId, x, y) => setDragLoop({ loopId, x, y })}
        />
        <Playlist
          state={state}
          dispatch={dispatch}
          engine={engine}
          playheadTicks={playheadTicks}
          onSeek={onSeek}
          dragLoop={dragLoop}
          onDragConsumed={() => setDragLoop(null)}
        />
      </div>
      {dragLoop && (
        <div className="drag-ghost" style={{ left: `calc(${dragLoop.x}px + 0.5rem)`, top: `calc(${dragLoop.y}px + 0.5rem)` }}>
          {state.project.loops.find(l => l.id === dragLoop.loopId)?.name}
        </div>
      )}
      {importState?.kind === 'record' && (
        <RecordDialog
          engine={engine}
          onCancel={() => setImportState(null)}
          onCaptured={buffer => setImportState({ kind: 'trim', buffer, defaultName: 'recording', source: 'microphone' })}
        />
      )}
      {importState?.kind === 'trim' && (
        <TrimDialog
          buffer={importState.buffer}
          defaultName={importState.defaultName}
          projectBpm={state.project.bpm}
          categories={state.project.loops.map(l => l.category)}
          engine={engine}
          onCancel={() => setImportState(null)}
          onConfirm={onTrimConfirmed}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".vibeloop"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".mp3,.wav,.mid,.midi,audio/mpeg,audio/wav"
        style={{ display: 'none' }}
        onChange={onImportFileChosen}
      />
    </div>
  );
};
