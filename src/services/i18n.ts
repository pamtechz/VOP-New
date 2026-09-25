import { useSyncExternalStore } from 'react';
import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { getStoredAutoLocalization, registerLocalizationString } from './storage';

const UI_LOCALE_KEY = 'vop_ui_locale';
const dictionaryCache: Record<string, Record<string,string>> = {};
const localeFallbacks: Record<string, string> = {};
const localeState = { value: '', version: 0 };
const localeRegistry: CustomLanguage[] = [];
let localeRegistryLoaded = false;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(listener => listener()); }
function normalizeLocale(value: unknown) { return String(value || '').trim().toLowerCase(); }
function isLocale(value: unknown) { return /^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(String(value || '').trim()); }

function humanizeTranslationKey(key: string): string {
  const segment = String(key || '').split('.').pop() || String(key || '');
  const readable = segment.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (!readable) return 'Text unavailable';
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function usableTranslation(value: unknown, key: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text === key) return undefined;
  if (/^[a-z][a-z0-9_-]*\.[a-z0-9_.-]+$/i.test(text) && text.toLowerCase() === key.toLowerCase()) return undefined;
  return text;
}

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  const fromSettings = settings?.customLanguages ?? [];
  const fromRegistry = getAvailableUiLocales();
  const map = new Map<string, CustomLanguage>();
  [...fromSettings, ...fromRegistry].forEach(language => {
    if (language && language.enabled !== false && language.code && language.code.trim()) {
      const code = language.code.trim().toLowerCase();
      if (!map.has(code) || (language.nativeName && language.nativeName !== code)) {
        map.set(code, { code, name: String(language.name || code).trim(), nativeName: String(language.nativeName || language.name || code).trim(), enabled: language.enabled === true, sortOrder: Number(language.sortOrder ?? 0), rtl: language.rtl === true });
      }
    }
  });
  if (map.size === 0) map.set('en', { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 0, rtl: false });
  return [...map.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
};

export const getAvailableUiLocales = (): CustomLanguage[] => [...localeRegistry];

export async function loadUiLocaleRegistry(): Promise<CustomLanguage[]> {
  if (localeRegistryLoaded) return [...localeRegistry];
  try {
    const response = await fetch('/api/localization', { headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error('Locale registry unavailable.');
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    localeRegistry.splice(0, localeRegistry.length, ...items.filter((item: any) => item && item.enabled !== false && typeof item.code === 'string').map((item: any) => ({ code:String(item.code).trim().toLowerCase(), name:String(item.name || item.code).trim(), nativeName:String(item.nativeName || item.name || item.code).trim(), enabled:true, sortOrder:Number(item.sortOrder || 0), rtl:item.direction === 'rtl' || item.rtl === true })).sort((a:CustomLanguage,b:CustomLanguage) => (a.sortOrder ?? 0)-(b.sortOrder ?? 0) || a.name.localeCompare(b.name)));
    localeRegistryLoaded = true;
  } catch {
    if (!localeRegistry.some(item => item.code === 'en')) localeRegistry.push({code:'en',name:'English',nativeName:'English',enabled:true,sortOrder:0,rtl:false});
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
  localeState.version += 1;
  notify();
  void loadUiLocale(normalized);
};

export async function loadUiLocale(locale: LanguageCode, fallback = 'en'): Promise<void> {
  const requested = normalizeLocale(locale) || fallback;
  if (dictionaryCache[requested]) {
    localeState.value = requested;
    localeState.version += 1;
    notify();
    return;
  }
  try {
    const response = await fetch(`/api/localization?locale=${encodeURIComponent(requested)}`, { headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error(`Locale ${requested} is unavailable.`);
    const payload = await response.json();
    dictionaryCache[requested] = payload?.translations && typeof payload.translations === 'object' ? payload.translations as Record<string,string> : {};
    localeFallbacks[requested] = normalizeLocale(payload?.fallback) || 'en';
    document.documentElement.dir = payload?.direction === 'rtl' ? 'rtl' : 'ltr';
    document.documentElement.lang = requested;
    localeState.value = requested;
    localeState.version += 1;
    notify();
    const configuredFallback = localeFallbacks[requested] && localeFallbacks[requested] !== requested ? localeFallbacks[requested] : fallback;
    if (configuredFallback !== requested && !dictionaryCache[configuredFallback]) await loadUiLocale(configuredFallback, 'en');
    if (configuredFallback !== 'en' && !dictionaryCache.en) await loadUiLocale('en', 'en');
  } catch {
    if (requested !== fallback && !dictionaryCache[fallback]) {
      try { await loadUiLocale(fallback, fallback); } catch { /* developer fallback remains available */ }
    }
  }
}

export function useLocalization(settings?: AppSettings) {
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
  const locale = getUiLocale(settings);
  const snapshot = () => `${localeState.value || locale}:${localeState.version}`;
  const currentSnapshot = useSyncExternalStore(subscribe, snapshot, snapshot);
  const current = currentSnapshot.split(':')[0] || locale;
  return {
    locale: current,
    t: (key: string, defaultFallback?: string, vars?: Record<string,string|number>) => getTranslation(key, current, settings?.customTranslations, defaultFallback, undefined, vars),
  };
}

export const getTranslation = (key: string, requestedLocale: LanguageCode = 'en', customTranslations?: Record<string, Record<string, string>>, defaultFallback?: string, componentName?: string, vars?: Record<string,string|number>): string => {
  const registryKey = String(key || '').trim();
  const explicitLocale = normalizeLocale(requestedLocale);
  const legacyFallback = !isLocale(explicitLocale) && !defaultFallback ? explicitLocale : '';
  const fallback = String(defaultFallback || legacyFallback || '').trim() || humanizeTranslationKey(registryKey);
  try { registerLocalizationString(registryKey, fallback, componentName); } catch { /* discovery is non-blocking */ }
  const locale = explicitLocale || getUiLocale();
  const stored = (() => { try { return getStoredAutoLocalization().find(item => item.key === registryKey)?.translations?.[locale]; } catch { return undefined; } })();
  const fallbackLocale = localeFallbacks[locale] && localeFallbacks[locale] !== locale ? localeFallbacks[locale] : '';
  const candidates = [dictionaryCache[locale]?.[registryKey], customTranslations?.[locale]?.[registryKey], stored, fallbackLocale ? dictionaryCache[fallbackLocale]?.[registryKey] : undefined, fallbackLocale ? customTranslations?.[fallbackLocale]?.[registryKey] : undefined, locale !== 'en' ? dictionaryCache.en?.[registryKey] : undefined, locale !== 'en' ? customTranslations?.en?.[registryKey] : undefined];
  let value = candidates.map(candidate => usableTranslation(candidate, registryKey)).find(Boolean) || fallback;
  if (!usableTranslation(value, registryKey)) value = humanizeTranslationKey(registryKey);
  if (vars) value = value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
  return value;
};

export const initializeLocalization = async (settings?: AppSettings) => {
  const locale = getUiLocale(settings);
  localeState.value = locale;
  localeState.version += 1;
  await Promise.all([loadUiLocaleRegistry(), loadUiLocale(locale, 'en')]);
};

export { getActiveLanguage, setActiveLanguage } from './storage';
