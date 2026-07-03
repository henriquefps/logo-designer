import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CanvasSvg } from '@/components/editor/Canvas/CanvasSvg';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { TEMPLATES } from '@/lib/templates';

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateGallery({ open, onOpenChange }: TemplateGalleryProps) {
  const setSelection = useUIStore((s) => s.setSelection);

  const handlePick = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const { canvasSettings, elements } = template.build();
    useProjectStore.getState().createProject({ name: template.name, canvasSettings, elements });
    setSelection([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a new logo</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TEMPLATES.map((template) => {
            const { canvasSettings, elements } = template.build();
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handlePick(template.id)}
                className="group flex flex-col items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="checkerboard size-20 overflow-hidden rounded-md pointer-events-none">
                  <CanvasSvg
                    canvasSettings={canvasSettings}
                    elements={elements}
                    selectedIds={[]}
                    hoveredId={null}
                    textSizes={{}}
                    onMeasureText={() => {}}
                    onPointerDownElement={() => {}}
                    onPointerDownBackground={() => {}}
                    onElementHover={() => {}}
                    marqueeRect={null}
                    guides={[]}
                  />
                </div>
                <span className="text-xs font-medium text-foreground">{template.name}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
