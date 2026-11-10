import { describe, expect, it } from 'vitest';
import { conflictedName, countPending, planSync, type RemoteItem } from './plan';

const live = (id: string, updatedAt: number): RemoteItem => ({ id, updatedAt, deleted: false });
const dead = (id: string, updatedAt: number): RemoteItem => ({ id, updatedAt, deleted: true });
const plan = (p: Partial<Parameters<typeof planSync>[0]>) => planSync({ local: [], tombstones: {}, remote: [], base: {}, ...p });

describe('planSync: one side only', () => {
  it('pushes a new local project', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 5 }] })).toEqual([{ op: 'push', id: 'a' }]);
  });
  it('pulls a project only the server has', () => {
    expect(plan({ remote: [live('a', 5)] })).toEqual([{ op: 'pull', id: 'a', keepLocalCopy: false }]);
  });
  it('does nothing for a tombstone we never had', () => {
    expect(plan({ remote: [dead('a', 5)] })).toEqual([]);
  });
  it('drops a local tombstone the server never saw the project for', () => {
    expect(plan({ tombstones: { a: 9 } })).toEqual([{ op: 'forget', id: 'a' }]);
  });
});

describe('planSync: both live', () => {
  const local = [{ id: 'a', updatedAt: 10 }];
  it('settles when both have the same version', () => {
    expect(plan({ local, remote: [live('a', 10)] })).toEqual([{ op: 'settle', id: 'a', updatedAt: 10 }]);
  });
  it('pushes our edit when only we changed it since the last sync', () => {
    expect(plan({ local, remote: [live('a', 5)], base: { a: 5 } })).toEqual([{ op: 'push', id: 'a' }]);
  });
  it('pulls their edit when only they changed it', () => {
    expect(plan({ local, remote: [live('a', 20)], base: { a: 10 } })).toEqual([{ op: 'pull', id: 'a', keepLocalCopy: false }]);
  });
  it('conflict, remote newer: pull and keep our version as a copy', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 12 }], remote: [live('a', 20)], base: { a: 5 } })).toEqual([
      { op: 'pull', id: 'a', keepLocalCopy: true },
    ]);
  });
  it('conflict, local newer: push (the server keeps the one it overwrites)', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 30 }], remote: [live('a', 20)], base: { a: 5 } })).toEqual([{ op: 'push', id: 'a' }]);
  });
  it('same id on two devices with no common base is a conflict, newest wins', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 10 }], remote: [live('a', 20)] })).toEqual([{ op: 'pull', id: 'a', keepLocalCopy: true }]);
    expect(plan({ local: [{ id: 'a', updatedAt: 30 }], remote: [live('a', 20)] })).toEqual([{ op: 'push', id: 'a' }]);
  });
});

describe('planSync: deletions', () => {
  it('pushes a local deletion that is newer than the server copy', () => {
    expect(plan({ tombstones: { a: 30 }, remote: [live('a', 20)], base: { a: 20 } })).toEqual([{ op: 'push-delete', id: 'a', updatedAt: 30 }]);
  });
  it('an edit elsewhere after our deletion wins: pull it back', () => {
    expect(plan({ tombstones: { a: 30 }, remote: [live('a', 40)], base: { a: 20 } })).toEqual([{ op: 'pull', id: 'a', keepLocalCopy: false }]);
  });
  it('removes locally what the server deleted after our last edit', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 20 }], remote: [dead('a', 30)], base: { a: 20 } })).toEqual([
      { op: 'delete-local', id: 'a', keepLocalCopy: false },
    ]);
  });
  it('a remote deletion that beats our unsynced edit keeps our version as a copy', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 25 }], remote: [dead('a', 30)], base: { a: 20 } })).toEqual([
      { op: 'delete-local', id: 'a', keepLocalCopy: true },
    ]);
  });
  it('our edit newer than their deletion resurrects it', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 40 }], remote: [dead('a', 30)], base: { a: 20 } })).toEqual([{ op: 'push', id: 'a' }]);
  });
  it('forgets a tombstone once the server has the deletion too', () => {
    expect(plan({ tombstones: { a: 30 }, remote: [dead('a', 31)], base: { a: 20 } })).toEqual([{ op: 'forget', id: 'a' }]);
  });
  it('a re-created local project beats a stale tombstone of the same id', () => {
    expect(plan({ local: [{ id: 'a', updatedAt: 50 }], tombstones: { a: 30 }, remote: [dead('a', 30)] })).toEqual([{ op: 'push', id: 'a' }]);
  });
});

describe('helpers', () => {
  it('counts pending edits and deletions', () => {
    expect(
      countPending(
        [
          { id: 'a', updatedAt: 5 },
          { id: 'b', updatedAt: 6 },
          { id: 'c', updatedAt: 7 },
        ],
        { x: 1 },
        { a: 5, b: 1 },
      ),
    ).toBe(3); // b edited, c never synced, x deleted
  });
  it('names a conflicted copy with the date', () => {
    expect(conflictedName('Logo', new Date(2026, 10, 9, 15).getTime())).toBe('Logo (conflicted copy 2026-11-09)');
  });
});

// A tiny in-memory model of the whole protocol (server LWW + client plan) to check that devices converge.
describe('two devices converge', () => {
  interface Item {
    updatedAt: number;
    deleted: boolean;
    text: string;
  }
  class Server {
    items = new Map<string, Item>();
    put(id: string, it: Item) {
      const cur = this.items.get(id);
      if (cur && !(it.updatedAt > cur.updatedAt)) return false;
      this.items.set(id, it);
      return true;
    }
  }
  class Device {
    docs = new Map<string, { updatedAt: number; text: string }>();
    tombs: Record<string, number> = {};
    base: Record<string, number> = {};
    copies: string[] = [];
    edit(id: string, text: string, at: number) {
      this.docs.set(id, { updatedAt: at, text });
      delete this.tombs[id];
    }
    del(id: string, at: number) {
      this.docs.delete(id);
      this.tombs[id] = at;
    }
    sync(s: Server) {
      const remote: RemoteItem[] = [...s.items].map(([id, i]) => ({ id, updatedAt: i.updatedAt, deleted: i.deleted }));
      const steps = planSync({
        local: [...this.docs].map(([id, d]) => ({ id, updatedAt: d.updatedAt })),
        tombstones: this.tombs,
        remote,
        base: this.base,
      });
      for (const st of steps) {
        const id = st.id;
        if (st.op === 'push') {
          const d = this.docs.get(id)!;
          if (s.put(id, { ...d, deleted: false })) this.base[id] = d.updatedAt;
        } else if (st.op === 'push-delete') {
          if (s.put(id, { updatedAt: st.updatedAt, deleted: true, text: '' })) {
            delete this.tombs[id];
            delete this.base[id];
          }
        } else if (st.op === 'pull') {
          const r = s.items.get(id)!;
          if (st.keepLocalCopy) this.copies.push(this.docs.get(id)!.text);
          this.docs.set(id, { updatedAt: r.updatedAt, text: r.text });
          this.base[id] = r.updatedAt;
        } else if (st.op === 'delete-local') {
          if (st.keepLocalCopy) this.copies.push(this.docs.get(id)!.text);
          this.docs.delete(id);
          delete this.base[id];
        } else if (st.op === 'settle') this.base[id] = st.updatedAt;
        else {
          delete this.base[id];
          delete this.tombs[id];
        }
      }
    }
    snapshot() {
      return Object.fromEntries([...this.docs].map(([id, d]) => [id, d.text]));
    }
  }

  it('create, edit and delete propagate both ways', () => {
    const s = new Server();
    const a = new Device();
    const b = new Device();
    a.edit('p', 'v1', 100);
    a.sync(s);
    b.sync(s);
    expect(b.snapshot()).toEqual({ p: 'v1' });
    b.edit('p', 'v2', 200);
    b.sync(s);
    a.sync(s);
    expect(a.snapshot()).toEqual({ p: 'v2' });
    a.del('p', 300);
    a.sync(s);
    b.sync(s);
    expect(b.snapshot()).toEqual({});
    b.sync(s);
    a.sync(s);
    expect(s.items.get('p')?.deleted).toBe(true);
    expect(a.tombs).toEqual({});
    expect(b.tombs).toEqual({});
  });

  it('offline edits on both devices: newest wins, the loser survives as a copy', () => {
    const s = new Server();
    const a = new Device();
    const b = new Device();
    a.edit('p', 'v1', 100);
    a.sync(s);
    b.sync(s);
    a.edit('p', 'from A', 200);
    b.edit('p', 'from B', 300);
    b.sync(s); // B syncs first and pushes
    a.sync(s); // A never synced its edit: it loses and keeps its text as a copy
    expect(a.snapshot()).toEqual({ p: 'from B' });
    expect(a.copies).toEqual(['from A']);
    expect(b.copies).toEqual([]);
    b.sync(s);
    expect(b.snapshot()).toEqual({ p: 'from B' });
  });

  it('when the older edit reached the server first, the server keeps it (conflicts/) and the newer wins', () => {
    const s = new Server();
    const a = new Device();
    const b = new Device();
    a.edit('p', 'v1', 100);
    a.sync(s);
    b.sync(s);
    a.edit('p', 'from A', 200);
    b.edit('p', 'from B', 300);
    a.sync(s); // A's edit is on the server...
    b.sync(s); // ...and B's newer edit overwrites it (the real server archives A's version)
    a.sync(s);
    expect(a.snapshot()).toEqual({ p: 'from B' });
    expect(b.snapshot()).toEqual({ p: 'from B' });
  });

  it('an edit made after a delete on another device brings the project back', () => {
    const s = new Server();
    const a = new Device();
    const b = new Device();
    a.edit('p', 'v1', 100);
    a.sync(s);
    b.sync(s);
    a.del('p', 200);
    b.edit('p', 'edited later', 300);
    a.sync(s);
    b.sync(s);
    a.sync(s);
    expect(a.snapshot()).toEqual({ p: 'edited later' });
    expect(b.snapshot()).toEqual({ p: 'edited later' });
  });
});
