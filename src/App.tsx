import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { CanvasRefProvider } from '@/components/editor/CanvasRefProvider';
import { EditorShell } from '@/components/editor/EditorShell';

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <CanvasRefProvider>
        <EditorShell />
      </CanvasRefProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
