// webm (Playwright's recording) → MP4 (H.264, yuv420p, faststart), cutting the setup before `begin()`.
import { spawnSync } from 'node:child_process';

export interface EncodeOptions {
  input: string;
  output: string;
  /** Seconds to cut from the start (the setup part). */
  start: number;
  fps: number;
}

export function encodeMp4({ input, output, start, fps }: EncodeOptions): void {
  const args = [
    '-y', '-loglevel', 'error',
    '-ss', start.toFixed(2), '-i', input,
    '-vf', `fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'animation',
    '-movflags', '+faststart', '-an',
    output,
  ];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}) for ${output}`);
}

/** Length of a media file in seconds (ffprobe). */
export function duration(file: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}
