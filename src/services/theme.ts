export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'vop:theme-preference';
const THEME_EVENT = 'vop_theme_changed';

export function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'dark';
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) || 'dark';
  } catch {
    return 'dark';
  }
}

export function resolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyThemePreference(preference: ThemePreference, persist = true): 'light' | 'dark' {
  const normalized = normalizeThemePreference(preference) || 'dark';
  if (typeof document !== 'undefined') {
    const resolved = resolvedTheme(normalized);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  }
  if (persist && typeof window !== 'undefined') {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, normalized); } catch { /* private storage can be unavailable */ }
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preference: normalized } }));
  }
  return resolvedTheme(normalized);
}

export function themeChangeEventName() {
  return THEME_EVENT;
}
