import { AutoClip, AutoPoint } from '../types';

// Value of an automation clip at pos (0..1). Segments interpolate between
// consecutive points; `tension` on the leading point bends the segment
// (0 = linear, >0 eases toward the end, <0 eases away).
export function autoValueAt(points: AutoPoint[], pos: number): number {
  if (points.length === 0) return 0;
  if (pos <= points[0].pos) return points[0].value;
  const last = points[points.length - 1];
  if (pos >= last.pos) return last.value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const span = b.pos - a.pos;
      const t = span <= 0 ? 0 : (pos - a.pos) / span;
      const shaped = shape(t, a.tension);
      return a.value + (b.value - a.value) * shaped;
    }
  }
  return last.value;
}

const shape = (t: number, tension: number): number => {
  if (tension === 0) return t;
  // exponent in (1/8 .. 8): tension  1 -> fast start, -1 -> slow start
  const k = Math.pow(8, -tension);
  return Math.pow(t, k);
};

// Samples a point curve into a Float32Array suitable for
// AudioParam.setValueCurveAtTime.
export function samplePointCurve(points: AutoPoint[], samples: number): Float32Array {
  const out = new Float32Array(Math.max(2, samples));
  for (let i = 0; i < out.length; i++) {
    out[i] = autoValueAt(points, i / (out.length - 1));
  }
  return out;
}

export const sampleAutoCurve = (clip: AutoClip, samples: number): Float32Array =>
  samplePointCurve(clip.points, samples);

// Maps a normalized automation value (0..1) onto the actual parameter range.
export const denormalize = (target: string, v: number): number =>
  target === 'track.pan' ? v * 2 - 1 : v;
