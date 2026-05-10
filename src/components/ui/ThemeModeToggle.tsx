import { Moon, Sun } from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';
import { useTheme } from '@/hooks/useTheme.hook';

interface ThemeModeToggleProps {
  className?: string;
}

export const ThemeModeToggle = ({ className }: ThemeModeToggleProps) => {
  const { effectiveTheme, setTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const handleToggle = () => {
    void setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex h-10 w-20 items-center rounded-full border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isDark
          ? 'border-slate-600 bg-gradient-to-r from-slate-700 to-slate-800'
          : 'border-sky-300 bg-gradient-to-r from-sky-400 to-blue-500',
        className
      )}
    >
      <span
        className={cn(
          'absolute left-1 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform duration-300',
          isDark
            ? 'translate-x-10 bg-slate-900 text-slate-100'
            : 'translate-x-0 bg-white text-amber-500'
        )}
      >
        {isDark ? <Moon className="h-4 w-4 fill-current" /> : <Sun className="h-4 w-4 fill-current" />}
      </span>
      <span
        className={cn(
          'absolute h-1.5 w-1.5 rounded-full bg-white/85 transition-opacity',
          isDark ? 'left-3 top-3 opacity-100' : 'right-4 top-3 opacity-60'
        )}
      />
      <span
        className={cn(
          'absolute h-1 w-1 rounded-full bg-white/75 transition-opacity',
          isDark ? 'left-5 top-6 opacity-100' : 'right-6 top-6 opacity-60'
        )}
      />
    </button>
  );
};
