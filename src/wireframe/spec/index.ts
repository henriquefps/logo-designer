// The wireframe spec format (docs/wireframe-spec.md): build a project from a spec, dump a project to
// one, and the component catalog. Pure; the CLI (`designer wf …`, src/cli/wf.ts) wraps it.
export * from './types';
export { parseSpec, checkSpec, primaryTextProp, primaryListProp } from './parse';
export { buildFromSpec, type SpecBuildResult, type BuildSummary } from './build';
export { dumpToSpec, type DumpOptions } from './dump';
