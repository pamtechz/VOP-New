#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build-time only. The Android reader never fetches Firestore lesson content.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = resolve(root, process.env.LESSONS_MASTER_PATH || 'content/lessons.master.json');
const assetPath = resolve(root, process.env.LESSONS_ASSET_PATH || 'content/assets');
const policyPath = join(root, 'config/curriculum-policy.json');
const publicDir = join(root, 'public');
const destination = join(publicDir, 'lessons');
const langPattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const assetPattern = /^assets\/([A-Za-z0-9_.-]{1,100}\.(?:jpg|jpeg|png|gif|webp))$/i;
const requireValid = (valid, message) => { if (!valid) throw new Error(message); };
const digest = data => createHash('sha256').update(data).digest('hex');
const clean = (value, field) => {
  requireValid(typeof value === 'string' && value.trim(), `${field} must be nonempty text`);
  return value.trim();
};
const readJson = async (path, name) => {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`Cannot load ${name} from ${path}: ${error.message}`); }
};
async function loadLessonMaster() {
  if ((process.env.LESSONS_SOURCE || 'local') !== 'firestore') {
    return readJson(masterPath, 'approved lesson master');
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  requireValid(projectId, 'FIREBASE_PROJECT_ID is required when LESSONS_SOURCE=firestore');
  const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const collection = process.env.FIRESTORE_LESSONS_COLLECTION || 'lessons';
  const snapshot = await db.collection(collection).get();
  requireValid(!snapshot.empty, `Firestore collection ${collection} is empty`);
  const lessons = snapshot.docs.map(doc => doc.data());
  const languages = [...new Set(lessons.map(lesson => lesson.language))].sort();
  const lessonIds = [...new Set(lessons.map(lesson => String(lesson.lessonId).padStart(2, '0')))].sort();
  const languageLabels = languages.map(lang => {
    const record = lessons.find(lesson => lesson.language === lang && typeof lesson.languageLabel === 'string' && lesson.languageLabel.trim());
    return record?.languageLabel?.trim() || lang;
  });
  return {
    schemaVersion: 2,
    languages,
    languageLabels,
    lessonIds,
    lessons: lessons.map(lesson => ({
      lang: lesson.language,
      lessonId: String(lesson.lessonId).padStart(2, '0'),
      title: lesson.title,
      pages: lesson.pages,
      quiz: Array.isArray(lesson.quiz) ? lesson.quiz : [],
      attribution: lesson.attribution ?? null,
      source: lesson.source
    }))
  };
}

const unique = (items, field, pattern) => {
  requireValid(Array.isArray(items) && items.length > 0 && items.every(item => typeof item === 'string' && pattern.test(item)) && new Set(items).size === items.length, `Invalid ${field}`);
  return items;
};

async function run() {
  const policy = await readJson(policyPath, 'approved curriculum policy');
  const master = await loadLessonMaster();
  requireValid(policy?.schemaVersion === 1 && Number.isSafeInteger(policy.expectedLanguageCount) && Number.isSafeInteger(policy.expectedLessonCount) && policy.expectedLanguageCount > 0 && policy.expectedLessonCount > 0, 'Invalid curriculum policy');
  requireValid(master?.schemaVersion === 2, 'Source master must use validated variable-length schema 2');
  const languages = unique(master.languages, 'languages', langPattern);
  const lessonIds = unique(master.lessonIds, 'lesson IDs', idPattern);
  requireValid(languages.length === policy.expectedLanguageCount && lessonIds.length === policy.expectedLessonCount, 'Approved curriculum inventory mismatch');
  requireValid(Array.isArray(master.languageLabels) && master.languageLabels.length === languages.length, 'Language labels must be source-approved');
  const languageLabels = master.languageLabels.map((value, index) => clean(value, `languageLabels[${index}]`));
  const expected = languages.length * lessonIds.length;
  requireValid(Number.isSafeInteger(expected) && Array.isArray(master.lessons) && master.lessons.length === expected, `Expected ${expected} authentic lesson translations`);
  const allowedLanguages = new Set(languages);
  const allowedLessons = new Set(lessonIds);
  const snapshots = new Map();
  const assetNames = new Set();
  for (const source of master.lessons) {
    const { lang, lessonId } = source ?? {};
    requireValid(allowedLanguages.has(lang) && allowedLessons.has(lessonId), `Unexpected lesson ${lang}/${lessonId}`);
    const key = `${lang}/${lessonId}`;
    requireValid(!snapshots.has(key), `Duplicate translation ${key}`);
    const title = clean(source.title, `${key}.title`);
    requireValid(Array.isArray(source.pages) && source.pages.length > 0, `${key}: no source-derived reading sections`);
    const pages = source.pages.map((page, index) => {
      requireValid(page?.pageNumber === index + 1 && Array.isArray(page.blocks) && page.blocks.length > 0, `${key}: invalid section ${index + 1}`);
      const blocks = page.blocks.map((block, blockIndex) => {
        if (block?.type === 'text') return { type: 'text', text: clean(block.text, `${key}.pages[${index}].blocks[${blockIndex}]`) };
        const match = block?.type === 'image' && typeof block.src === 'string' && assetPattern.exec(block.src);
        requireValid(match && typeof block.alt === 'string', `${key}: unsafe image reference`);
        assetNames.add(match[1]);
        return { type: 'image', src: `assets/${match[1]}`, alt: block.alt };
      });
      requireValid(blocks.some(block => block.type === 'text'), `${key}: empty reading section ${index + 1}`);
      return { pageNumber: page.pageNumber, title: clean(page.title, `${key}.pages[${index}].title`), blocks };
    });
    requireValid(Array.isArray(source.quiz), `${key}: quiz must be an array (empty when no verified questions exist)`);
    const questionIds = new Set();
    const quiz = source.quiz.map((question, index) => {
      const id = clean(question?.id, `${key}.quiz[${index}].id`);
      requireValid(idPattern.test(id) && !questionIds.has(id), `${key}: invalid or duplicate quiz ID`);
      questionIds.add(id);
      requireValid(Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6 && Number.isInteger(question.correctOptionIndex) && question.correctOptionIndex >= 0 && question.correctOptionIndex < question.options.length, `${key}: quiz answer must be verified`);
      return { id, prompt: clean(question.prompt, `${key}.quiz[${index}].prompt`), options: question.options.map((option, i) => clean(option, `${key}.quiz[${index}].options[${i}]`)), correctOptionIndex: question.correctOptionIndex };
    });
    requireValid(source.source && shaPattern.test(source.source.sha256) && typeof source.source.file === 'string' && source.source.file.trim(), `${key}: missing source provenance`);
    requireValid(source.attribution === null || typeof source.attribution === 'string', `${key}: invalid source attribution`);
    const payload = { schemaVersion: 2, language: lang, lessonId, title, pages, quiz, attribution: source.attribution, source: { file: source.source.file, sha256: source.source.sha256, reportedLessonNumber: source.source.reportedLessonNumber } };
    snapshots.set(key, { ...payload, revision: digest(JSON.stringify(payload)) });
  }
  for (const lang of languages) for (const lessonId of lessonIds) requireValid(snapshots.has(`${lang}/${lessonId}`), `Missing approved lesson ${lang}/${lessonId}`);
  const assetHashes = {};
  for (const name of [...assetNames].sort()) {
    const bytes = await readFile(join(assetPath, name));
    const extension = name.split('.').at(-1).toLowerCase();
    const valid = (['jpg', 'jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (extension === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (extension === 'gif' && ['GIF87a','GIF89a'].includes(bytes.toString('ascii', 0, 6))) ||
      (extension === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    requireValid(valid, `Invalid or corrupted source image: ${name}`);
    assetHashes[name] = digest(bytes);
  }
  const titles = languages.map(lang => lessonIds.map(lessonId => snapshots.get(`${lang}/${lessonId}`).title));
  const versions = [...snapshots].map(([key, snapshot]) => [key, snapshot.revision]).sort();
  const manifest = { schemaVersion: 2, languages, languageLabels, lessonIds, titles, count: expected, version: digest(JSON.stringify(versions)), assetHashes };
  await mkdir(publicDir, { recursive: true });
  const stage = await mkdtemp(join(publicDir, '.lessons-stage-'));
  const backup = join(publicDir, `.lessons-backup-${randomUUID()}`);
  let backedUp = false;
  let promoted = false;
  try {
    for (const [key, snapshot] of snapshots) {
      const file = join(stage, `${key}.json`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(snapshot), 'utf8');
    }
    await mkdir(join(stage, 'assets'), { recursive: true });
    for (const name of Object.keys(assetHashes)) await copyFile(join(assetPath, name), join(stage, 'assets', name));
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    try { await access(destination, constants.F_OK); await rename(destination, backup); backedUp = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(stage, destination);
    promoted = true;
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (backedUp && !promoted) await rename(backup, destination);
    throw error;
  } finally {
    if (!promoted) await rm(stage, { recursive: true, force: true });
  }
  console.log(`Bundled ${expected} authentic lessons, ${Object.keys(assetHashes).length} images and ${master.lessons.reduce((n, lesson) => n + lesson.pages.length, 0)} source sections; zero runtime lesson database reads.`);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
