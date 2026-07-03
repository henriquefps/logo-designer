import { useState } from 'react';
import { CaretDownIcon, PlusIcon, CopySimpleIcon, TrashIcon, CheckIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';
import { TemplateGallery } from './TemplateGallery';

export function ProjectSwitcher() {
  const projects = useProjectStore((s) => s.projects);
  const projectOrder = useProjectStore((s) => s.projectOrder);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const switchProject = useProjectStore((s) => s.switchProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const activeProject = activeProjectId ? projects[activeProjectId] : null;

  const commitRename = () => {
    if (renamingId && nameDraft.trim()) renameProject(renamingId, nameDraft.trim());
    setRenamingId(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 gap-1.5 px-2 font-medium">
            <span className="max-w-40 truncate">{activeProject?.name ?? 'Untitled'}</span>
            <CaretDownIcon className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {projectOrder.map((id) => {
            const project = projects[id];
            if (!project) return null;
            const isActive = id === activeProjectId;
            if (renamingId === id) {
              return (
                <div key={id} className="flex items-center gap-1 px-2 py-1.5">
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                    onBlur={commitRename}
                    className="h-7 text-sm"
                  />
                </div>
              );
            }
            return (
              <DropdownMenuItem
                key={id}
                onSelect={() => {
                  switchProject(id);
                  clearSelection();
                }}
                onDoubleClick={() => {
                  setRenamingId(id);
                  setNameDraft(project.name);
                }}
                className={cn('flex items-center justify-between gap-2', isActive && 'bg-accent')}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {isActive && <CheckIcon className="size-3.5 shrink-0" />}
                  <span className="truncate">{project.name}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateProject(id);
                    }}
                    className="rounded p-1 hover:bg-background"
                  >
                    <CopySimpleIcon className="size-3.5" />
                  </button>
                  {projectOrder.length > 1 && (
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTargetId(id);
                      }}
                      className="rounded p-1 text-destructive hover:bg-background"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTemplateGalleryOpen(true)}>
            <PlusIcon className="size-3.5" /> New logo…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateGallery open={templateGalleryOpen} onOpenChange={setTemplateGalleryOpen} />

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this logo?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. The project and everything on its canvas will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId) deleteProject(deleteTargetId);
                setDeleteTargetId(null);
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
