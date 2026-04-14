import { useState, useEffect, useCallback } from 'react';
import { getToken } from '@/utils/api';
import { log } from '@/utils/logger.util';

export type ThemeType = 'light' | 'dark' | 'system';
export type AccentMode = 'preset' | 'custom';

// Global theme state to persist across navigation
let globalTheme: ThemeType = 'system';
let globalEffectiveTheme: 'light' | 'dark' = 'light';
let isThemeInitialized = false;
let initializationPromise: Promise<void> | null = null;
let isUserSetTheme = false; // Track if theme was explicitly set by user

const DEFAULT_ACCENT = '#1d4ed8';
const LOCAL_STORAGE_ACCENT_KEY = 'accent_color';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const sanitized = hex.replace('#', '');
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((char) => `${char}${char}`).join('')
    : sanitized;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return {
      h: 0,
      s: 0,
      l: Math.round(lightness * 100)
    };
  }

  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  let hue = 0;
  switch (max) {
    case r:
      hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      hue = ((b - r) / delta + 2) * 60;
      break;
    default:
      hue = ((r - g) / delta + 4) * 60;
      break;
  }

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  };
};

const normalizeHexColor = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const validHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return validHex.test(hex) ? hex : null;
};

const hslToCssValue = ({ h, s, l }: { h: number; s: number; l: number }): string => `${h} ${s}% ${l}%`;

const applyAccentColor = (accentColor: string): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalized = normalizeHexColor(accentColor) || DEFAULT_ACCENT;
  const hsl = hexToHsl(normalized);
  const ringS = clamp(hsl.s + 8, 0, 100);
  const ringL = clamp(hsl.l + 8, 0, 100);
  const lightAccentL = clamp(hsl.l + 40, 0, 98);
  const darkAccentL = clamp(hsl.l - 18, 10, 90);
  const darkAccentS = clamp(hsl.s + 6, 0, 100);

  root.style.setProperty('--primary', hslToCssValue(hsl));
  root.style.setProperty('--ring', `${hsl.h} ${ringS}% ${ringL}%`);
  root.style.setProperty('--accent', `${hsl.h} ${clamp(hsl.s, 10, 100)}% ${lightAccentL}%`);
  root.style.setProperty('--sidebar-primary', hslToCssValue(hsl));
  root.style.setProperty('--sidebar-ring', `${hsl.h} ${ringS}% ${ringL}%`);
  root.style.setProperty('--dashboard-stat-blue-foreground', hslToCssValue(hsl));
};

// Only reset initialization on actual page reload, not on navigation
if (typeof window !== 'undefined') {
  // Use pageshow event instead of beforeunload to avoid navigation interference
  window.addEventListener('pageshow', (event) => {
    // Only reset if this is a real page reload (not navigation)
    if (event.persisted === false && performance.navigation.type === 1) {
      isThemeInitialized = false;
      initializationPromise = null;
      isUserSetTheme = false; // Reset user theme flag on actual reload
    }
  });
}

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeType>(globalTheme);
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(globalEffectiveTheme);

  // Sync local state with global state on mount
  useEffect(() => {
    if (isThemeInitialized && (theme !== globalTheme || effectiveTheme !== globalEffectiveTheme)) {
      setTheme(globalTheme);
      setEffectiveTheme(globalEffectiveTheme);
    }
  }, []);

  const getEffectiveTheme = useCallback((selectedTheme: ThemeType): 'light' | 'dark' => {
    if (selectedTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return selectedTheme;
  }, []);

  const applyTheme = useCallback((selectedTheme: ThemeType) => {
    const root = document.documentElement;
    const effective = getEffectiveTheme(selectedTheme);
    
    root.classList.toggle('dark', effective === 'dark');
    setEffectiveTheme(effective);
    
    // Update global state
    globalTheme = selectedTheme;
    globalEffectiveTheme = effective;
  }, [getEffectiveTheme]);

  // Load theme from database only once on initial app load
  useEffect(() => {
    const loadTheme = async () => {
      if (isThemeInitialized) {
        log('useTheme: Already initialized, using global theme:', globalTheme);
        // Ensure local state matches global state
        setTheme(globalTheme);
        setEffectiveTheme(globalEffectiveTheme);
        return; // Don't reload if already initialized
      }
      
      // If theme was explicitly set by user, don't override with database
      if (isUserSetTheme) {
        log('useTheme: User has explicitly set theme, skipping database load');
        setTheme(globalTheme);
        setEffectiveTheme(globalEffectiveTheme);
        return;
      }
      
      // Use a shared initialization promise to prevent race conditions
      if (initializationPromise) {
        log('useTheme: Waiting for existing initialization promise');
        await initializationPromise;
        // After waiting, update local state to match global state
        setTheme(globalTheme);
        setEffectiveTheme(globalEffectiveTheme);
        return;
      }
      
      initializationPromise = (async () => {
        try {
          // Check if user is authenticated before trying to load from database
          const authToken = getToken();
          
          if (!authToken) {
            log('useTheme: No auth token found, using localStorage fallback');
            // Use localStorage immediately if not authenticated
            const localTheme = (localStorage.getItem('theme') as ThemeType) || 'system';
            const localAccent = normalizeHexColor(localStorage.getItem(LOCAL_STORAGE_ACCENT_KEY));
            log('useTheme: LocalStorage theme:', localTheme);
            
            globalTheme = localTheme;
            setTheme(localTheme);
            applyTheme(localTheme);
            applyAccentColor(localAccent || DEFAULT_ACCENT);
            isThemeInitialized = true;
            isUserSetTheme = false; // This is a database load, not user action
            log('useTheme: Theme initialization completed with localStorage fallback');
            return;
          }
          
          log('useTheme: Auth token found, loading from database');
          const { sqliteService } = await import('@/services/sqlite.svc');
          await sqliteService.initialize();
          
          const settings = await sqliteService.getAllSettings('appearance');
          const dbTheme = (settings?.theme as ThemeType) || 'system';
          const dbAccent = normalizeHexColor((settings?.accent_color as string) || '');
          
          globalTheme = dbTheme;
          setTheme(dbTheme);
          applyTheme(dbTheme);
          applyAccentColor(dbAccent || DEFAULT_ACCENT);
          isThemeInitialized = true;
          isUserSetTheme = false; // This is a database load, not user action
          log('useTheme: Theme initialization completed successfully from database');
        } catch (error) {
          console.error('useTheme: Failed to load theme from database:', error);
          console.error('useTheme: Database error details:', {
            message: error.message,
            status: error.status,
            stack: error.stack
          });
          
          // Fallback to localStorage for migration
          log('useTheme: Falling back to localStorage...');
          const localTheme = (localStorage.getItem('theme') as ThemeType) || 'system';
          const localAccent = normalizeHexColor(localStorage.getItem(LOCAL_STORAGE_ACCENT_KEY));
          log('useTheme: LocalStorage theme:', localTheme);
          
          globalTheme = localTheme;
          setTheme(localTheme);
          applyTheme(localTheme);
          applyAccentColor(localAccent || DEFAULT_ACCENT);
          isThemeInitialized = true;
          isUserSetTheme = false; // This is a database load, not user action
          log('useTheme: Theme initialization completed with fallback');
        }
        initializationPromise = null;
      })();
      
      await initializationPromise;
    };

    loadTheme();
  }, [applyTheme]);

  // Listen for system theme changes if using system theme
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        applyTheme('system');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme, applyTheme]);

  const updateTheme = useCallback(async (newTheme: ThemeType, saveToDb = true) => {
    log('useTheme: updateTheme called', { newTheme, saveToDb, currentGlobal: globalTheme });
    
    // Update global state first
    globalTheme = newTheme;
    setTheme(newTheme);
    applyTheme(newTheme);
    
    // Mark as initialized and user-set to prevent reloading from database
    isThemeInitialized = true;
    isUserSetTheme = true; // This theme was explicitly set by user action
    
    if (saveToDb) {
      try {
        const { sqliteService } = await import('@/services/sqlite.svc');
        log('useTheme: Saving theme to database:', newTheme);
        log('useTheme: Checking authentication token...');
        const token = getToken();
        log('useTheme: Auth token available:', !!token);
        if (token) {
          log('useTheme: Token length:', token.length);
        }
        
        await sqliteService.setMultipleSettings({
          'theme': { value: newTheme, category: 'appearance' }
        });
        log('useTheme: Theme saved successfully to database');
      } catch (error) {
        console.error('useTheme: Failed to save theme to database:', error);
        console.error('useTheme: Error details:', {
          message: error.message,
          status: error.status,
          stack: error.stack
        });
        // Don't throw error to prevent UI from breaking
      }
    }
  }, [applyTheme]);

  const setAccentColor = useCallback(async (newColor: string, saveToDb = true, mode: AccentMode = 'custom') => {
    const normalized = normalizeHexColor(newColor) || DEFAULT_ACCENT;
    applyAccentColor(normalized);
    localStorage.setItem(LOCAL_STORAGE_ACCENT_KEY, normalized);

    if (!saveToDb) return;

    try {
      const { sqliteService } = await import('@/services/sqlite.svc');
      await sqliteService.setMultipleSettings({
        accent_mode: { value: mode, category: 'appearance' },
        accent_color: { value: normalized, category: 'appearance' }
      });
    } catch (error) {
      console.error('useTheme: Failed to save accent color:', error);
    }
  }, []);

  return {
    theme,
    effectiveTheme,
    setTheme: updateTheme,
    setAccentColor
  };
};