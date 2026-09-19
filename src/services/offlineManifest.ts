export type OfflineManifest = {
  schemaVersion: 1;
  languages: string[];
  lessonIds: string[];
  count: number;
  version: string;
};

const languagePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const digestPattern = /^[a-f0-9]{64}$/;

/**
 * The learner catalog is sourced entirely from an approved bundled manifest.
 * Release-time checks independently enforce the expected curriculum size;
 * this parser must never invent or hardcode language or lesson records.
 */
export function readOfflineManifest(value: unknown): OfflineManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid offline lesson manifest.');
  }
  const manifest = value as Partial<OfflineManifest>;
  const languages = manifest.languages;
  const lessonIds = manifest.lessonIds;
  if (manifest.schemaVersion !== 1 || !Array.isArray(languages) ||
      !Array.isArray(lessonIds) || languages.length === 0 || lessonIds.length === 0 ||
      !languages.every(lang => typeof lang === 'string' && languagePattern.test(lang)) ||
      !lessonIds.every(id => typeof id === 'string' && lessonPattern.test(id)) ||
      new Set(languages).size !== languages.length || new Set(lessonIds).size !== lessonIds.length ||
      !Number.isSafeInteger(manifest.count) ||
      manifest.count !== languages.length * lessonIds.length ||
      typeof manifest.version !== 'string' || !digestPattern.test(manifest.version)) {
    throw new Error('Incomplete or invalid offline lesson manifest. This build must not be distributed.');
  }
  return manifest as OfflineManifest;
}
