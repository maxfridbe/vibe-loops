// Left-hand asset browser: the loop library grouped by category, with
// hover play/stop preview and drag-onto-playlist.

import { AudioEngine } from '../engine/audio';
import { Loop } from '../types';
import { MusicIcon, PlayIcon, StopIcon } from './icons';

export interface LoopDrag {
  loopId: number;
  x: number;
  y: number;
}

interface BrowserProps {
  loops: Loop[];
  focusedLoopId: number | null;
  auditioningLoopId: number | null;
  engine: AudioEngine;
  onFocusLoop: (loopId: number) => void;
  onToggleAudition: (loop: Loop) => void;
  onBeginDrag: (loopId: number, x: number, y: number) => void;
  onRequestRename: (loop: Loop) => void;
}

const fmtDur = (loop: Loop): string => {
  const s = (loop.beats * 60) / loop.bpm;
  return `${s.toFixed(1)}s`;
};

export const Browser = ({
  loops, focusedLoopId, auditioningLoopId, onFocusLoop, onToggleAudition, onBeginDrag, onRequestRename,
}: BrowserProps): React.ReactElement => {
  const [filter, setFilter] = React.useState('');
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const byCategory = new Map<string, Loop[]>();
  const q = filter.trim().toLowerCase();
  for (const l of loops) {
    if (q && !`${l.name} ${l.category} ${l.keySig}`.toLowerCase().includes(q)) continue;
    if (!byCategory.has(l.category)) byCategory.set(l.category, []);
    byCategory.get(l.category)!.push(l);
  }
  const categories = Array.from(byCategory.keys()).sort();

  return (
    <div className="browser">
      <div className="browser-head">
        <MusicIcon size={14} />
        <span>Library</span>
      </div>
      <input
        className="browser-search"
        placeholder="search loops…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div className="browser-list">
        {categories.map(cat => (
          <div key={cat}>
            <div
              className="browser-cat"
              onClick={() => setCollapsed({ ...collapsed, [cat]: !collapsed[cat] })}
            >
              <span className={`browser-cat-arrow${collapsed[cat] ? ' closed' : ''}`}>▾</span>
              {cat || 'uncategorized'}
              <span className="browser-cat-count">{byCategory.get(cat)!.length}</span>
            </div>
            {!collapsed[cat] && byCategory.get(cat)!.map(loop => {
              const playing = loop.id === auditioningLoopId;
              return (
                <div
                  key={loop.id}
                  className={`browser-row${loop.id === focusedLoopId ? ' focused' : ''}`}
                  title={`${loop.name} — ${loop.bpm.toFixed(0)} BPM, ${loop.beats} beats, ${fmtDur(loop)}${loop.keySig ? `, ${loop.keySig}` : ''}${loop.license ? ` (${loop.license})` : ''}. Click to focus, drag onto the playlist to place, double-click to rename.`}
                  onMouseDown={e => {
                    if (e.button !== 0) return;
                    onFocusLoop(loop.id);
                    onBeginDrag(loop.id, e.clientX, e.clientY);
                  }}
                  onDoubleClick={() => onRequestRename(loop)}
                >
                  <button
                    className={`browser-row-play${playing ? ' playing' : ''}`}
                    title={playing ? 'stop preview' : 'preview loop'}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleAudition(loop);
                    }}
                  >
                    {playing ? <StopIcon size={11} /> : <PlayIcon size={11} />}
                  </button>
                  <span className="browser-row-name">{loop.name}</span>
                  {loop.keySig && <span className="browser-row-key">{loop.keySig}</span>}
                  <span className="browser-row-bpm">{loop.bpm.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        ))}
        {categories.length === 0 && <div className="browser-empty">no loops match</div>}
      </div>
      <div className="browser-foot">drag a loop onto the playlist</div>
    </div>
  );
};
