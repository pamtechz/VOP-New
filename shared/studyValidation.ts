/**
 * Common study-entry boundaries. These IDs become Firestore document paths;
 * never interpolate a user-supplied slash or a malformed locale.
 */
export function validStudyId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

export function validStudyLanguage(value: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(value);
}

/**
 * A missing, zero or malformed pass mark must not turn a failed quiz into
 * a pass. Stored zero is the legacy "not configured" placeholder.
 * Pass marks are administrator-configured percentages from 1 to 100.
 */
export function configuredPassThreshold(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1 && value <= 100 ? value : null;
}
