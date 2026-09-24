import { useSyncExternalStore } from 'react';
import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { getStoredAutoLocalization, registerLocalizationString } from './storage';

const UI_LOCALE_KEY = 'vop_ui_locale';
const dictionaryCache: Record<string, Record<string,string>> = {};
const localeFallbacks: Record<string, string> = {};
const localeState = { value: '' };
const localeRegistry: CustomLanguage[] = [];
let localeRegistryLoaded = false;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(listener => listener()); }
function normalizeLocale(value: unknown) { return String(value || '').trim().toLowerCase(); }

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  return (settings?.customLanguages ?? [])
    .filter(language => language.enabled !== false && language.code.trim() && language.name.trim())
    .map(language => ({ ...language, code: language.code.trim().toLowerCase() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
};

export const getAvailableUiLocales = (): CustomLanguage[] => [...localeRegistry];

export async function loadUiLocaleRegistry(): Promise<CustomLanguage[]> {
  if (localeRegistryLoaded) return [...localeRegistry];
  try {
    const response = await fetch('/api/localization', { headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error('Locale registry unavailable.');
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    localeRegistry.splice(0, localeRegistry.length, ...items
      .filter((item: any) => item && item.enabled !== false && typeof item.code === 'string')
      .map((item: any) => ({
        code:String(item.code).trim().toLowerCase(),
        name:String(item.name || item.code).trim(),
        nativeName:String(item.nativeName || item.name || item.code).trim(),
        enabled:true,
        sortOrder:Number(item.sortOrder || 0),
        rtl:item.direction === 'rtl' || item.rtl === true,
      }))
      .sort((a:CustomLanguage,b:CustomLanguage) => (a.sortOrder ?? 0)-(b.sortOrder ?? 0) || a.name.localeCompare(b.name)));
    localeRegistryLoaded = true;
  } catch {
    if (!localeRegistry.some(item => item.code === 'en')) {
      localeRegistry.push({code:'en',name:'English',nativeName:'English',enabled:true,sortOrder:0,rtl:false});
    }
  }
  notify();
  return [...localeRegistry];
}

export const getUiLocale = (settings?: AppSettings): LanguageCode => {
  const stored = normalizeLocale(localStorage.getItem(UI_LOCALE_KEY));
  if (stored) return stored;
  const configured = normalizeLocale(settings?.defaultLanguage);
  return configured || 'en';
};

export const setUiLocale = (locale: LanguageCode) => {
  const normalized = normalizeLocale(locale) || 'en';
  localStorage.setItem(UI_LOCALE_KEY, normalized);
  localeState.value = normalized;
  notify();
  void loadUiLocale(normalized);
};

export async function loadUiLocale(locale: LanguageCode, fallback = 'en'): Promise<void> {
  const requested = normalizeLocale(locale) || fallback;
  if (dictionaryCache[requested]) return;
  try {
    const response = await fetch(`/api/localization?locale=${encodeURIComponent(requested)}`, { headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error(`Locale ${requested} is unavailable.`);
    const payload = await response.json();
    dictionaryCache[requested] = payload?.translations && typeof payload.translations === 'object'
      ? payload.translations as Record<string,string>
      : {};
    localeFallbacks[requested] = normalizeLocale(payload?.fallback) || 'en';
    document.documentElement.dir = payload?.direction === 'rtl' ? 'rtl' : 'ltr';
    document.documentElement.lang = requested;
    notify();
    const configuredFallback = localeFallbacks[requested] && localeFallbacks[requested] !== requested
      ? localeFallbacks[requested]
      : fallback;
    if (configuredFallback !== requested && !dictionaryCache[configuredFallback]) {
      await loadUiLocale(configuredFallback, 'en');
    }
    if (configuredFallback !== 'en' && !dictionaryCache.en) {
      await loadUiLocale('en', 'en');
    }
  } catch {
    if (requested !== fallback && !dictionaryCache[fallback]) {
      try { await loadUiLocale(fallback, fallback); } catch { /* developer fallback remains available */ }
    }
  }
}

export function useLocalization(settings?: AppSettings) {
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
  const locale = getUiLocale(settings);
  const snapshot = () => localeState.value || locale;
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    locale: current,
    t: (key: string, defaultFallback?: string, vars?: Record<string,string|number>) =>
      getTranslation(key, current, settings?.customTranslations, defaultFallback, undefined, vars),
  };
}

/**
 * The explicit language parameter remains for backwards compatibility.
 * UI strings resolve from the independent UI locale, never from study-language state.
 */
export const getTranslation = (
  key: string,
  _legacyLang: LanguageCode = 'en',
  customTranslations?: Record<string, Record<string, string>>,
  defaultFallback?: string,
  componentName?: string,
  vars?: Record<string,string|number>
): string => {
  const fallback = String(defaultFallback || key).trim() || key;
  const locale = getUiLocale();
  try { registerLocalizationString(key, fallback, componentName); } catch { /* discovery is non-blocking */ }

  const stored = (() => {
    try { return getStoredAutoLocalization().find(item => item.key === key)?.translations?.[locale]; } catch { return undefined; }
  })();

  let value = [
    dictionaryCache[locale]?.[key],
    customTranslations?.[locale]?.[key],
    stored,
    localeFallbacks[locale] && localeFallbacks[locale] !== locale ? dictionaryCache[localeFallbacks[locale]]?.[key] : undefined,
    localeFallbacks[locale] && localeFallbacks[locale] !== locale ? customTranslations?.[localeFallbacks[locale]]?.[key] : undefined,
    locale !== 'en' ? dictionaryCache.en?.[key] : undefined,
    locale !== 'en' ? customTranslations?.en?.[key] : undefined,
    fallback
  ].find(item => typeof item === 'string' && item.trim()) || fallback;

  if (vars) {
    value = value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
  }
  return value;
};

export const initializeLocalization = async (settings?: AppSettings) => {
  const locale = getUiLocale(settings);
  localeState.value = locale;
  await Promise.all([loadUiLocaleRegistry(), loadUiLocale(locale, 'en')]);
};

export { getActiveLanguage, setActiveLanguage } from './storage';
