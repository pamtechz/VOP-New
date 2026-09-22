import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { getStoredAutoLocalization, registerLocalizationString } from './storage';

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  return (settings?.customLanguages ?? [])
    .filter(language => language.enabled !== false && language.code.trim() && language.name.trim())
    .map(language => ({ ...language, code: language.code.trim().toLowerCase() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
};

/**
 * Translation dictionaries are intentionally not embedded in the application.
 * Strings are discovered from actual getTranslation() calls and their source
 * fallback text, then translated through the administrator's configured
 * language records.
 */
export const getTranslation = (
  key: string,
  lang: LanguageCode = 'en',
  customTranslations?: Record<string, Record<string, string>>,
  defaultFallback?: string,
  componentName?: string
): string => {
  const fallback = String(defaultFallback || key).trim() || key;

  try {
    registerLocalizationString(key, fallback, componentName);
  } catch {
    // Discovery must never block rendering.
  }

  const custom = customTranslations?.[lang]?.[key];
  if (typeof custom === 'string' && custom.trim()) return custom;

  try {
    const entry = getStoredAutoLocalization().find(item => item.key === key);
    const stored = entry?.translations?.[lang];
    if (typeof stored === 'string' && stored.trim()) return stored;

    const english = entry?.translations?.en;
    if (lang !== 'en' && typeof english === 'string' && english.trim()) return english;
  } catch {
    // Storage is optional during early application bootstrap.
  }

  return fallback;
};
