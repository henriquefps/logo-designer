// Wireframe documents in the CLI: `new --preset wireframe`, `screen`, and which frames
// `to-png` / `to-svg --screen` render. See docs/agents.md → Wireframes.
import { createDocument, PLATFORM_IDS, type DesignDocument, type ScreenNode, type ScreenPlatform } from '@/model';
import { materializeDocument } from '@/wireframe/pipeline';
import { addScreen, duplicateScreenAs, findFrames, freePlatforms, logicalScreen, screenSlug } from '@/wireframe/screens';

export const WIREFRAME_PRESET = 'wireframe';

/** An empty wireframe project (no screens: add them with `designer screen`). */
export function newWireframeProject(name: string): DesignDocument {
  return createDocument({ name, artboard: { width: 1024, height: 1024, background: { kind: 'none' } }, wireframe: { screens: [] } });
}

export function parsePlatform(v: string | undefined): ScreenPlatform | undefined {
  if (v === undefined) return undefined;
  if ((PLATFORM_IDS as readonly string[]).includes(v)) return v as ScreenPlatform;
  throw new Error(`--platform must be one of ${PLATFORM_IDS.join(', ')} (got “${v}”)`);
}

/**
 * `designer screen`: a new logical screen `name` with one `platform` frame, right of everything; or,
 * when a logical screen called `name` exists, its `platform` variant: a copy of an existing frame's
 * content placed next to it ("Duplicate as …"). Returns the new document and a summary line.
 */
export function addScreenToProject(doc: DesignDocument, o: { name?: string; platform?: ScreenPlatform }): { doc: DesignDocument; summary: string } {
  if (!doc.wireframe) throw new Error('not a wireframe project (create one with `designer new --preset wireframe`)');
  const platform = o.platform ?? 'phone';
  const next = structuredClone(doc);
  const existing = o.name ? findFrames(next, o.name) : [];
  let summary: string;
  if (existing.length) {
    const screenId = existing[0].screen.screenId;
    const logical = logicalScreen(next, screenId)!;
    if (!freePlatforms(next, screenId).includes(platform)) throw new Error(`“${logical.name}” already has a ${platform} frame (one per platform)`);
    duplicateScreenAs(next, existing[0].id, platform);
    summary = `added the ${platform} variant of “${logical.name}” (a copy of its ${existing[0].screen.platform} frame)`;
  } else {
    addScreen(next, { platform, name: o.name });
    summary = `added screen “${next.wireframe!.screens.at(-1)!.name}” (${platform})`;
  }
  return { doc: materializeDocument(next), summary };
}

/** Frames selected by `--screen <name>` / `--platform <p>`; an error when nothing matches. */
export function framesFor(doc: DesignDocument, name?: string, platform?: ScreenPlatform): ScreenNode[] {
  const found = findFrames(doc, name, platform);
  if (!found.length) {
    const what = [name && `“${name}”`, platform].filter(Boolean).join(' ');
    throw new Error(what ? `no screen ${what} in this project` : 'this wireframe has no screens yet (add one with `designer screen`)');
  }
  return found;
}

/** `settings.phone.png`: the file name of a screen render (same naming as the AI export package). */
export const screenFile = (f: ScreenNode, ext: string) => `${screenSlug(f.name)}.${f.screen.platform}.${ext}`;

/** One line per logical screen for `info` / `validate`: `Settings: phone 390×844, tablet 820×1180`. */
export function describeScreens(doc: DesignDocument): string[] {
  return (doc.wireframe?.screens ?? []).map((s) => {
    const fs = findFrames(doc).filter((f) => f.screen.screenId === s.id);
    return `${s.name}: ${fs.map((f) => `${f.screen.platform} ${Math.round(f.screen.width)}×${Math.round(f.screen.height)} [${f.id}]`).join(', ')}`;
  });
}
