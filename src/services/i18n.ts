import { useSyncExternalStore } from 'react';
import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { registerLocalizationString } from './storage';
import { auth } from '../lib/firebase';

const UI_LOCALE_KEY = 'vop_ui_locale';
const dictionaryCache: Record<string, Record<string,string>> = {};
const localeFallbacks: Record<string, string> = {};
const localeState = { value: '', version: 0 };
const localeRegistry: CustomLanguage[] = [];
const localeAliases: Record<string,string> = {};
let localeRegistryLoaded = false;
let localeAccountScope = '';
let localeOrganizationScope = '';
const listeners = new Set<() => void>();
let localeRequest = 0;

function notify() { listeners.forEach(listener => listener()); }
function clearForAccountChange() {
  const next=(auth?.currentUser?.uid || '')+'|'+localeOrganizationScope;
  if(next===localeAccountScope)return;
  localeAccountScope=next;
  Object.keys(dictionaryCache).forEach(key=>delete dictionaryCache[key]);
  Object.keys(localeFallbacks).forEach(key=>delete localeFallbacks[key]);
  Object.keys(localeDirections).forEach(key=>delete localeDirections[key]);
  Object.keys(localeAliases).forEach(key=>delete localeAliases[key]);
  localeRegistry.splice(0,localeRegistry.length);
  localeRegistryLoaded=false;
  localeState.version++;
  notify();
}
/** Distinguish every tenant context even when a single user belongs to
 * multiple organizations. Never reuse private labels across tenant switches. */
export function setLocalizationOrganizationScope(organizationId:string) {
  const next=String(organizationId||'').trim();
  if(next===localeOrganizationScope)return;
  localeOrganizationScope=next;
  clearForAccountChange();
}
async function localeHeaders():Promise<Record<string,string>> {
  const result:Record<string,string>={Accept:'application/json'};
  if(auth?.currentUser) {
    try { result.Authorization='Bearer '+await auth.currentUser.getIdToken(); }
    catch { /* Anonymous public locale fallback remains available. */ }
  }
  return result;
}
function normalizeLocale(value: unknown) { return String(value || '').trim().toLowerCase(); }
function isLocale(value: unknown) { return /^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(String(value || '').trim()); }
function resolveRegisteredLocale(value: unknown) {
  const requested = normalizeLocale(value);
  return localeAliases[requested] || requested;
}

export function humanizeTranslationKey(key: string): string {
  const segment = String(key || '').split('.').pop() || String(key || '');
  const readable = segment.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (!readable) return 'Text unavailable';
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function usableTranslation(value: unknown, key: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text === key) return undefined;
  if (/^(?:common|navigation|home|discover|guides|lessons|lesson|quiz|curriculum|progress|certificates|profile|account|radio|materials|admin|organizations|users|translations|validation|errors)\.[a-z0-9_.-]+$/i.test(text)) return undefined;
  return text;
}

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  const registry = getAvailableUiLocales();
  const source = registry.length > 0 ? registry : (settings?.customLanguages ?? []);
  const map = new Map<string, CustomLanguage>();
  source.forEach(language => {
    if (!language || language.enabled === false) return;
    const code = String(language.code || '').trim().toLowerCase();
    if (!code) return;
    const name = String(language.name || code).trim();
    const nativeName = String(language.nativeName || name).trim();
    map.set(code, { code, name, nativeName, enabled: true, sortOrder: Number(language.sortOrder ?? 0), rtl: language.rtl === true });
  });
  return [...map.values()].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)||a.name.localeCompare(b.name));
};

export const getAvailableUiLocales = (): CustomLanguage[] => [...localeRegistry];

export async function loadUiLocaleRegistry(): Promise<CustomLanguage[]> {
  clearForAccountChange();
  try {
    const response = await fetch('/api/localization', { headers:await localeHeaders() });
    if (!response.ok) throw new Error('Locale registry unavailable.');
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    localeRegistry.splice(0, localeRegistry.length);
    Object.keys(localeAliases).forEach(key => delete localeAliases[key]);
    items.filter((item: any) => item && item.enabled !== false && typeof item.code === 'string').forEach((item: any) => {
      const code = String(item.code).trim().toLowerCase();
      const language = { code, name:String(item.name || code).trim(), nativeName:String(item.nativeName || item.name || code).trim(), enabled:true, sortOrder:Number(item.sortOrder || 0), rtl:item.direction === 'rtl' || item.rtl === true } as CustomLanguage;
      localeRegistry.push(language);
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      aliases.forEach((alias: unknown) => {
        const normalized = normalizeLocale(alias);
        if (normalized && normalized !== code) localeAliases[normalized] = code;
      });
    });
    localeRegistry.forEach(language => { localeAliases[language.code] = language.code; });
    localeRegistry.sort((a:CustomLanguage,b:CustomLanguage) => (a.sortOrder ?? 0)-(b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    localeRegistryLoaded = true;
  } catch {
    if (!localeRegistry.some(item => item.code === 'en')) localeRegistry.push({code:'en',name:'English',nativeName:'English',enabled:true,sortOrder:0,rtl:false});
  }
  notify();
  return [...localeRegistry];
}

export const getUiLocale = (settings?: AppSettings): LanguageCode => {
  const stored = resolveRegisteredLocale(localStorage.getItem(UI_LOCALE_KEY));
  if (stored) return stored;
  const configured = resolveRegisteredLocale(settings?.defaultLanguage);
  return resolveRegisteredLocale(localeState.value) || configured || 'en';
};

export const setUiLocale = (locale: LanguageCode) => {
  const normalized = resolveRegisteredLocale(locale) || 'en';
  localStorage.setItem(UI_LOCALE_KEY, normalized);
  localeState.value = normalized;
  localeState.version += 1;
  notify();
  void loadUiLocale(normalized, 'en', true);
};

async function loadDictionary(locale: string, fallback: string, visited = new Set<string>()): Promise<void> {
  clearForAccountChange();
  const requested = resolveRegisteredLocale(locale);
  if (!requested || visited.has(requested)) return;
  visited.add(requested);
  if (!dictionaryCache[requested]) {
    const response = await fetch(`/api/localization?locale=${encodeURIComponent(requested)}`, { headers:await localeHeaders() });
    if (!response.ok) throw new Error(`Locale ${requested} is unavailable.`);
    const payload = await response.json();
    dictionaryCache[requested] = payload?.translations && typeof payload.translations === 'object' ? payload.translations : {};
    localeFallbacks[requested] = resolveRegisteredLocale(payload?.fallback || fallback);
    localeDirections[requested] = payload?.direction === 'rtl' ? 'rtl' : 'ltr';
  }
  const next = localeFallbacks[requested];
  if (next && !visited.has(next)) {
    try { await loadDictionary(next, fallback, visited); } catch { /* Keep the selected dictionary when fallback is unavailable. */ }
  }
}

const localeDirections: Record<string, 'rtl' | 'ltr'> = {};
export async function loadUiLocale(locale: LanguageCode, fallback = 'en', force = false): Promise<void> {
  const request = ++localeRequest;
  clearForAccountChange();
  if (!localeRegistryLoaded) await loadUiLocaleRegistry();
  const requested = resolveRegisteredLocale(locale) || resolveRegisteredLocale(fallback);
  if (force) delete dictionaryCache[requested];
  try {
    await loadDictionary(requested, fallback);
    if (request !== localeRequest) return;
    document.documentElement.dir = localeDirections[requested] || 'ltr';
    document.documentElement.lang = requested;
    localeState.value = requested;
    localeState.version += 1;
    notify();
  } catch {
    // Populate a fallback without changing the user's selected UI language.
    try { await loadDictionary(fallback, fallback); } catch { /* Developer labels remain available. */ }
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

function translatedValue(dictionary: Record<string, string> | undefined, key: string): string | undefined {
  if (!dictionary) return undefined;
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
  // Legacy catalogues stored app_title before the common.app_title namespace.
  const legacyKey = key.split('.').pop() || key;
  return Object.prototype.hasOwnProperty.call(dictionary, legacyKey) ? dictionary[legacyKey] : undefined;
}

export const getTranslation = (key: string, requestedLocale: LanguageCode = '', customTranslations?: Record<string, Record<string, string>>, defaultFallback?: string, componentName?: string, vars?: Record<string,string|number>): string => {
  const registryKey = String(key || '').trim();
  const explicitLocale = resolveRegisteredLocale(requestedLocale);
  const legacyFallback = requestedLocale && !customTranslations && defaultFallback === undefined && (!isLocale(requestedLocale) || requestedLocale !== requestedLocale.toLowerCase()) ? requestedLocale : '';
  const fallback = usableTranslation(defaultFallback || legacyFallback, registryKey) || humanizeTranslationKey(registryKey);
  try { registerLocalizationString(registryKey, fallback, componentName); } catch { /* discovery is non-blocking */ }
  const locale = legacyFallback ? getUiLocale() : explicitLocale || getUiLocale();
  const custom = dictionaryCache[locale] ? undefined : customTranslations?.[locale];
  const fallbackLocale = localeFallbacks[locale] && localeFallbacks[locale] !== locale ? localeFallbacks[locale] : '';
  const candidates = [translatedValue(dictionaryCache[locale], registryKey), translatedValue(custom, registryKey), fallbackLocale ? translatedValue(dictionaryCache[fallbackLocale], registryKey) : undefined, fallbackLocale && !dictionaryCache[fallbackLocale] ? translatedValue(customTranslations?.[fallbackLocale], registryKey) : undefined, locale !== 'en' ? dictionaryCache.en?.[registryKey] : undefined, locale !== 'en' ? customTranslations?.en?.[registryKey] : undefined];
  let value = candidates.map(candidate => usableTranslation(candidate, registryKey)).find(Boolean) || fallback;
  if (!usableTranslation(value, registryKey)) value = humanizeTranslationKey(registryKey);
  if (vars) value = value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
  return value;
};

export const refreshUiLocale = async (locale?: LanguageCode): Promise<void> => {
  const requested = resolveRegisteredLocale(locale || localeState.value || getUiLocale());
  await loadUiLocale(requested, 'en', true);
};

if (typeof window !== 'undefined') {
  window.addEventListener('vop_ui_translation_updated', event => {
    const detail = (event as CustomEvent<{locale?: string}>).detail;
    const current = resolveRegisteredLocale(localeState.value || getUiLocale());
    const changed = resolveRegisteredLocale(detail?.locale || '');
    if (!changed || changed === current) void refreshUiLocale(current);
  });
}

export const initializeLocalization = async (settings?: AppSettings) => {
  const locale = getUiLocale(settings);
  localeState.value = locale;
  localeState.version += 1;
  await loadUiLocaleRegistry();
  await loadUiLocale(locale, 'en');
};

export { getActiveLanguage, setActiveLanguage } from './storage';

/** Source labels must stay English even while the interface is translated. */
export function translationSourceLabel(key: string, source?: string): string {
  return usableTranslation(source, key) || humanizeTranslationKey(key);
}
