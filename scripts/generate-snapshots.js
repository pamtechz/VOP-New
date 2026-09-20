#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build-time only: this script never connects to Firestore or executes in the APK.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, process.env.LESSONS_MASTER_PATH || 'content/lessons.master.json');
const policyPath = join(root, 'config/curriculum-policy.json');
const publicDir = join(root, 'public');
const destination = join(publicDir, 'lessons');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const languagePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const cleanText = (value, name) => {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${name} must be nonempty text`);
  return value.trim();
};
const uniqueStrings = (values, name, pattern) => {
  requireValue(Array.isArray(values) && values.length > 0, `${name} must be a nonempty array`);
  for (const value of values) requireValue(typeof value === 'string' && pattern.test(value), `Invalid ${name}: ${String(value)}`);
  requireValue(new Set(values).size === values.length, `Duplicate ${name}`);
  return values;
};

async function run() {
  let policy;
  try { policy = JSON.parse(await readFile(policyPath, 'utf8')); }
  catch (error) { throw new Error(`Cannot read approved curriculum policy at ${policyPath}: ${error.message}`); }
  requireValue(policy && typeof policy === 'object' && !Array.isArray(policy) &&
    policy.schemaVersion === 1 && Object.keys(policy).length === 3 &&
    Number.isSafeInteger(policy.expectedLanguageCount) && policy.expectedLanguageCount > 0 &&
    Number.isSafeInteger(policy.expectedLessonCount) && policy.expectedLessonCount > 0,
  'Curriculum policy must configure valid language and lesson counts');
  const expectedLanguages = policy.expectedLanguageCount;
  const expectedLessons = policy.expectedLessonCount;
  let master;
  try { master = JSON.parse(await readFile(source, 'utf8')); }
  catch (error) { throw new Error(`Cannot read complete translation master at ${source}: ${error.message}`); }
  requireValue(master && typeof master === 'object' && !Array.isArray(master), 'Master must be an object');
  const languages = uniqueStrings(master.languages, 'languages', languagePattern);
  const lessonIds = uniqueStrings(master.lessonIds, 'lessonIds', lessonPattern);
  requireValue(languages.length === expectedLanguages, `Expected ${expectedLanguages} languages, found ${languages.length}`);
  requireValue(lessonIds.length === expectedLessons, `Expected ${expectedLessons} lesson IDs, found ${lessonIds.length}`);
  requireValue(Array.isArray(master.languageLabels) && master.languageLabels.length === languages.length,
    `Expected ${languages.length} language display labels`);
  const languageLabels = master.languageLabels.map((label, index) => cleanText(label, `languageLabels[${index}]`));
  const count = languages.length * lessonIds.length;
  requireValue(Number.isSafeInteger(count), 'Invalid curriculum policy inventory product');
  requireValue(Array.isArray(master.lessons) && master.lessons.length === count, `Expected ${count} lesson translations, found ${master.lessons?.length ?? 0}`);
  const allowedLanguages = new Set(languages);
  const allowedLessons = new Set(lessonIds);
  const snapshots = new Map();
  for (const entry of master.lessons) {
    requireValue(entry && typeof entry === 'object', 'Invalid lesson entry');
    const { lang, lessonId } = entry;
    requireValue(allowedLanguages.has(lang) && allowedLessons.has(lessonId), `Unexpected language/lesson pair: ${lang}/${lessonId}`);
    const key = `${lang}/${lessonId}`;
    requireValue(!snapshots.has(key), `Duplicate translation: ${key}`);
    const title = cleanText(entry.title, `${key}.title`);
    requireValue(Array.isArray(entry.pages) && entry.pages.length === 20, `${key} must contain exactly 20 reading pages`);
    const pages = entry.pages.map((page, index) => {
      requireValue(page && page.pageNumber === index + 1, `${key}: page numbers must be 1 through 20 in order`);
      return {
        pageNumber: page.pageNumber,
        title: cleanText(page.title, `${key}.pages[${index}].title`),
        content: cleanText(page.content, `${key}.pages[${index}].content`),
      };
    });
    requireValue(Array.isArray(entry.quiz) && entry.quiz.length === 5, `${key} must contain exactly 5 quiz questions`);
    const ids = new Set();
    const quiz = entry.quiz.map((question, index) => {
      const id = cleanText(question?.id, `${key}.quiz[${index}].id`);
      requireValue(lessonPattern.test(id) && !ids.has(id), `${key}: invalid or duplicate question ID ${id}`);
      ids.add(id);
      requireValue(Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6, `${key}: question options must have 2–6 entries`);
      const options = question.options.map((option, i) => cleanText(option, `${key}.quiz[${index}].options[${i}]`));
      requireValue(Number.isInteger(question.correctOptionIndex) && question.correctOptionIndex >= 0 && question.correctOptionIndex < options.length, `${key}: invalid answer key`);
      return { id, prompt: cleanText(question.prompt, `${key}.quiz[${index}].prompt`), options, correctOptionIndex: question.correctOptionIndex };
    });
    const payload = { schemaVersion: 1, language: lang, lessonId, title, pages, quiz };
    const revision = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    snapshots.set(key, { ...payload, revision });
  }
  for (const lang of languages) for (const lessonId of lessonIds) {
    requireValue(snapshots.has(`${lang}/${lessonId}`), `Missing translation: ${lang}/${lessonId}`);
  }
  const titles = languages.map(lang => lessonIds.map(lessonId => snapshots.get(`${lang}/${lessonId}`).title));
  await mkdir(publicDir, { recursive: true });
  const stage = await mkdtemp(join(publicDir, '.lessons-stage-'));
  const backup = join(publicDir, `.lessons-backup-${randomUUID()}`);
  let oldRenamed = false;
  let promoted = false;
  try {
    for (const [key, snapshot] of snapshots) {
      const output = join(stage, `${key}.json`);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(snapshot), 'utf8');
    }
    const manifest = {
      schemaVersion: 1,
      languages,
      languageLabels,
      lessonIds,
      titles,
      count,
      version: createHash('sha256').update(JSON.stringify([...snapshots].map(([key, data]) => [key, data.revision]).sort())).digest('hex'),
    };
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    try { await access(destination, constants.F_OK); await rename(destination, backup); oldRenamed = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(stage, destination);
    promoted = true;
    if (oldRenamed) await rm(backup, { recursive: true, force: true });
    console.log(`Generated ${count} complete snapshots in public/lessons (zero runtime content database reads).`);
  } catch (error) {
    if (oldRenamed && !promoted) await rename(backup, destination);
    throw error;
  } finally {
    if (!promoted) await rm(stage, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
