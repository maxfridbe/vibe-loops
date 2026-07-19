-- .vibeloop format, version 1.
-- A .vibeloop file is a SQLite database that is fully self-contained:
-- it embeds the mp3 audio of every loop it uses (loops table) alongside
-- the arrangement (tracks, clips, automation). The shipped starter library
-- is the same format with an empty-ish arrangement.
PRAGMA user_version = 1;

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE loops (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  file     TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  bpm      REAL NOT NULL,
  beats    INTEGER NOT NULL,
  key_sig  TEXT NOT NULL DEFAULT '',
  license  TEXT NOT NULL DEFAULT '',
  source   TEXT NOT NULL DEFAULT '',
  mp3      BLOB NOT NULL
);

CREATE TABLE tracks (
  id     INTEGER PRIMARY KEY,
  idx    INTEGER NOT NULL,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#5b8dd9',
  volume REAL NOT NULL DEFAULT 1.0,
  pan    REAL NOT NULL DEFAULT 0.0,
  muted  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE clips (
  id            INTEGER PRIMARY KEY,
  track_id      INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  loop_id       INTEGER NOT NULL REFERENCES loops(id),
  start_ticks   INTEGER NOT NULL,
  length_ticks  INTEGER NOT NULL,
  offset_ticks  INTEGER NOT NULL DEFAULT 0,
  gain          REAL NOT NULL DEFAULT 1.0,
  muted         INTEGER NOT NULL DEFAULT 0,
  stretch_ticks INTEGER -- NULL = loop's natural length (no stretch)
);

CREATE TABLE automation_clips (
  id           INTEGER PRIMARY KEY,
  track_id     INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  target       TEXT NOT NULL, -- 'master.volume' | 'track.volume' | 'track.pan'
  start_ticks  INTEGER NOT NULL,
  length_ticks INTEGER NOT NULL,
  muted        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE automation_points (
  clip_id INTEGER NOT NULL REFERENCES automation_clips(id) ON DELETE CASCADE,
  idx     INTEGER NOT NULL,
  pos     REAL NOT NULL,    -- 0..1 across the clip
  value   REAL NOT NULL,    -- normalized 0..1
  tension REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (clip_id, idx)
);

-- Per-clip volume envelopes (absent rows = flat envelope).
CREATE TABLE clip_envelope_points (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  idx     INTEGER NOT NULL,
  pos     REAL NOT NULL,    -- 0..1 across the clip
  value   REAL NOT NULL,    -- gain multiplier 0..1
  tension REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (clip_id, idx)
);
