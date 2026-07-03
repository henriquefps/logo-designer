import { SunIcon, MoonIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/useUIStore';

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}
