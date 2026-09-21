#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = input => createHash('sha256').update(input).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
const langPattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const imagePattern = /^assets\/([A-Za-z0-9_.-]{1,100}\.(?:jpg|jpeg|png|gif|webp))$/i;
const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const valid = (condition, message) => { if (!condition) throw new Error(`Android release blocked: ${message}`); };
const readJson = async (path, description) => {
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch { throw new Error(`Android release blocked: missing ${description} (${path}).`); }
  try { return JSON.parse(content); }
  catch { throw new Error(`Android release blocked: malformed ${description}.`); }
};
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));

function checkSnapshot(snapshot, lang, id, title, referencedAssets) {
  const prefix = `snapshot ${lang}/${id}.json`;
  valid(exact(snapshot, ['schemaVersion','language','lessonId','title','pages','quiz','attribution','source','revision']) &&
    snapshot.schemaVersion === 2 && snapshot.language === lang && snapshot.lessonId === id &&
    snapshot.title === title && shaPattern.test(snapshot.revision) &&
    Array.isArray(snapshot.pages) && snapshot.pages.length > 0 && Array.isArray(snapshot.quiz) &&
    (snapshot.attribution === null || typeof snapshot.attribution === 'string') &&
    exact(snapshot.source, ['file','sha256','reportedLessonNumber']) &&
    typeof snapshot.source.file === 'string' && snapshot.source.file.trim() &&
    shaPattern.test(snapshot.source.sha256) &&
    (snapshot.source.reportedLessonNumber === null || Number.isSafeInteger(snapshot.source.reportedLessonNumber)),
    `${prefix}: invalid source identity or schema.`);
  for (const [i, page] of snapshot.pages.entries()) {
    valid(exact(page, ['pageNumber','title','blocks']) && page.pageNumber === i + 1 &&
      typeof page.title === 'string' && !!page.title.trim() && Array.isArray(page.blocks) &&
      page.blocks.length > 0 && page.blocks.some(block => block.type === 'text'),
      `${prefix}: invalid reading section ${i + 1}.`);
    for (const block of page.blocks) {
      if (block.type === 'text') {
        valid(exact(block, ['type','text']) && typeof block.text === 'string' && !!block.text.trim(),
          `${prefix}: invalid paragraph text.`);
      } else {
        const match = block.type === 'image' && typeof block.src === 'string' && imagePattern.exec(block.src);
        valid(match && exact(block, ['type','src','alt']) && typeof block.alt === 'string',
          `${prefix}: unsafe or invalid image block.`);
        referencedAssets.add(match[1]);
      }
    }
  }
  const questions = new Set();
  for (const q of snapshot.quiz) {
    valid(exact(q, ['id','prompt','options','correctOptionIndex']) && idPattern.test(q.id) &&
      !questions.has(q.id) && typeof q.prompt === 'string' && !!q.prompt.trim() &&
      Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6 &&
      q.options.every(option => typeof option === 'string' && !!option.trim()) &&
      Number.isInteger(q.correctOptionIndex) && q.correctOptionIndex >= 0 && q.correctOptionIndex < q.options.length,
      `${prefix}: invalid approved question.`);
    questions.add(q.id);
  }
  const { revision, ...payload } = snapshot;
  valid(digest(JSON.stringify(payload)) === revision, `${prefix}: content hash mismatch.`);
  return revision;
}

/** Read-only: does not create projects, seed a database, or deploy security rules. */
export async function validateAndroidRelease(root, environment) {
  const deployment = await readJson(join(root, 'config/deployment-policy.json'), 'deployment policy');
  valid(exact(deployment, ['schemaVersion','firebaseProjectId','androidPackageName']) &&
    deployment.schemaVersion === 1 && typeof deployment.firebaseProjectId === 'string' &&
    deployment.firebaseProjectId.trim() && packagePattern.test(deployment.androidPackageName),
    'invalid Firebase/Android deployment policy.');
  const { firebaseProjectId: project, androidPackageName: appId } = deployment;
  const config = await readJson(join(root, 'android/app/google-services.json'), 'Android Firebase registration');
  valid(config?.project_info?.project_id === project, 'Android Firebase registration has the wrong project ID.');
  const projectNumber = String(config.project_info.project_number ?? '');
  valid(/^\d+$/.test(projectNumber), 'Android Firebase sender ID is missing.');
  const client = config.client?.find(item => item?.client_info?.android_client_info?.package_name === appId);
  valid(client && String(client.client_info.mobilesdk_app_id ?? '').startsWith(`1:${projectNumber}:android:`),
    `register ${appId} in the correct Firebase project.`);
  const oauth = [...(client.oauth_client ?? []), ...(client.services?.appinvite_service?.other_platform_oauth_client ?? [])];
  valid(oauth.some(item => item.client_type === 1 && item.android_info?.package_name === appId &&
    /^[a-fA-F0-9]{40}$/.test(item.android_info?.certificate_hash ?? '')),
    'missing Google sign-in signing SHA-1 fingerprint.');
  valid(oauth.some(item => item.client_type === 3 && typeof item.client_id === 'string' && !!item.client_id),
    'missing Web OAuth client for Google sign-in.');
  valid(environment.VITE_FIREBASE_PROJECT_ID === project && typeof environment.VITE_FIREBASE_API_KEY === 'string' &&
    environment.VITE_FIREBASE_API_KEY.trim() && typeof environment.VITE_FIREBASE_AUTH_DOMAIN === 'string' &&
    environment.VITE_FIREBASE_AUTH_DOMAIN.trim() &&
    environment.VITE_FIREBASE_APP_ID?.startsWith(`1:${projectNumber}:web:`),
    'Web Firebase configuration is missing or belongs to another project.');
  const [capacitor, gradle] = await Promise.all([
    readFile(join(root, 'capacitor.config.ts'), 'utf8'),
    readFile(join(root, 'android/app/build.gradle'), 'utf8'),
  ]);
  valid(capacitor.includes(`appId: '${appId}'`) && gradle.includes(`applicationId "${appId}"`) &&
    gradle.includes(`namespace = "${appId}"`), 'Capacitor/Gradle Android identities do not match the deployment policy.');

  const policy = await readJson(join(root, 'config/curriculum-policy.json'), 'curriculum policy');
  valid(policy?.schemaVersion === 1 && Number.isSafeInteger(policy.expectedLanguageCount) &&
    policy.expectedLanguageCount > 0 && Number.isSafeInteger(policy.expectedLessonCount) &&
    policy.expectedLessonCount > 0, 'invalid approved curriculum policy.');
  const dir = join(root, 'public/lessons');
  const manifest = await readJson(join(dir, 'manifest.json'), 'packaged lesson manifest');
  const { languages, languageLabels, lessonIds, titles, assetHashes } = manifest;
  valid(exact(manifest, ['schemaVersion','languages','languageLabels','lessonIds','titles','count','version','assetHashes']) &&
    manifest.schemaVersion === 2 && Array.isArray(languages) && Array.isArray(lessonIds) &&
    languages.length === policy.expectedLanguageCount && lessonIds.length === policy.expectedLessonCount &&
    languages.every(item => typeof item === 'string' && langPattern.test(item)) &&
    lessonIds.every(item => typeof item === 'string' && idPattern.test(item)) &&
    new Set(languages).size === languages.length && new Set(lessonIds).size === lessonIds.length &&
    Array.isArray(languageLabels) && languageLabels.length === languages.length &&
    languageLabels.every(item => typeof item === 'string' && !!item.trim()) &&
    Array.isArray(titles) && titles.length === languages.length &&
    titles.every(row => Array.isArray(row) && row.length === lessonIds.length &&
      row.every(item => typeof item === 'string' && !!item.trim())) &&
    manifest.count === languages.length * lessonIds.length && shaPattern.test(manifest.version) &&
    assetHashes && typeof assetHashes === 'object' && !Array.isArray(assetHashes),
    'approved localized catalog is missing or incomplete.');
  const revisions = [];
  const referencedAssets = new Set();
  for (const [langIndex, lang] of languages.entries()) {
    for (const [lessonIndex, id] of lessonIds.entries()) {
      const snapshot = await readJson(join(dir, lang, `${id}.json`), `snapshot ${lang}/${id}.json`);
      revisions.push([`${lang}/${id}`, checkSnapshot(snapshot, lang, id, titles[langIndex][lessonIndex], referencedAssets)]);
    }
  }
  valid(digest(JSON.stringify(revisions.sort())) === manifest.version, 'lesson manifest content hashes do not match.');
  valid(Object.keys(assetHashes).length === referencedAssets.size &&
    Object.keys(assetHashes).every(name => referencedAssets.has(name) && shaPattern.test(assetHashes[name])),
    'image manifest does not match the exact referenced image inventory.');
  for (const filename of referencedAssets) {
    const data = await readFile(join(dir, 'assets', filename));
    valid(digest(data) === assetHashes[filename], `corrupted or tampered bundled image ${filename}.`);
  }
  return { project, packageName: appId, snapshotCount: manifest.count, imageCount: referencedAssets.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { loadEnv } = await import('vite');
  validateAndroidRelease(root, loadEnv('production', root, 'VITE_'))
    .then(result => console.log(`Verified ${result.snapshotCount} lessons and ${result.imageCount} images for ${result.packageName}.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
