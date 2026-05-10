import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme.hook';
import { cn } from '@/utils/themeUtils.util';

interface ThemeModeToggleProps {
  className?: string;
  compact?: boolean;
}

export const ThemeModeToggle: React.FC<ThemeModeToggleProps> = ({ className, compact = false }) => {
  const { effectiveTheme, setTheme } = useTheme();
  const isDarkMode = effectiveTheme === 'dark';

  const handleToggle = async () => {
    await setTheme(isDarkMode ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        'flex w-full items-center rounded-lg border border-border bg-muted/30 p-2 transition hover:bg-accent',
        compact && 'justify-center p-1.5',
        className
      )}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {!compact && (
        <span className="mr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Theme
        </span>
      )}

      <span
        className={cn(
          'relative inline-flex h-6 w-12 items-center rounded-full border border-border bg-background transition-colors',
          compact && 'h-5 w-10'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform',
            isDarkMode ? 'translate-x-6' : 'translate-x-0',
            compact && 'h-4 w-4',
            compact && (isDarkMode ? 'translate-x-5' : 'translate-x-0')
          )}
        >
          {isDarkMode ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
        </span>
      </span>
    </button>
  );
};
