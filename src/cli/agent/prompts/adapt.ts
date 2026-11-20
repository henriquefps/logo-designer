// `adapt`: Screen section → "Adapt to tablet / desktop with AI".
import type { AdaptInput } from '@/sync/jobs';
import { hintBlock, joinParts, platformsOf, PROJECT_FILE, rules, screenExcerpt, screenList, screenOf, type PromptContext } from './common';

export interface AdaptJob {
  input: AdaptInput;
}

export function adaptPrompt(job: AdaptJob, ctx: PromptContext): string {
  const { doc } = ctx;
  const i = job.input;
  const screen = screenOf(doc, i.screenId);
  const name = screen?.name ?? i.screenId;
  const has = screen ? platformsOf(doc, screen.id).includes(i.toPlatform) : false;
  return joinParts([
    `Task: adapt the screen ${JSON.stringify(name)} of the wireframe project in ${PROJECT_FILE} from ${i.fromPlatform} to ${i.toPlatform}.`,
    has
      ? `It already has a ${i.toPlatform} frame: rework that one.`
      : `It has no ${i.toPlatform} frame yet. Add it first with \`designer screen ${PROJECT_FILE} --name ${JSON.stringify(name)} --platform ${i.toPlatform}\` (a copy of the ${i.fromPlatform} content next to it), then rework that copy.`,
    `Use the extra width the way a real ${i.toPlatform} app does: columns or a grid instead of a long list, side navigation instead of a bottom bar, master-detail where a list opens details. Same content, texts, states and flows as the ${i.fromPlatform} frame. Leave the ${i.fromPlatform} frame exactly as it is (in the spec the screen gets "variants", one per platform).`,
    `Context. The screen, as \`designer wf dump --no-geometry\` prints it:\n\n\`\`\`json\n${screen ? screenExcerpt(doc, screen.id) : '(screen not found)'}\n\`\`\``,
    `All screens of the project:\n${screenList(doc)}`,
    hintBlock(i.hint),
    rules(ctx.maxRounds, [`When done, render it once with \`designer wf sheet ${PROJECT_FILE} -o sheet.png\` and look at the image to check it.`]),
  ]);
}
