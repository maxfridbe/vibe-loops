// .vibeloop (SQLite) reading/writing via sql.js.
// Keep SCHEMA in sync with scripts/schema.sql (format version 1).

import {
  AutoClip, AutoPoint, AutoTarget, Clip, Loop, Project, Track,
} from '../types';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export const getSql = (): Promise<SqlJsStatic> => {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: (f: string) => `lib/${f}` });
  }
  return sqlPromise;
};

const SCHEMA = `
PRAGMA user_version = 1;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE loops (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, file TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '', bpm REAL NOT NULL, beats INTEGER NOT NULL,
  key_sig TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '', mp3 BLOB NOT NULL
);
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY, idx INTEGER NOT NULL, name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b8dd9', volume REAL NOT NULL DEFAULT 1.0,
  pan REAL NOT NULL DEFAULT 0.0, muted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE clips (
  id INTEGER PRIMARY KEY, track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  loop_id INTEGER NOT NULL REFERENCES loops(id), start_ticks INTEGER NOT NULL,
  length_ticks INTEGER NOT NULL, offset_ticks INTEGER NOT NULL DEFAULT 0,
  gain REAL NOT NULL DEFAULT 1.0, muted INTEGER NOT NULL DEFAULT 0,
  stretch_ticks INTEGER
);
CREATE TABLE automation_clips (
  id INTEGER PRIMARY KEY, track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  target TEXT NOT NULL, start_ticks INTEGER NOT NULL, length_ticks INTEGER NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE automation_points (
  clip_id INTEGER NOT NULL REFERENCES automation_clips(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, pos REAL NOT NULL, value REAL NOT NULL,
  tension REAL NOT NULL DEFAULT 0, PRIMARY KEY (clip_id, idx)
);
CREATE TABLE clip_envelope_points (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, pos REAL NOT NULL, value REAL NOT NULL,
  tension REAL NOT NULL DEFAULT 0, PRIMARY KEY (clip_id, idx)
);
`;

const rows = (db: SqlJsDatabase, sql: string): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  const stmt = db.prepare(sql);
  try {
    while (stmt.step()) out.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return out;
};

export async function parseVibeloop(bytes: Uint8Array): Promise<Project> {
  const SQL = await getSql();
  const db = new SQL.Database(bytes);
  try {
    const meta = new Map<string, string>();
    for (const r of rows(db, 'SELECT key, value FROM meta')) {
      meta.set(String(r.key), String(r.value));
    }
    if (meta.get('format') !== 'vibeloop') throw new Error('not a .vibeloop file');

    const loops: Loop[] = rows(db, 'SELECT * FROM loops ORDER BY id').map(r => ({
      id: Number(r.id),
      name: String(r.name),
      file: String(r.file),
      category: String(r.category),
      bpm: Number(r.bpm),
      beats: Number(r.beats),
      keySig: String(r.key_sig),
      license: String(r.license),
      source: String(r.source),
      mp3: r.mp3 as Uint8Array,
    }));

    const tracks: Track[] = rows(db, 'SELECT * FROM tracks ORDER BY idx').map(r => ({
      id: Number(r.id),
      idx: Number(r.idx),
      name: String(r.name),
      color: String(r.color),
      volume: Number(r.volume),
      pan: Number(r.pan),
      muted: Boolean(Number(r.muted)),
    }));

    // per-clip envelopes: table absent in v1 files, so probe first
    const hasEnvTable = rows(db,
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='clip_envelope_points'",
    )[0]?.n;
    const envByClip = new Map<number, AutoPoint[]>();
    if (Number(hasEnvTable) > 0) {
      for (const r of rows(db, 'SELECT * FROM clip_envelope_points ORDER BY clip_id, idx')) {
        const cid = Number(r.clip_id);
        if (!envByClip.has(cid)) envByClip.set(cid, []);
        envByClip.get(cid)!.push({
          pos: Number(r.pos),
          value: Number(r.value),
          tension: Number(r.tension),
        });
      }
    }

    const clips: Clip[] = rows(db, 'SELECT * FROM clips ORDER BY id').map(r => ({
      id: Number(r.id),
      trackId: Number(r.track_id),
      loopId: Number(r.loop_id),
      startTicks: Number(r.start_ticks),
      lengthTicks: Number(r.length_ticks),
      offsetTicks: Number(r.offset_ticks),
      gain: Number(r.gain),
      muted: Boolean(Number(r.muted)),
      envelope: envByClip.get(Number(r.id)),
      stretchTicks: r.stretch_ticks == null ? undefined : Number(r.stretch_ticks),
    }));

    const pointsByClip = new Map<number, AutoPoint[]>();
    for (const r of rows(db, 'SELECT * FROM automation_points ORDER BY clip_id, idx')) {
      const cid = Number(r.clip_id);
      if (!pointsByClip.has(cid)) pointsByClip.set(cid, []);
      pointsByClip.get(cid)!.push({
        pos: Number(r.pos),
        value: Number(r.value),
        tension: Number(r.tension),
      });
    }
    const autoClips: AutoClip[] = rows(db, 'SELECT * FROM automation_clips ORDER BY id').map(r => ({
      id: Number(r.id),
      trackId: Number(r.track_id),
      target: String(r.target) as AutoTarget,
      startTicks: Number(r.start_ticks),
      lengthTicks: Number(r.length_ticks),
      muted: Boolean(Number(r.muted)),
      points: pointsByClip.get(Number(r.id)) ?? [
        { pos: 0, value: 0.8, tension: 0 },
        { pos: 1, value: 0.8, tension: 0 },
      ],
    }));

    return {
      name: meta.get('name') ?? 'untitled',
      bpm: Number(meta.get('bpm') ?? 120),
      masterVolume: Number(meta.get('master_volume') ?? 1),
      loops,
      tracks,
      clips,
      autoClips,
    };
  } finally {
    db.close();
  }
}

export async function serializeProject(p: Project): Promise<Uint8Array> {
  const SQL = await getSql();
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);
    const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    const metaRows: Array<[string, string]> = [
      ['format', 'vibeloop'],
      ['version', '2'], // v2 adds clip_envelope_points; v1 files remain readable
      ['name', p.name],
      ['bpm', String(p.bpm)],
      ['ppq', '96'],
      ['master_volume', String(p.masterVolume)],
    ];
    for (const kv of metaRows) meta.run(kv);
    meta.free();

    const loopStmt = db.prepare(
      'INSERT INTO loops (id, name, file, category, bpm, beats, key_sig, license, source, mp3) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    for (const l of p.loops) {
      loopStmt.run([l.id, l.name, l.file, l.category, l.bpm, l.beats, l.keySig, l.license, l.source, l.mp3]);
    }
    loopStmt.free();

    const trackStmt = db.prepare(
      'INSERT INTO tracks (id, idx, name, color, volume, pan, muted) VALUES (?,?,?,?,?,?,?)',
    );
    for (const t of p.tracks) {
      trackStmt.run([t.id, t.idx, t.name, t.color, t.volume, t.pan, t.muted ? 1 : 0]);
    }
    trackStmt.free();

    const clipStmt = db.prepare(
      'INSERT INTO clips (id, track_id, loop_id, start_ticks, length_ticks, offset_ticks, gain, muted, stretch_ticks) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    const envStmt = db.prepare(
      'INSERT INTO clip_envelope_points (clip_id, idx, pos, value, tension) VALUES (?,?,?,?,?)',
    );
    for (const c of p.clips) {
      clipStmt.run([c.id, c.trackId, c.loopId, c.startTicks, c.lengthTicks, c.offsetTicks, c.gain, c.muted ? 1 : 0, c.stretchTicks ?? null]);
      c.envelope?.forEach((pt, i) => envStmt.run([c.id, i, pt.pos, pt.value, pt.tension]));
    }
    clipStmt.free();
    envStmt.free();

    const autoStmt = db.prepare(
      'INSERT INTO automation_clips (id, track_id, target, start_ticks, length_ticks, muted) VALUES (?,?,?,?,?,?)',
    );
    const pointStmt = db.prepare(
      'INSERT INTO automation_points (clip_id, idx, pos, value, tension) VALUES (?,?,?,?,?)',
    );
    for (const a of p.autoClips) {
      autoStmt.run([a.id, a.trackId, a.target, a.startTicks, a.lengthTicks, a.muted ? 1 : 0]);
      a.points.forEach((pt, i) => pointStmt.run([a.id, i, pt.pos, pt.value, pt.tension]));
    }
    autoStmt.free();
    pointStmt.free();

    return db.export();
  } finally {
    db.close();
  }
}

export const downloadBytes = (bytes: Uint8Array, filename: string, mime: string): void => {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
