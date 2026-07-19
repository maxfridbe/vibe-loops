// Dialogs for adding loops to the library: a trim dialog (waveform with
// draggable in/out handles, name/category/beats, preview) shared by file
// imports, MIDI renders and mic recordings — plus the recording dialog.

import { AudioEngine } from '../engine/audio';
import { MicIcon, PlayIcon, StopIcon } from './icons';

export interface TrimResult {
  name: string;
  category: string;
  beats: number;
  startSec: number;
  endSec: number;
}

interface TrimDialogProps {
  buffer: AudioBuffer;
  defaultName: string;
  projectBpm: number;
  categories: string[];
  engine: AudioEngine;
  onCancel: () => void;
  onConfirm: (r: TrimResult) => void;
}

export const TrimDialog = ({
  buffer, defaultName, projectBpm, categories, engine, onCancel, onConfirm,
}: TrimDialogProps): React.ReactElement => {
  const [name, setName] = React.useState(defaultName);
  const [category, setCategory] = React.useState('imported');
  const [range, setRange] = React.useState<[number, number]>([0, buffer.duration]);
  const [beats, setBeats] = React.useState(() =>
    Math.min(64, Math.max(1, Math.round((buffer.duration * projectBpm) / 60))));
  const [previewing, setPreviewing] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const waveRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<'start' | 'end' | null>(null);
  const previewSrc = React.useRef<AudioBufferSourceNode | null>(null);

  const dur = Math.max(0.05, range[1] - range[0]);
  const loopBpm = (beats * 60) / dur;

  // waveform + trim shading
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const data = buffer.getChannelData(0);
    const styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles.getPropertyValue('--accent').trim() || '#5b8dd9';
    const per = Math.max(1, Math.floor(data.length / w));
    for (let x = 0; x < w; x++) {
      let m = 0;
      const s = x * per;
      const e = Math.min(data.length, s + per);
      for (let i = s; i < e; i += 4) {
        const v = Math.abs(data[i]);
        if (v > m) m = v;
      }
      const bh = Math.max(1, m * (h - 4));
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
    // shade outside the trim range
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const x0 = (range[0] / buffer.duration) * w;
    const x1 = (range[1] / buffer.duration) * w;
    ctx.fillRect(0, 0, x0, h);
    ctx.fillRect(x1, 0, w - x1, h);
  }, [buffer, range]);

  const posFromEvent = (e: MouseEvent | React.MouseEvent): number => {
    const r = waveRef.current!.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return frac * buffer.duration;
  };

  React.useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!dragRef.current) return;
      const p = posFromEvent(e);
      setRange(([s, en]) => dragRef.current === 'start'
        ? [Math.min(p, en - 0.05), en]
        : [s, Math.max(p, s + 0.05)]);
    };
    const onUp = (): void => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [buffer]);

  const stopPreview = (): void => {
    if (previewSrc.current) {
      try { previewSrc.current.stop(); } catch { /* stopped */ }
      previewSrc.current = null;
    }
    setPreviewing(false);
  };

  const togglePreview = (): void => {
    if (previewing) { stopPreview(); return; }
    const ctx = engine.context();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0, range[0], dur);
    src.onended = () => { if (previewSrc.current === src) stopPreview(); };
    previewSrc.current = src;
    setPreviewing(true);
  };

  React.useEffect(() => stopPreview, []);

  return (
    <div className="vl-modal-backdrop" onMouseDown={() => { stopPreview(); onCancel(); }}>
      <div className="vl-modal vl-modal-wide" onMouseDown={e => e.stopPropagation()}>
        <div className="vl-modal-title">Add loop to library</div>

        <div className="trim-wave" ref={waveRef}>
          <canvas ref={canvasRef} width={640} height={110} />
          <div
            className="trim-handle"
            style={{ left: `${(range[0] / buffer.duration) * 100}%` }}
            title="drag to trim the start"
            onPointerDown={e => { e.preventDefault(); dragRef.current = 'start'; }}
          />
          <div
            className="trim-handle end"
            style={{ left: `${(range[1] / buffer.duration) * 100}%` }}
            title="drag to trim the end"
            onPointerDown={e => { e.preventDefault(); dragRef.current = 'end'; }}
          />
        </div>

        <div className="trim-row">
          <button className="trim-preview" onClick={togglePreview} title="preview the trimmed region">
            {previewing ? <StopIcon size={12} /> : <PlayIcon size={12} />}
            <span>{previewing ? 'stop' : 'preview'}</span>
          </button>
          <span className="trim-info">
            {range[0].toFixed(2)}s – {range[1].toFixed(2)}s ({dur.toFixed(2)}s) → {loopBpm.toFixed(1)} BPM at
          </span>
          <label className="trim-field">
            <input
              type="number" min="1" max="64" value={beats}
              onChange={e => setBeats(Math.min(64, Math.max(1, Number(e.target.value) || 1)))}
            />
            <span>beats</span>
          </label>
        </div>

        <div className="trim-row">
          <label className="trim-field grow">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="loop name" />
            <span>name</span>
          </label>
          <label className="trim-field">
            <input value={category} onChange={e => setCategory(e.target.value)} list="vl-categories" placeholder="category" />
            <span>category</span>
          </label>
          <datalist id="vl-categories">
            {Array.from(new Set(categories)).map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="vl-modal-buttons">
          <button onClick={() => { stopPreview(); onCancel(); }}>cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              stopPreview();
              onConfirm({ name: name.trim(), category: category.trim() || 'imported', beats, startSec: range[0], endSec: range[1] });
            }}
          >add to library</button>
        </div>
      </div>
    </div>
  );
};

interface RecordDialogProps {
  onCancel: () => void;
  onCaptured: (buffer: AudioBuffer) => void;
  engine: AudioEngine;
}

export const RecordDialog = ({ onCancel, onCaptured, engine }: RecordDialogProps): React.ReactElement => {
  const [error, setError] = React.useState<string | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    let timer = 0;
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        const rec = new MediaRecorder(stream);
        recRef.current = rec;
        const chunks: Blob[] = [];
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          void new Blob(chunks).arrayBuffer()
            .then(buf => engine.context().decodeAudioData(buf))
            .then(onCaptured)
            .catch(err => setError(`could not decode recording: ${String(err)}`));
        };
        rec.start();
        setRecording(true);
        const startedAt = performance.now();
        timer = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 100);
      })
      .catch(err => setError(`microphone unavailable: ${String(err)}`));
    return () => {
      clearInterval(timer);
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="vl-modal-backdrop" onMouseDown={onCancel}>
      <div className="vl-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="vl-modal-title">Record from microphone</div>
        {error ? (
          <div className="record-error">{error}</div>
        ) : (
          <div className="record-body">
            <span className={`record-dot${recording ? ' live' : ''}`}><MicIcon size={16} /></span>
            <span className="record-time">{elapsed.toFixed(1)}s</span>
            <span className="record-hint">{recording ? 'recording… stop when your loop is done' : 'requesting microphone…'}</span>
          </div>
        )}
        <div className="vl-modal-buttons">
          <button onClick={onCancel}>cancel</button>
          <button
            className="primary"
            disabled={!recording}
            onClick={() => recRef.current?.stop()}
          >stop &amp; trim</button>
        </div>
      </div>
    </div>
  );
};
