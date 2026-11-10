import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DialogHost } from '@/dialogs/DialogHost';
import { useImportHandlers } from '@/io/useImportHandlers';
import { handleLaunchUrl } from '@/io/launch';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useProjectsStore } from '@/store/useProjectsStore';
import { useEditorStore } from '@/store/useEditorStore';
import { isFirstVisit } from '@/dialogs/newDocument/welcome';
import { startSync } from '@/sync/engine';
import { useTheme } from '@/theme/theme';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';
import { useKeyboard } from './useKeyboard';

export function App() {
  const mobile = useIsMobile();
  const theme = useTheme();
  useKeyboard();
  useImportHandlers();
  useEffect(() => {
    let stopSync: (() => void) | null = null;
    let unmounted = false;
    void useProjectsStore
      .getState()
      .init()
      .then(() => {
        // Pull on start, focus and every 30 s, push after autosaves (does nothing until Sync is turned on).
        if (!unmounted) stopSync = startSync();
        // A #open= / ?import= link asks to import; otherwise, on a first visit, the welcome dialog.
        if (handleLaunchUrl()) return;
        if (isFirstVisit() && !useEditorStore.getState().dialog) useEditorStore.getState().openDialog('newDocument');
      });
    // A new #open= link pasted into this tab's address bar.
    const onHash = () => useProjectsStore.getState().ready && handleLaunchUrl();
    window.addEventListener('hashchange', onHash);
    const flush = () => void useProjectsStore.getState().flush();
    window.addEventListener('pagehide', flush);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unmounted = true;
      stopSync?.();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return (
    <TooltipProvider delayDuration={300}>
      {mobile ? <MobileLayout /> : <DesktopLayout />}
      <DialogHost />
      <Toaster theme={theme} position={mobile ? 'top-center' : 'bottom-right'} />
    </TooltipProvider>
  );
}
