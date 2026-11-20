// `next-screen`: the flow drop menu's "Generate with AI". The app already created the target logical screen and its
// frame (empty, named after the label) and linked the flow; the agent fills it.
import type { NextScreenInput } from '@/sync/jobs';
import { describeNode, hintBlock, joinParts, PROJECT_FILE, rules, screenExcerpt, screenList, screenOf, type PromptContext } from './common';

export interface NextScreenJob {
  screenId?: string;
  frameId?: string;
  input: NextScreenInput;
}

export function nextScreenPrompt(job: NextScreenJob, ctx: PromptContext): string {
  const { doc } = ctx;
  const i = job.input;
  const from = screenOf(doc, i.fromScreenId);
  const target = screenOf(doc, job.screenId ?? job.frameId);
  const targetName = target?.name ?? i.label;
  const tapped = `${describeNode(doc, i.fromNodeId)}${i.fromPart ? `, its part ${JSON.stringify(i.fromPart)}` : ''}`;
  return joinParts([
    `Task: design the screen that opens when the person taps ${tapped} on the screen ${JSON.stringify(from?.name ?? i.fromScreenId)} of the wireframe project in ${PROJECT_FILE}.`,
    `The app has already created that screen, empty: ${JSON.stringify(targetName)} (${i.platform}${target ? `, screen id ${target.id}` : ''}${job.frameId ? `, frame id ${job.frameId}` : ''}), linked from that element. Fill it: give it the content a real ${i.platform} app would show there (bars, sections, rows, controls), consistent with the source screen (same shared components such as a tab bar, same naming and tone). Do not create another screen for it and keep the existing flow.`,
    `Context. The source screen, as \`designer wf dump --no-geometry\` prints it:\n\n\`\`\`json\n${from ? screenExcerpt(doc, from.id) : '(source screen not found)'}\n\`\`\``,
    `All screens of the project:\n${screenList(doc)}`,
    hintBlock(i.hint),
    rules(ctx.maxRounds, [
      `Add "opens" links from the new screen only where the target screen already exists (a back button to ${JSON.stringify(from?.name ?? 'the source screen')}, for example); describe other navigation in a note.`,
      `When done, render it once with \`designer wf sheet ${PROJECT_FILE} -o sheet.png\` and look at the image to check it.`,
    ]),
  ]);
}
