// Claude Code's stream → short progress lines for the app's job panel (docs/wireframe-mode.md → Phase 4 → The
// bridge, step 4). Only what the agent is doing, in a few words: never tool output, file contents or full commands.
import { basename } from 'node:path';
import type { StreamEvent } from './claude';

export interface ProgressLine {
  message: string;
  stage: 'start' | 'thinking' | 'reading' | 'building' | 'checking' | 'writing' | 'refused';
}

const MAX = 140;

const clip = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > MAX ? `${one.slice(0, MAX - 1)}…` : one;
};

/** The first sentence of the agent's text (it announces each step in one sentence; see the prompts' rules). */
function firstSentence(text: string): string {
  const line = text.trim().split('\n').find((l) => l.trim()) ?? '';
  const plain = line.replace(/[`*_#>]/g, '').trim();
  const m = /^(.+?[.!?:])(\s|$)/.exec(plain);
  return clip((m ? m[1] : plain).replace(/:$/, ''));
}

const blocks = (e: StreamEvent): Record<string, unknown>[] => {
  const c = e.message?.content;
  return Array.isArray(c) ? (c.filter((b) => b && typeof b === 'object') as Record<string, unknown>[]) : [];
};

/** Stateful (it counts the build rounds); one per job. */
export class ProgressMapper {
  private rounds = 0;
  private last = '';

  get buildRounds() {
    return this.rounds;
  }

  /** The lines an event adds (usually zero or one); a line equal to the previous one is dropped. */
  feed(e: StreamEvent): ProgressLine[] {
    const out: ProgressLine[] = [];
    const push = (message: string, stage: ProgressLine['stage']) => {
      if (!message || message === this.last) return;
      this.last = message;
      out.push({ message, stage });
    };
    if (e.type === 'system' && e.subtype === 'init') push('Claude Code started', 'start');
    if (e.type === 'assistant') {
      for (const b of blocks(e)) {
        if (b.type === 'text' && typeof b.text === 'string') push(firstSentence(b.text), 'thinking');
        if (b.type === 'tool_use') {
          const l = this.tool(String(b.name ?? ''), (b.input ?? {}) as Record<string, unknown>);
          if (l) push(l.message, l.stage);
        }
      }
    }
    if (e.type === 'user') {
      for (const b of blocks(e)) {
        if (b.type !== 'tool_result' || b.is_error !== true) continue;
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
        if (/permission|denied|not allowed|outside/i.test(text)) push('A command the agent is not allowed to run was refused', 'refused');
      }
    }
    return out;
  }

  private tool(name: string, input: Record<string, unknown>): ProgressLine | null {
    const file = typeof input.file_path === 'string' ? basename(input.file_path) : '';
    if (name === 'Bash') return this.command(typeof input.command === 'string' ? input.command : '');
    if (name === 'Read') {
      if (/(^|\/)attachments\//.test(String(input.file_path ?? ''))) return { message: 'Reading the screenshot', stage: 'reading' };
      if (/\.(png|jpe?g|webp)$/i.test(file)) return { message: `Looking at ${clip(file)}`, stage: 'checking' };
      return { message: `Reading ${clip(file || 'a file')}`, stage: 'reading' };
    }
    if (name === 'Write' || name === 'Edit') {
      if (/spec.*\.json$/i.test(file)) return { message: name === 'Write' ? 'Writing the spec' : 'Editing the spec', stage: 'writing' };
      return { message: `${name === 'Write' ? 'Writing' : 'Editing'} ${clip(file || 'a file')}`, stage: 'writing' };
    }
    return null;
  }

  private command(cmd: string): ProgressLine {
    const m = /(?:^|\s)designer\s+(wf\s+)?([a-z-]+)/.exec(cmd);
    if (!m) return { message: 'Running a command', stage: 'thinking' };
    const sub = m[2];
    if (m[1]) {
      if (sub === 'build') {
        if (!/--into\b/.test(cmd)) return { message: 'Checking the spec', stage: 'building' };
        this.rounds++;
        return { message: `Round ${this.rounds}: building into the project`, stage: 'building' };
      }
      if (sub === 'dump') return { message: 'Reading the project (wf dump)', stage: 'reading' };
      if (sub === 'compare') return { message: 'Checking with wf compare', stage: 'checking' };
      if (sub === 'sheet') return { message: 'Rendering the flow sheet', stage: 'checking' };
      if (sub === 'components') return { message: 'Looking up library components', stage: 'reading' };
      return { message: `Running wf ${clip(sub)}`, stage: 'thinking' };
    }
    if (sub === 'screen') return { message: 'Adding a screen frame', stage: 'building' };
    if (sub === 'to-png') return { message: 'Rendering a PNG', stage: 'checking' };
    if (sub === 'validate') return { message: 'Validating the project', stage: 'checking' };
    if (sub === 'info') return { message: 'Reading the project info', stage: 'reading' };
    return { message: 'Running a command', stage: 'thinking' };
  }
}

/** The finish summary: the agent's last message as one paragraph (the app shows it under the job). */
export function summaryOf(text: string | undefined, max = 1500): string {
  const s = (text ?? '')
    .replace(/\*\*|__|`/g, '') // Markdown emphasis and code marks: the app shows plain text
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
