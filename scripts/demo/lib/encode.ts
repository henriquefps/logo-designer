// webm (Playwright's recording) → MP4 (H.264, yuv420p, faststart), cutting the setup before `begin()`.
import { spawnSync } from 'node:child_process';

export interface EncodeOptions {
  input: string;
  output: string;
  /** Seconds to cut from the start (the setup part). */
  start: number;
  fps: number;
}

/** A part of the input (seconds, same clock as `start`) played `factor` times faster. */
export interface SpeedSegment {
  start: number;
  end: number;
  factor: number;
}

/**
 * The filter for a recording with sped-up parts: the kept span is cut into normal and fast pieces (trim, then
 * setpts divides the fast ones' time), joined again with concat. Times are relative to the cut `start`.
 */
export function speedFilter(segments: SpeedSegment[], start: number, fps: number): string {
  const parts: { from: number; to: number | null; factor: number }[] = [];
  let t = 0;
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const from = Math.max(t, s.start - start);
    const to = s.end - start;
    if (to <= from) continue;
    if (from > t) parts.push({ from: t, to: from, factor: 1 });
    parts.push({ from, to, factor: s.factor });
    t = to;
  }
  parts.push({ from: t, to: null, factor: 1 });
  const chains = parts.map(
    (p, i) =>
      `[0:v]trim=start=${p.from.toFixed(3)}${p.to === null ? '' : `:end=${p.to.toFixed(3)}`},setpts=(PTS-STARTPTS)${p.factor === 1 ? '' : `/${p.factor}`}[v${i}]`,
  );
  return `${chains.join(';')};${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0,fps=${fps},format=yuv420p[out]`;
}

export function encodeMp4({ input, output, start, fps, speed = [] }: EncodeOptions & { speed?: SpeedSegment[] }): void {
  const filter = speed.length ? ['-filter_complex', speedFilter(speed, start, fps), '-map', '[out]'] : ['-vf', `fps=${fps},format=yuv420p`];
  const args = [
    '-y', '-loglevel', 'error',
    '-ss', start.toFixed(2), '-i', input,
    ...filter,
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
