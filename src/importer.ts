// Library import support: decoding audio files, parsing + rendering MIDI
// with a small built-in synthesizer, and trimming buffers before they are
// encoded (lamejs) into library loops.

export interface MidiNote {
  time: number;     // seconds
  duration: number; // seconds
  midi: number;     // note number
  velocity: number; // 0..1
}

// Minimal Standard MIDI File parser: formats 0/1, PPQ division, note on/off
// and set-tempo events. Anything else is skipped.
export function parseMidi(bytes: Uint8Array): MidiNote[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const str = (n: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[pos + i]);
    pos += n;
    return s;
  };
  const u32 = (): number => { const v = view.getUint32(pos); pos += 4; return v; };
  const u16 = (): number => { const v = view.getUint16(pos); pos += 2; return v; };
  const u8 = (): number => bytes[pos++];
  const varint = (): number => {
    let v = 0;
    for (;;) {
      const b = u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
  };

  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const headerLen = u32();
  u16(); // format
  const ntrks = u16();
  const division = u16();
  pos += headerLen - 6;
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI is not supported');

  interface RawNote { tick: number; endTick: number; midi: number; velocity: number }
  const notes: RawNote[] = [];
  const tempi: Array<{ tick: number; usPerQn: number }> = [];

  for (let t = 0; t < ntrks; t++) {
    if (str(4) !== 'MTrk') break;
    const len = u32();
    const end = pos + len;
    let tick = 0;
    let running = 0;
    const open = new Map<number, RawNote>(); // key: channel<<8 | note
    while (pos < end) {
      tick += varint();
      let status = u8();
      if (status < 0x80) { // running status
        pos--;
        status = running;
      } else if (status < 0xf0) {
        running = status;
      }
      const type = status & 0xf0;
      const ch = status & 0x0f;
      if (type === 0x90 || type === 0x80) {
        const note = u8();
        const vel = u8();
        const key = (ch << 8) | note;
        if (type === 0x90 && vel > 0) {
          const n: RawNote = { tick, endTick: -1, midi: note, velocity: vel / 127 };
          open.set(key, n);
          notes.push(n);
        } else {
          const n = open.get(key);
          if (n) { n.endTick = tick; open.delete(key); }
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        pos += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1;
      } else if (status === 0xff) {
        const metaType = u8();
        const metaLen = varint();
        if (metaType === 0x51 && metaLen === 3) {
          tempi.push({ tick, usPerQn: (u8() << 16) | (u8() << 8) | u8() });
        } else {
          pos += metaLen;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        pos += varint();
      } else {
        break; // unknown; abandon this track
      }
      // close any notes left hanging at track end
    }
    for (const n of open.values()) n.endTick = tick;
    pos = end;
  }

  // single-tempo conversion (first tempo event, else 120 BPM)
  const usPerQn = tempi.length ? tempi[0].usPerQn : 500000;
  const secPerTick = usPerQn / 1e6 / division;
  return notes
    .filter(n => n.endTick > n.tick)
    .map(n => ({
      time: n.tick * secPerTick,
      duration: (n.endTick - n.tick) * secPerTick,
      midi: n.midi,
      velocity: n.velocity,
    }))
    .sort((a, b) => a.time - b.time);
}

// Renders parsed MIDI notes with a small subtractive synth (two detuned
// triangle oscillators through a lowpass) into a stereo buffer.
export async function renderMidi(notes: MidiNote[], maxSeconds = 20): Promise<AudioBuffer> {
  if (notes.length === 0) throw new Error('MIDI file contains no notes');
  const endSec = Math.min(maxSeconds, Math.max(...notes.map(n => n.time + n.duration)) + 0.3);
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(endSec * rate), rate);
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 5000;
  master.connect(filter).connect(ctx.destination);

  for (const n of notes) {
    if (n.time >= maxSeconds) continue;
    const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
    const g = ctx.createGain();
    const attack = 0.005;
    const release = 0.08;
    const t0 = n.time;
    const t1 = n.time + Math.max(0.03, n.duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.28 * n.velocity, t0 + attack);
    g.gain.setValueAtTime(0.28 * n.velocity, Math.max(t0 + attack, t1 - 0.01));
    g.gain.linearRampToValueAtTime(0, t1 + release);
    g.connect(master);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(g);
      osc.start(t0);
      osc.stop(t1 + release + 0.01);
    }
  }
  return ctx.startRendering();
}

// Copies [startSec, endSec) of a buffer into a new one.
export function sliceBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const rate = buffer.sampleRate;
  const s = Math.max(0, Math.floor(startSec * rate));
  const e = Math.min(buffer.length, Math.ceil(endSec * rate));
  const len = Math.max(1, e - s);
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: rate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(s, e), c);
  }
  return out;
}
