// MP3 (lamejs, vendored in lib/lame.min.js) and WAV encoding of a rendered
// AudioBuffer.

const toInt16 = (ch: Float32Array): Int16Array => {
  const out = new Int16Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const v = Math.max(-1, Math.min(1, ch[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
};

export function encodeMp3(buffer: AudioBuffer, kbps = 192): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels);
  const left = toInt16(buffer.getChannelData(0));
  const right = channels > 1 ? toInt16(buffer.getChannelData(1)) : left;
  const encoder = new lamejs.Mp3Encoder(2, buffer.sampleRate, kbps);

  const BLOCK = 1152;
  const parts: Int8Array[] = [];
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const r = right.subarray(i, i + BLOCK);
    const enc = encoder.encodeBuffer(l, r);
    if (enc.length > 0) parts.push(enc);
  }
  const last = encoder.flush();
  if (last.length > 0) parts.push(last);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.length), off);
    off += p.length;
  }
  return out;
}

export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Uint8Array(out);
}
