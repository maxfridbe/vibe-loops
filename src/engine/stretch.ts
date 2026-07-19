// WSOLA (waveform-similarity overlap-add) time-stretching.
// Changes duration while preserving pitch. `tempo` > 1 speeds up
// (shorter output), < 1 slows down. Written for this project; the
// algorithm itself is standard.

const SEQUENCE_MS = 50;   // analysis segment length
const OVERLAP_MS = 10;    // crossfade length between segments
const SEEK_MS = 15;       // ± search window for best alignment

export function stretchChannels(
  channels: Array<Float32Array<ArrayBufferLike>>,
  sampleRate: number,
  tempo: number,
): Array<Float32Array<ArrayBuffer>> {
  if (Math.abs(tempo - 1) < 0.004) return channels.map(c => new Float32Array(c));

  const seq = Math.round((SEQUENCE_MS / 1000) * sampleRate);
  const overlap = Math.round((OVERLAP_MS / 1000) * sampleRate);
  const seek = Math.round((SEEK_MS / 1000) * sampleRate);
  const flat = seq - 2 * overlap; // samples copied verbatim per segment

  const inputLen = channels[0].length;
  const outputLen = Math.ceil(inputLen / tempo);
  const nCh = channels.length;
  const out = channels.map(() => new Float32Array(outputLen + seq));

  // mono mixdown for the alignment search
  let mono: Float32Array;
  if (nCh === 1) {
    mono = channels[0];
  } else {
    mono = new Float32Array(inputLen);
    for (const ch of channels) for (let i = 0; i < inputLen; i++) mono[i] += ch[i] / nCh;
  }

  const hopOut = flat + overlap;          // output advance per segment
  const hopIn = hopOut * tempo;           // nominal input advance per segment

  // first segment: copy directly
  for (let c = 0; c < nCh; c++) out[c].set(channels[c].subarray(0, Math.min(seq, inputLen)), 0);

  let outPos = hopOut;
  let inNominal = hopIn;

  while (outPos + seq < outputLen + seq && inNominal + seq + seek < inputLen) {
    // previous output tail that the new segment must blend with
    const searchLo = Math.max(0, Math.round(inNominal) - seek);
    const searchHi = Math.min(inputLen - seq, Math.round(inNominal) + seek);

    // find input offset whose start best matches the previous output overlap
    let best = searchLo;
    let bestCorr = -Infinity;
    const ref = out[0]; // correlation vs channel 0 output tail is sufficient
    for (let cand = searchLo; cand <= searchHi; cand++) {
      let corr = 0;
      let energy = 1e-9;
      for (let i = 0; i < overlap; i++) {
        const a = ref[outPos + i];
        const b = mono[cand + i];
        corr += a * b;
        energy += b * b;
      }
      const score = corr / Math.sqrt(energy);
      if (score > bestCorr) {
        bestCorr = score;
        best = cand;
      }
    }

    // crossfade overlap region, then copy the rest of the segment
    for (let c = 0; c < nCh; c++) {
      const src = channels[c];
      const dst = out[c];
      for (let i = 0; i < overlap; i++) {
        const w = i / overlap;
        dst[outPos + i] = dst[outPos + i] * (1 - w) + src[best + i] * w;
      }
      const copyLen = Math.min(seq - overlap, inputLen - best - overlap);
      dst.set(src.subarray(best + overlap, best + overlap + copyLen), outPos + overlap);
    }

    outPos += hopOut;
    inNominal += hopIn;
  }

  return out.map(ch => ch.subarray(0, outputLen).slice());
}
