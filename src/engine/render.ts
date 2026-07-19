import { Project, arrangementEndTicks, ticksToSeconds } from '../types';
import { AudioEngine, scheduleArrangement } from './audio';

// Renders the whole arrangement offline (faster than realtime) into a
// stereo AudioBuffer at 44.1 kHz.
export async function renderProject(engine: AudioEngine, project: Project): Promise<AudioBuffer> {
  const endTicks = arrangementEndTicks(project);
  if (endTicks <= 0) throw new Error('nothing to render: the playlist is empty');
  const buffers = await engine.prepareBuffers(project);
  const sampleRate = 44100;
  const tail = 0.6; // let reverb-less tails/fades breathe
  const seconds = ticksToSeconds(endTicks, project.bpm) + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  scheduleArrangement(ctx, ctx.destination, project, 0, 0, buffers);
  return ctx.startRendering();
}
