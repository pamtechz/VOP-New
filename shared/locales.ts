/** Derive standard aliases without maintaining a hardcoded language registry. */
export function localeAliases(code: string, configured: unknown = []): string[] {
  const aliases = new Set<string>([code]);
  for (const value of [code, ...(Array.isArray(configured) ? configured : [])]) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) continue;
    aliases.add(normalized);
    try { aliases.add(Intl.getCanonicalLocales(normalized)[0].toLowerCase()); }
    catch { /* Preserve valid administrator-defined codes unknown to this runtime. */ }
  }
  return [...aliases];
}

/** English is the authored source, never a translation destination. */
export function isEnglishLocale(value: unknown): boolean {
  const code = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  return localeAliases(code).some(alias => /^(?:en|eng)(?:-|$)/.test(alias));
}
