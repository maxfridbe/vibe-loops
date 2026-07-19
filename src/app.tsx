// Application shell: loads the starter library, wires the ribbon, browser
// and playlist together with the audio engine, and owns global handlers
// (transport, keyboard, save/open, export).

import { downloadBytes, parseVibeloop, serializeProject } from './db/vibeloop';
import { AudioEngine } from './engine/audio';
import { encodeMp3, encodeWav } from './engine/mp3';
import { renderProject } from './engine/render';
import { makeInitialState, reducer } from './store';
import { applyTheme, loadTheme } from './themes';
import { Project } from './types';
import { Browser, LoopDrag } from './ui/browser';
import { Playlist } from './ui/playlist';
import { Ribbon } from './ui/ribbon';

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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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
  }, [engine]);

  React.useEffect(() => {
    applyTheme(state.ui.theme);
  }, [state.ui.theme]);

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

  // --- keyboard -------------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const st = stateRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        if (st.ui.playing) onStop(); else onPlay();
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
  }, [onPlay, onStop]);

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
        onPlay={() => onPlay()}
        onStop={onStop}
        onNew={onNew}
        onOpen={onOpen}
        onSave={onSave}
        onExportMp3={() => exportAudio('mp3')}
        onExportWav={() => exportAudio('wav')}
      />
      <div className="app-main">
        <Browser
          loops={state.project.loops}
          focusedLoopId={state.ui.focusedLoopId}
          engine={engine}
          onFocusLoop={id => dispatch({ type: 'focus-loop', loopId: id })}
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".vibeloop"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />
    </div>
  );
};
