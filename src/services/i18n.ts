import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { getStoredAutoLocalization, registerLocalizationString } from './storage';

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  return (settings?.customLanguages ?? [])
    .filter(language => language.enabled !== false && language.code.trim() && language.name.trim())
    .map(language => ({ ...language, code: language.code.trim().toLowerCase() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
};

/**
 * Translation strings are deliberately not stored in source-code dictionaries.
 *
 * Every call to getTranslation() is an automatic discovery point. The caller
 * may provide its English source text as the fallback argument; otherwise a
 * readable label is derived from the key. Administrators then translate the
 * discovered entry for any language configured by the administrator.
 */
function humanizeTranslationKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase()) || key;
}

export const getTranslation = (
  key: string,
  lang: LanguageCode = '',
  customTranslations?: Record<string, Record<string, string>>,
  defaultFallback?: string,
  componentName?: string
): string => {
  const fallbackText = String(defaultFallback || humanizeTranslationKey(key));

  // Every translation call is an automatic discovery point. This is the
  // mechanism that keeps new UI strings out of a manually maintained key list.
  try {
    registerLocalizationString(key, fallbackText, componentName);
  } catch {
    // Discovery must never prevent the interface from rendering.
  }

  const customValue = customTranslations?.[lang]?.[key];
  if (typeof customValue === 'string' && customValue.trim()) {
    return customValue;
  }

  try {
    const entry = getStoredAutoLocalization().find(item => item.key === key);
    const translated = entry?.translations?.[lang];
    if (typeof translated === 'string' && translated.trim()) {
      return translated;
    }
  } catch {
    // Local discovery cache is optional; the configured translation store
    // supplied by the application remains the authoritative source.
  }

  // No language dictionary is embedded in the application. Until an
  // administrator supplies a translation, display the discovered source text.
  return fallbackText;
};
