export type OfflineManifest = {
  schemaVersion: 2;
  languages: string[];
  languageLabels: string[];
  lessonIds: string[];
  titles: string[][];
  count: number;
  version: string;
  assetHashes: Record<string, string>;
};

const languagePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const assetPattern = /^[A-Za-z0-9_.-]{1,100}\.(?:jpg|jpeg|png|gif|webp)$/i;

/** The catalog is approved content, never constructed from demo data or fixed lesson counts. */
export function readOfflineManifest(value: unknown): OfflineManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid offline lesson manifest.');
  }
  const item = value as Partial<OfflineManifest>;
  const { languages, languageLabels, lessonIds, titles, assetHashes } = item;
  if (item.schemaVersion !== 2 || !Array.isArray(languages) || !Array.isArray(languageLabels) ||
    !Array.isArray(lessonIds) || !Array.isArray(titles) || languages.length === 0 || lessonIds.length === 0 ||
    languageLabels.length !== languages.length || titles.length !== languages.length ||
    !languages.every(lang => typeof lang === 'string' && languagePattern.test(lang)) ||
    !lessonIds.every(id => typeof id === 'string' && lessonPattern.test(id)) ||
    new Set(languages).size !== languages.length || new Set(lessonIds).size !== lessonIds.length ||
    !languageLabels.every(label => typeof label === 'string' && label.trim().length > 0) ||
    !titles.every(row => Array.isArray(row) && row.length === lessonIds.length &&
      row.every(title => typeof title === 'string' && title.trim().length > 0)) ||
    !Number.isSafeInteger(item.count) || item.count !== languages.length * lessonIds.length ||
    typeof item.version !== 'string' || !digestPattern.test(item.version) ||
    !assetHashes || typeof assetHashes !== 'object' || Array.isArray(assetHashes) ||
    !Object.entries(assetHashes).every(([filename, hash]) => assetPattern.test(filename) &&
      typeof hash === 'string' && digestPattern.test(hash))) {
    throw new Error('Incomplete offline lesson manifest; do not distribute this build.');
  }
  return item as OfflineManifest;
}
