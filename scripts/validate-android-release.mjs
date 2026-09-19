#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Project and Android package are pinned deployment identities, not learner data.
const EXPECTED_PROJECT = 'voiceofprophecy';
const EXPECTED_PACKAGE = 'com.sda.vop';
const languagePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function requireValid(condition, reason) {
  if (!condition) throw new Error(`Android release blocked: ${reason}`);
}

async function jsonFile(path, description) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch { throw new Error(`Android release blocked: missing ${description} (${path}).`); }
  try { return JSON.parse(text); }
  catch { throw new Error(`Android release blocked: invalid JSON in ${description}.`); }
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Only allow the generated schema, not arbitrary metadata or an empty placeholder file. */
function validateSnapshot(snapshot, language, lessonId) {
  const label = `snapshot ${language}/${lessonId}.json`;
  requireValid(exactKeys(snapshot, ['schemaVersion', 'language', 'lessonId', 'title', 'pages', 'quiz', 'revision']) &&
    snapshot.schemaVersion === 1 && snapshot.language === language && snapshot.lessonId === lessonId &&
    typeof snapshot.title === 'string' && !!snapshot.title.trim() &&
    Array.isArray(snapshot.pages) && snapshot.pages.length === 20 &&
    Array.isArray(snapshot.quiz) && snapshot.quiz.length === 5 && digestPattern.test(snapshot.revision),
  `${label} has an invalid schema or identity.`);
  snapshot.pages.forEach((page, index) => {
    requireValid(exactKeys(page, ['pageNumber', 'title', 'content']) && page.pageNumber === index + 1 &&
      typeof page.title === 'string' && !!page.title.trim() &&
      typeof page.content === 'string' && !!page.content.trim(),
    `${label}: reading page ${index + 1} is invalid.`);
  });
  const ids = new Set();
  snapshot.quiz.forEach((question, index) => {
    requireValid(exactKeys(question, ['id', 'prompt', 'options', 'correctOptionIndex']) &&
      typeof question.id === 'string' && lessonPattern.test(question.id) && !ids.has(question.id) &&
      typeof question.prompt === 'string' && !!question.prompt.trim() &&
      Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6 &&
      question.options.every(option => typeof option === 'string' && !!option.trim()) &&
      Number.isInteger(question.correctOptionIndex) && question.correctOptionIndex >= 0 &&
      question.correctOptionIndex < question.options.length,
    `${label}: quiz question ${index + 1} is invalid.`);
    ids.add(question.id);
  });
  // Match the generator's canonical object property order and SHA-256 calculation.
  const payload = {
    schemaVersion: 1, language, lessonId, title: snapshot.title,
    pages: snapshot.pages, quiz: snapshot.quiz,
  };
  requireValid(hash(payload) === snapshot.revision, `${label} content does not match its revision hash.`);
  return snapshot.revision;
}

/** Read-only checks. Never create a Firebase app, deploy rules, or copy an untrusted config. */
export async function validateAndroidRelease(root, environment) {
  const configPath = join(root, 'android/app/google-services.json');
  const config = await jsonFile(configPath, 'Firebase Android registration');
  requireValid(config?.project_info?.project_id === EXPECTED_PROJECT,
    `google-services.json must belong to Firebase project ${EXPECTED_PROJECT}.`);
  const senderId = String(config.project_info.project_number ?? '');
  requireValid(/^\d+$/.test(senderId), 'Firebase Android project number is missing.');
  const matchingClient = config.client?.find(client => client?.client_info?.android_client_info?.package_name === EXPECTED_PACKAGE);
  requireValid(Boolean(matchingClient), `register Android package ${EXPECTED_PACKAGE} in the existing Firebase project and download its matching google-services.json.`);
  requireValid(/^1:\d+:android:[a-zA-Z0-9]+$/.test(matchingClient.client_info.mobilesdk_app_id ?? ''), 'Android Firebase app ID is invalid.');
  requireValid(matchingClient.client_info.mobilesdk_app_id.startsWith(`1:${senderId}:android:`), 'Android app ID belongs to another Firebase project.');
  const clients = [
    ...(matchingClient.oauth_client ?? []),
    ...(matchingClient.services?.appinvite_service?.other_platform_oauth_client ?? []),
  ];
  requireValid(clients.some(client => client.client_type === 1 &&
    client.android_info?.package_name === EXPECTED_PACKAGE &&
    /^[a-fA-F0-9]{40}$/.test(client.android_info?.certificate_hash ?? '')),
  'register the Android app signing SHA-1 fingerprint and download updated google-services.json.');
  requireValid(clients.some(client => client.client_type === 3 && typeof client.client_id === 'string' && client.client_id.length > 0),
    'Google sign-in requires a Web OAuth client in google-services.json.');

  requireValid(environment.VITE_FIREBASE_PROJECT_ID === EXPECTED_PROJECT,
    `VITE_FIREBASE_PROJECT_ID must be ${EXPECTED_PROJECT}.`);
  requireValid(typeof environment.VITE_FIREBASE_API_KEY === 'string' && environment.VITE_FIREBASE_API_KEY.trim().length > 0,
    'the public Firebase Web API key is missing.');
  requireValid(typeof environment.VITE_FIREBASE_AUTH_DOMAIN === 'string' && environment.VITE_FIREBASE_AUTH_DOMAIN.trim().length > 0,
    'the public Firebase Web auth domain is missing.');
  requireValid(typeof environment.VITE_FIREBASE_APP_ID === 'string' &&
    environment.VITE_FIREBASE_APP_ID.startsWith(`1:${senderId}:web:`),
    'the Firebase Web app ID does not belong to this Android Firebase project.');

  const [capacitor, gradle] = await Promise.all([
    readFile(join(root, 'capacitor.config.ts'), 'utf8'),
    readFile(join(root, 'android/app/build.gradle'), 'utf8'),
  ]);
  requireValid(/appId:\s*['"]com\.sda\.vop['"]/.test(capacitor), 'Capacitor app ID is not com.sda.vop.');
  requireValid(/applicationId\s+['"]com\.sda\.vop['"]/.test(gradle) &&
    /namespace\s*=\s*['"]com\.sda\.vop['"]/.test(gradle),
    'Android applicationId and namespace must both be com.sda.vop.');

  const policy = await jsonFile(join(root, 'config/curriculum-policy.json'), 'approved curriculum release policy');
  requireValid(exactKeys(policy, ['schemaVersion', 'expectedLanguageCount', 'expectedLessonCount']) &&
    policy.schemaVersion === 1 &&
    Number.isSafeInteger(policy.expectedLanguageCount) && policy.expectedLanguageCount > 0 &&
    Number.isSafeInteger(policy.expectedLessonCount) && policy.expectedLessonCount > 0 &&
    Number.isSafeInteger(policy.expectedLanguageCount * policy.expectedLessonCount),
  'approved curriculum release policy has invalid language or lesson counts.');
  const manifest = await jsonFile(join(root, 'public/lessons/manifest.json'), 'approved offline lesson manifest');
  const languages = manifest?.languages;
  const lessonIds = manifest?.lessonIds;
  requireValid(exactKeys(manifest, ['schemaVersion', 'languages', 'lessonIds', 'count', 'version']) &&
    manifest.schemaVersion === 1 && Array.isArray(languages) &&
    languages.length === policy.expectedLanguageCount &&
    Array.isArray(lessonIds) && lessonIds.length === policy.expectedLessonCount &&
    manifest.count === languages.length * lessonIds.length &&
    digestPattern.test(manifest.version ?? '') &&
    languages.every(lang => typeof lang === 'string' && languagePattern.test(lang)) &&
    lessonIds.every(id => typeof id === 'string' && lessonPattern.test(id)) &&
    new Set(languages).size === languages.length && new Set(lessonIds).size === lessonIds.length,
    `an approved manifest with exactly ${policy.expectedLanguageCount} languages and ${policy.expectedLessonCount} lessons is required.`);
  const revisions = [];
  for (const lang of languages) {
    for (const lessonId of lessonIds) {
      const path = join(root, 'public/lessons', lang, `${lessonId}.json`);
      const snapshot = await jsonFile(path, `snapshot ${lang}/${lessonId}.json`);
      revisions.push([`${lang}/${lessonId}`, validateSnapshot(snapshot, lang, lessonId)]);
    }
  }
  requireValid(hash(revisions.sort()) === manifest.version,
    'offline lesson manifest integrity check failed; regenerate from the approved master.');
  return { project: EXPECTED_PROJECT, packageName: EXPECTED_PACKAGE, snapshotCount: manifest.count };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  // Use Vite's exact production env-file precedence and expansion.
  const { loadEnv } = await import('vite');
  const environment = loadEnv('production', root, 'VITE_');
  validateAndroidRelease(root, environment)
    .then(result => console.log(`Validated ${result.packageName} / ${result.project}: ${result.snapshotCount} bundled lessons.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
