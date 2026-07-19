import {
  Loop, Project, loopLengthTicks, secondsToTicks, ticksToSeconds,
} from '../types';
import { sampleAutoCurve } from './automation';
import { stretchChannels } from './stretch';

// A loop stretched to match a given project tempo. The stretched buffer's
// musical length is loop.beats quarter-notes at the project BPM.
const stretchKey = (loopId: number, bpm: number): string => `${loopId}@${bpm.toFixed(2)}`;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private decodeCache = new Map<number, Promise<AudioBuffer>>();
  private stretchCache = new Map<string, AudioBuffer>();
  private peaksCache = new Map<number, Float32Array>();
  private liveNodes: AudioNode[] = [];
  private liveSources: AudioBufferSourceNode[] = [];
  private auditionSource: AudioBufferSourceNode | null = null;
  private startedAtCtxTime = 0;
  private startTicks = 0;
  private playingBpm = 120;
  private endTimer: number | null = null;
  onEnded: (() => void) | null = null;

  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  ensureDecoded(loop: Loop): Promise<AudioBuffer> {
    let p = this.decodeCache.get(loop.id);
    if (!p) {
      const bytes = loop.mp3;
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      p = this.context().decodeAudioData(buf);
      this.decodeCache.set(loop.id, p);
    }
    return p;
  }

  // Waveform peaks (max abs per bucket) for clip rendering; resolved lazily.
  peaksFor(loop: Loop, onReady: () => void): Float32Array | null {
    const cached = this.peaksCache.get(loop.id);
    if (cached) return cached;
    void this.ensureDecoded(loop).then(buf => {
      const BUCKETS = 800;
      const peaks = new Float32Array(BUCKETS);
      const data = buf.getChannelData(0);
      const per = Math.max(1, Math.floor(data.length / BUCKETS));
      for (let b = 0; b < BUCKETS; b++) {
        let m = 0;
        const start = b * per;
        const end = Math.min(data.length, start + per);
        for (let i = start; i < end; i += 4) {
          const v = Math.abs(data[i]);
          if (v > m) m = v;
        }
        peaks[b] = m;
      }
      this.peaksCache.set(loop.id, peaks);
      onReady();
    });
    return null;
  }

  // Returns the loop's audio stretched so its `beats` span `beats` project
  // quarter-notes at `bpm`. Requires the loop to be decoded already.
  private stretched(loop: Loop, decoded: AudioBuffer, bpm: number): AudioBuffer {
    const key = stretchKey(loop.id, bpm);
    const hit = this.stretchCache.get(key);
    if (hit) return hit;

    const nativeDur = decoded.duration;
    const targetDur = (loop.beats * 60) / bpm;
    const tempo = nativeDur / targetDur; // >1 = speed up
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const out = stretchChannels(channels, decoded.sampleRate, tempo);
    const buf = new AudioBuffer({
      numberOfChannels: out.length,
      length: out[0].length,
      sampleRate: decoded.sampleRate,
    });
    out.forEach((ch, i) => buf.copyToChannel(ch, i));
    this.stretchCache.set(key, buf);
    return buf;
  }

  async prepareBuffers(project: Project): Promise<Map<number, AudioBuffer>> {
    const usedLoopIds = new Set(project.clips.map(c => c.loopId));
    const byId = new Map(project.loops.map(l => [l.id, l]));
    const result = new Map<number, AudioBuffer>();
    for (const id of usedLoopIds) {
      const loop = byId.get(id);
      if (!loop) continue;
      const decoded = await this.ensureDecoded(loop);
      result.set(id, this.stretched(loop, decoded, project.bpm));
    }
    return result;
  }

  async audition(loop: Loop): Promise<void> {
    const ctx = this.context();
    this.stopAudition();
    const buf = await this.ensureDecoded(loop);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(ctx.destination);
    src.start();
    this.auditionSource = src;
    src.onended = () => {
      if (this.auditionSource === src) this.auditionSource = null;
    };
  }

  stopAudition(): void {
    if (this.auditionSource) {
      try { this.auditionSource.stop(); } catch { /* already stopped */ }
      this.auditionSource = null;
    }
  }

  async play(project: Project, fromTicks: number): Promise<void> {
    const ctx = this.context();
    this.stop();
    const buffers = await this.prepareBuffers(project);
    const t0 = ctx.currentTime + 0.08;
    const { nodes, sources, endSeconds } = scheduleArrangement(ctx, ctx.destination, project, fromTicks, t0, buffers);
    this.liveNodes = nodes;
    this.liveSources = sources;
    this.startedAtCtxTime = t0;
    this.startTicks = fromTicks;
    this.playingBpm = project.bpm;
    const remaining = Math.max(0.1, endSeconds + 0.3);
    this.endTimer = window.setTimeout(() => {
      this.stop();
      this.onEnded?.();
    }, remaining * 1000);
  }

  stop(): void {
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const s of this.liveSources) {
      try { s.stop(); } catch { /* not started / already stopped */ }
    }
    for (const n of this.liveNodes) n.disconnect();
    this.liveSources = [];
    this.liveNodes = [];
  }

  playheadTicks(): number {
    if (!this.ctx) return this.startTicks;
    const elapsed = this.ctx.currentTime - this.startedAtCtxTime;
    return this.startTicks + Math.max(0, secondsToTicks(elapsed, this.playingBpm));
  }

  invalidateLoop(loopId: number): void {
    this.decodeCache.delete(loopId);
    this.peaksCache.delete(loopId);
    for (const key of Array.from(this.stretchCache.keys())) {
      if (key.startsWith(`${loopId}@`)) this.stretchCache.delete(key);
    }
  }
}

export interface ScheduleResult {
  nodes: AudioNode[];
  sources: AudioBufferSourceNode[];
  endSeconds: number; // seconds from t0 until the arrangement ends
}

// Builds the mixing graph and schedules every clip and automation curve at
// absolute context time t0 (which corresponds to playlist position
// fromTicks). Shared by realtime playback and offline rendering.
export function scheduleArrangement(
  ctx: BaseAudioContext,
  destination: AudioNode,
  project: Project,
  fromTicks: number,
  t0: number,
  buffers: Map<number, AudioBuffer>,
): ScheduleResult {
  const bpm = project.bpm;
  const toSec = (ticks: number): number => ticksToSeconds(ticks, bpm);
  const nodes: AudioNode[] = [];
  const sources: AudioBufferSourceNode[] = [];

  const masterAuto = ctx.createGain();
  const masterGain = ctx.createGain();
  masterGain.gain.value = project.masterVolume;
  masterAuto.connect(masterGain).connect(destination);
  nodes.push(masterAuto, masterGain);

  interface TrackNodes { input: GainNode; autoGain: GainNode; panner: StereoPannerNode }
  const trackNodes = new Map<number, TrackNodes>();
  for (const track of project.tracks) {
    const input = ctx.createGain();
    input.gain.value = track.muted ? 0 : track.volume;
    const autoGain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    input.connect(autoGain).connect(panner).connect(masterAuto);
    nodes.push(input, autoGain, panner);
    trackNodes.set(track.id, { input, autoGain, panner });
  }

  let endTicks = 0;

  // --- loop clips ----------------------------------------------------------
  const loopById = new Map(project.loops.map(l => [l.id, l]));
  for (const clip of project.clips) {
    endTicks = Math.max(endTicks, clip.startTicks + clip.lengthTicks);
    if (clip.muted) continue;
    const tn = trackNodes.get(clip.trackId);
    const loop = loopById.get(clip.loopId);
    const buffer = buffers.get(clip.loopId);
    if (!tn || !loop || !buffer) continue;

    const clipGain = ctx.createGain();
    clipGain.gain.value = clip.gain;
    clipGain.connect(tn.input);
    nodes.push(clipGain);

    const loopTicks = loopLengthTicks(loop);
    const clipEnd = clip.startTicks + clip.lengthTicks;
    const windowStart = Math.max(clip.startTicks, fromTicks);
    if (clipEnd <= windowStart) continue;

    // audio tiles have period loopTicks, phase-anchored at start - offset
    const anchor = clip.startTicks - clip.offsetTicks;
    let k = Math.floor((windowStart - anchor) / loopTicks);
    for (; anchor + k * loopTicks < clipEnd; k++) {
      const tileStart = anchor + k * loopTicks;
      const segStart = Math.max(tileStart, windowStart);
      const segEnd = Math.min(tileStart + loopTicks, clipEnd);
      if (segEnd <= segStart) continue;

      const bufOffset = toSec(segStart - tileStart);
      const duration = Math.min(toSec(segEnd - segStart), buffer.duration - bufOffset);
      if (duration <= 0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(clipGain);
      src.start(t0 + toSec(segStart - fromTicks), bufOffset, duration);
      sources.push(src);
    }
  }

  // --- automation ----------------------------------------------------------
  const trackById = new Map(project.tracks.map(t => [t.id, t]));
  const byTarget = new Map<string, typeof project.autoClips>();
  for (const a of project.autoClips) {
    endTicks = Math.max(endTicks, a.startTicks + a.lengthTicks);
    if (a.muted) continue;
    const key = `${a.target}:${a.target === 'master.volume' ? 0 : a.trackId}`;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(a);
  }

  for (const clips of byTarget.values()) {
    clips.sort((a, b) => a.startTicks - b.startTicks);
    let lastEnd = -Infinity;
    for (const a of clips) {
      if (a.startTicks < lastEnd) continue; // overlapping curves are skipped
      lastEnd = a.startTicks + a.lengthTicks;
      const clipEnd = a.startTicks + a.lengthTicks;
      if (clipEnd <= fromTicks) {
        // playback starts after this clip: pin its final value
        applyAutoValue(a, trackNodes, trackById, autoFinal(a), t0);
        continue;
      }
      const visStart = Math.max(a.startTicks, fromTicks);
      const posStart = (visStart - a.startTicks) / a.lengthTicks;
      const full = sampleAutoCurve(a, 256);
      const startIdx = Math.floor(posStart * (full.length - 1));
      const curve = full.subarray(startIdx).slice();
      if (curve.length < 2) continue;
      const when = t0 + toSec(visStart - fromTicks);
      const dur = toSec(clipEnd - visStart);
      applyAutoCurve(a, trackNodes, trackById, curve, when, dur);
    }
  }

  return { nodes, sources, endSeconds: toSec(Math.max(0, endTicks - fromTicks)) };

  function autoFinal(a: Project['autoClips'][number]): number {
    return a.points.length ? a.points[a.points.length - 1].value : 0;
  }

  function applyAutoValue(
    a: Project['autoClips'][number],
    tns: Map<number, TrackNodes>,
    tracks: Map<number, Project['tracks'][number]>,
    value: number,
    when: number,
  ): void {
    const param = resolveParam(a, tns);
    if (!param) return;
    param.setValueAtTime(denorm(a.target, value, tracks.get(a.trackId)), when);
  }

  function applyAutoCurve(
    a: Project['autoClips'][number],
    tns: Map<number, TrackNodes>,
    tracks: Map<number, Project['tracks'][number]>,
    curve: Float32Array,
    when: number,
    dur: number,
  ): void {
    const param = resolveParam(a, tns);
    if (!param || dur <= 0) return;
    const mapped = new Float32Array(curve.length);
    for (let i = 0; i < curve.length; i++) mapped[i] = denorm(a.target, curve[i], tracks.get(a.trackId));
    try {
      param.setValueCurveAtTime(mapped, Math.max(when, t0), dur);
    } catch { /* overlapping curve scheduling; skip */ }
  }

  function resolveParam(
    a: Project['autoClips'][number],
    tns: Map<number, TrackNodes>,
  ): AudioParam | null {
    if (a.target === 'master.volume') return masterAuto.gain;
    const tn = tns.get(a.trackId);
    if (!tn) return null;
    return a.target === 'track.volume' ? tn.autoGain.gain : tn.panner.pan;
  }

  function denorm(target: string, v: number, _track?: Project['tracks'][number]): number {
    return target === 'track.pan' ? v * 2 - 1 : v;
  }
}

