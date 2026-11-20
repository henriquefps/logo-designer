// The prompt for a job, by type, and the system prompt appended to Claude Code's own.
import type { AdaptInput, JobType, NextScreenInput, RequestInput, ScreenshotInput } from '@/sync/jobs';
import { adaptPrompt } from './adapt';
import { PROJECT_FILE, type PromptContext } from './common';
import { nextScreenPrompt } from './nextScreen';
import { requestPrompt } from './request';
import { screenshotPrompt } from './screenshot';

export { PROJECT_FILE, SPEC_FILE, ATTACHMENTS_DIR, quoteData, type PromptContext } from './common';

/** Rounds of `wf build --into` per job type (the `wf compare` loop of a screenshot needs the most). */
export const MAX_ROUNDS: Record<JobType, number> = { screenshot: 4, 'next-screen': 3, adapt: 3, request: 4 };

export class PromptError extends Error {}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const need = (input: Record<string, unknown>, keys: string[], type: string) => {
  const missing = keys.filter((k) => typeof input[k] !== 'string' || !(input[k] as string).trim());
  if (missing.length) throw new PromptError(`A ${type} job needs input.${missing.join(', input.')}`);
};

/** A job as the server sent it: its input is checked here, not trusted. */
export interface PromptJob {
  type: JobType;
  input: unknown;
  screenId?: string;
  frameId?: string;
}

/** The user prompt for a job; throws PromptError when its input is incomplete. */
export function renderPrompt(job: PromptJob, ctx: PromptContext): string {
  const input = obj(job.input);
  switch (job.type) {
    case 'screenshot':
      need(input, ['platform'], job.type);
      if (!ctx.attachments.length) throw new PromptError('A screenshot job needs an image attachment');
      return screenshotPrompt({ input: input as unknown as ScreenshotInput }, ctx);
    case 'next-screen':
      need(input, ['fromScreenId', 'fromNodeId', 'label', 'platform'], job.type);
      return nextScreenPrompt({ screenId: job.screenId, frameId: job.frameId, input: input as unknown as NextScreenInput }, ctx);
    case 'adapt':
      need(input, ['screenId', 'fromPlatform', 'toPlatform'], job.type);
      return adaptPrompt({ input: input as unknown as AdaptInput }, ctx);
    case 'request':
      need(input, ['text'], job.type);
      return requestPrompt({ input: input as unknown as RequestInput }, ctx);
    default:
      throw new PromptError(`Unknown job type “${String((job as { type: unknown }).type)}”`);
  }
}

/** The "## Wireframes" section of skills/designer/SKILL.md (up to the next level-2 heading). */
export function wireframesSection(skill: string): string {
  const start = skill.search(/^## Wireframes\s*$/m);
  if (start < 0) return '';
  const rest = skill.slice(start);
  const next = rest.slice(3).search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next + 3)).trim();
}

/** Appended to Claude Code's system prompt (`--append-system-prompt`). */
export function systemPrompt(skill: string): string {
  return [
    `You are the Designer AI agent, run headless by \`designer agent\` for the person who owns this project. You work on one job in the current folder: a wireframe project (${PROJECT_FILE}) that is already mirrored live to the person's Designer app (do not start \`designer live\`, it runs). The \`designer\` CLI is on PATH; use it as \`designer …\`. Nobody answers questions during the job: decide, and explain your choices in the final summary.`,
    `Your instructions for wireframes (from the designer skill):`,
    wireframesSection(skill),
  ].join('\n\n');
}
