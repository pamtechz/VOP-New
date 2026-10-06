/**
 * Enterprise Input Sanitization & Anti-XSS / Anti-SQLi Protection Utility
 */

/**
 * Escapes HTML characters to prevent XSS (Cross-Site Scripting) injection attacks.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Strips dangerous script tags, event handlers (onload, onerror), and javascript: URIs.
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:[^\s]+/gi, '');
}

/**
 * Sanitizes search queries to prevent wildcard or SQL escape sequence abuse.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';
  return query
    .trim()
    .replace(/[%_\\]/g, '\\$&') // Escape SQL LIKE wildcards
    .slice(0, 100); // Enforce maximum search length
}
