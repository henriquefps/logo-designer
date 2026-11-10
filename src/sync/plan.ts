// The merge logic of project sync, pure: given what this device has, what the server has and what
// both agreed on last time, decide what to transfer. No I/O here, so it is unit-tested to death.
//
// Model: every item (a project, an uploaded font) has an `updatedAt` in ms. Last write wins per id.
// A deletion is a tombstone with its own timestamp, so a later edit beats an earlier delete and the
// other way round. `base` is the updatedAt both sides had when they last agreed on an id: it is how
// we tell "only I changed it" from "both of us changed it" (a conflict).

export interface LocalItem {
  id: string;
  updatedAt: number;
}

export interface RemoteItem {
  id: string;
  updatedAt: number;
  deleted: boolean;
}

export type Step =
  /** Send the local version. */
  | { op: 'push'; id: string }
  /** Send a local deletion (tombstone) stamped `updatedAt`. */
  | { op: 'push-delete'; id: string; updatedAt: number }
  /** Download the server's version and replace the local one. `keepLocalCopy`: the local version had
   *  its own unsynced edits and loses, so keep it as a "conflicted copy" first. */
  | { op: 'pull'; id: string; keepLocalCopy: boolean }
  /** The server deleted it later than our last edit: remove it here (`keepLocalCopy` as above). */
  | { op: 'delete-local'; id: string; keepLocalCopy: boolean }
  /** Both sides already agree: remember `updatedAt` as the new base. */
  | { op: 'settle'; id: string; updatedAt: number }
  /** Nothing to transfer and nothing to remember: drop the id's tombstone and base. */
  | { op: 'forget'; id: string };

export interface PlanInput {
  local: LocalItem[];
  /** Local deletions waiting to be told to the server: id -> time of deletion. */
  tombstones: Record<string, number>;
  remote: RemoteItem[];
  /** id -> updatedAt both sides had at the last successful sync of that id. */
  base: Record<string, number>;
}

export function planSync({ local, tombstones, remote, base }: PlanInput): Step[] {
  const locals = new Map(local.map((l) => [l.id, l]));
  const remotes = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set<string>([...locals.keys(), ...remotes.keys(), ...Object.keys(tombstones)]);
  const steps: Step[] = [];

  for (const id of ids) {
    const l = locals.get(id);
    const r = remotes.get(id);
    const t = tombstones[id];
    const b = base[id];

    if (l) {
      // A project that exists locally beats a stale tombstone of the same id (it was re-created or restored).
      const edited = b === undefined || l.updatedAt > b; // changed here since the last sync
      if (!r) steps.push({ op: 'push', id });
      else if (r.deleted) {
        if (l.updatedAt > r.updatedAt) steps.push({ op: 'push', id });
        else steps.push({ op: 'delete-local', id, keepLocalCopy: edited });
      } else if (l.updatedAt === r.updatedAt) steps.push({ op: 'settle', id, updatedAt: r.updatedAt });
      else {
        const remoteEdited = b === undefined || r.updatedAt > b;
        if (edited && remoteEdited) {
          // Both changed: the newer edit wins, the loser is kept (here as a copy, on the server in conflicts/).
          if (r.updatedAt > l.updatedAt) steps.push({ op: 'pull', id, keepLocalCopy: true });
          else steps.push({ op: 'push', id });
        } else if (remoteEdited) steps.push({ op: 'pull', id, keepLocalCopy: false });
        else steps.push({ op: 'push', id });
      }
    } else if (t !== undefined) {
      if (!r) steps.push({ op: 'forget', id });
      else if (r.deleted) steps.push({ op: 'forget', id });
      else if (t > r.updatedAt) steps.push({ op: 'push-delete', id, updatedAt: t });
      else steps.push({ op: 'pull', id, keepLocalCopy: false }); // edited elsewhere after we deleted it
    } else if (r && !r.deleted) {
      steps.push({ op: 'pull', id, keepLocalCopy: false });
    } else if (b !== undefined) {
      steps.push({ op: 'forget', id });
    }
  }
  return steps;
}

/** Items with changes that the server does not have yet (what an "offline queue" holds). */
export function countPending(local: LocalItem[], tombstones: Record<string, number>, base: Record<string, number>): number {
  return local.filter((l) => base[l.id] !== l.updatedAt).length + Object.keys(tombstones).length;
}

/** "Name (conflicted copy 2026-11-10)" */
export function conflictedName(name: string, at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${name} (conflicted copy ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())})`;
}
