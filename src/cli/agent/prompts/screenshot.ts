// `screenshot`: a screenshot pasted or dropped on the canvas, "Turn into a wireframe with AI".
import type { ScreenshotInput } from '@/sync/jobs';
import { hintBlock, joinParts, PROJECT_FILE, rules, screenList, SPEC_FILE, type PromptContext } from './common';

export interface ScreenshotJob {
  input: ScreenshotInput;
}

export function screenshotPrompt(job: ScreenshotJob, ctx: PromptContext): string {
  const i = job.input;
  const shot = ctx.attachments[0] ?? '(missing screenshot)';
  const name = i.name?.trim();
  return joinParts([
    `Task: turn the screenshot ${shot} into a wireframe screen of the project in ${PROJECT_FILE}, platform ${i.platform}.`,
    name
      ? `Name the new screen ${JSON.stringify(name)} (status "current": it is the app as it is today).`
      : `Name the new screen after what the screenshot shows (its title), status "current": it is the app as it is today.`,
    `Follow "Screenshot → wireframe" from your instructions: open the image, list its parts top to bottom, map each to a library component, write the screen into ${SPEC_FILE} (add it to the screens of a fresh dump), build it --into the project, then \`designer wf compare ${shot} ${PROJECT_FILE} --screen "<name>" --overlay 50 -o compare.png\` and look at compare.png. Fix and compare again until every element has its component and the order and proportions match. After your last build, run the compare once more and look at it before you finish: your summary says what still differs.`,
    `Screens already in the project (keep them as they are):\n${screenList(ctx.doc)}`,
    hintBlock(i.hint),
    rules(ctx.maxRounds, ['Real texts and states from the screenshot (which tab is selected, toggles, values); no tracing of shapes or pixel positions.']),
  ]);
}
