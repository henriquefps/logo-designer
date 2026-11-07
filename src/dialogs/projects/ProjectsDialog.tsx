import { useState } from 'react';
import { CopySimpleIcon, DotsThreeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { useProjectsStore } from '@/store/useProjectsStore';
import type { ProjectMeta } from '@/store/persistence';
import { fullDate, relativeDate } from '@/lib/relativeDate';
import { cn } from '@/lib/utils';

export function ProjectsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const activeId = useProjectsStore((s) => s.activeId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);
  const store = useProjectsStore.getState;

  const openProject = async (id: string) => {
    await store().open(id);
    onOpenChange(false);
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Projects</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Saved in this browser. Use File → Save project file for a backup.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="px-0 pb-0">
            <ul className="flex flex-col border-t">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={cn('flex min-h-14 items-center gap-2 border-b py-2 pr-4 pl-6 hover:bg-muted/50', p.id === activeId && 'bg-muted hover:bg-muted')}
                >
                  {renaming === p.id ? (
                    <input
                      autoFocus
                      aria-label="Project name"
                      defaultValue={p.name}
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-[0.9375rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      onBlur={(e) => {
                        setRenaming(null);
                        void store().rename(p.id, e.currentTarget.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => void openProject(p.id)}>
                      <span className={cn('line-clamp-2 text-[0.9375rem] [overflow-wrap:anywhere]', p.id === activeId && 'font-medium')}>{p.name}</span>
                      <span className="text-[0.8125rem] text-muted-foreground" title={fullDate(p.updatedAt)}>
                        Edited {relativeDate(p.updatedAt)}
                      </span>
                    </button>
                  )}
                  {p.id === activeId && (
                    <Badge variant="outline" className="shrink-0">
                      Open
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
                        <DotsThreeIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(p.id)}>
                        <PencilSimpleIcon />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void store().duplicate(p.id)}>
                        <CopySimpleIcon />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                        <TrashIcon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <Button
              onClick={async () => {
                await store().create('Untitled');
                onOpenChange(false);
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New project
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the project from this browser. It can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void store().remove(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
