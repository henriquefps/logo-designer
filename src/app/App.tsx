import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DialogHost } from '@/dialogs/DialogHost';
import { useImportHandlers } from '@/io/useImportHandlers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useProjectsStore } from '@/store/useProjectsStore';
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
    void useProjectsStore.getState().init();
    const flush = () => void useProjectsStore.getState().flush();
    window.addEventListener('pagehide', flush);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
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
