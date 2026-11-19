import { LinkBreakIcon } from '@phosphor-icons/react';
import type { DesignDocument, Id } from '@/model';
import { findNode, isScreenNode } from '@/model';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { attachNoteTo, detachNoteCommand, setNoteText } from '@/wireframe/noteCommands';
import { canAttach, isNoteNode } from '@/wireframe/notes';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

/** Nodes a note can attach to: screens, and the objects on them (and loose objects on the canvas). */
function targets(doc: DesignDocument, noteId: Id): { id: Id; label: string }[] {
  const out: { id: Id; label: string }[] = [];
  for (const n of doc.children) {
    if (!canAttach(doc, noteId, n.id)) continue;
    out.push({ id: n.id, label: n.name });
    if (isScreenNode(n)) for (const c of n.children) if (canAttach(doc, noteId, c.id)) out.push({ id: c.id, label: `${n.name} › ${c.name}` });
  }
  return out;
}

export function NoteSection({ ctx }: { ctx: SelectionContext }) {
  const note = ctx.nodes[0];
  if (!isNoteNode(note)) return null;
  const target = note.note.target;
  const options = targets(ctx.doc, note.id);
  const current = target !== undefined ? findNode(ctx.doc, target) : null;
  // A target deeper than the list (e.g. attached by a script) still shows up as the current value.
  if (current && !options.some((o) => o.id === current.id)) options.unshift({ id: current.id, label: current.name });
  return (
    <Section title="Note">
      <Textarea
        key={`${note.id}:${note.note.text}`}
        aria-label="Note text"
        className="min-h-20"
        defaultValue={note.note.text}
        autoFocus={note.note.text === ''}
        placeholder="Describe what can't be drawn: “pull to refresh”, “only visible offline”…"
        onBlur={(e) => setNoteText(note.id, e.currentTarget.value)}
      />
      <FieldRow label="Attached to">
        <div className="flex min-w-0 items-center gap-2">
          <Select value={target ?? ''} onValueChange={(id) => attachNoteTo(note.id, id)}>
            <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Attached to">
              <SelectValue placeholder="Not attached" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {target !== undefined && (
            <Button size="icon-sm" variant="outline" aria-label="Detach note" title="Detach" onClick={() => detachNoteCommand(note.id)}>
              <LinkBreakIcon />
            </Button>
          )}
        </div>
      </FieldRow>
      <p className="text-xs text-muted-foreground">Notes are left out of screen exports and go to the AI export, next to what they are attached to.</p>
    </Section>
  );
}
