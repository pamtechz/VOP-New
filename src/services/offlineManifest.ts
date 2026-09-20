export type OfflineManifest = {
  schemaVersion: 1;
  languages: string[];
  /** Human-readable names aligned with languages; supplied by the approved master. */
  languageLabels: string[];
  lessonIds: string[];
  /** Localized titles indexed by [languages index][lessonIds index]. */
  titles: string[][];
  count: number;
  version: string;
};

const languagePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const digestPattern = /^[a-f0-9]{64}$/;

/**
 * The learner catalog comes exclusively from the approved, APK-bundled manifest.
 * No lesson names, language names, translations, IDs or counts are substituted from code.
 * Release checks separately validate its inventory and each title against the JSON.
 */
export function readOfflineManifest(value: unknown): OfflineManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid offline lesson manifest.');
  }
  const manifest = value as Partial<OfflineManifest>;
  const languages = manifest.languages;
  const languageLabels = manifest.languageLabels;
  const lessonIds = manifest.lessonIds;
  const titles = manifest.titles;
  if (manifest.schemaVersion !== 1 || !Array.isArray(languages) ||
      !Array.isArray(languageLabels) || languageLabels.length !== languages.length ||
      !Array.isArray(lessonIds) || languages.length === 0 || lessonIds.length === 0 ||
      !languages.every(lang => typeof lang === 'string' && languagePattern.test(lang)) ||
      !languageLabels.every(label => typeof label === 'string' && label.trim().length > 0) ||
      !lessonIds.every(id => typeof id === 'string' && lessonPattern.test(id)) ||
      new Set(languages).size !== languages.length || new Set(lessonIds).size !== lessonIds.length ||
      !Array.isArray(titles) || titles.length !== languages.length ||
      !titles.every(row => Array.isArray(row) && row.length === lessonIds.length &&
        row.every(title => typeof title === 'string' && title.trim().length > 0)) ||
      !Number.isSafeInteger(manifest.count) ||
      manifest.count !== languages.length * lessonIds.length ||
      typeof manifest.version !== 'string' || !digestPattern.test(manifest.version)) {
    throw new Error('Incomplete or invalid offline lesson manifest. This build must not be distributed.');
  }
  return manifest as OfflineManifest;
}
