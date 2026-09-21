#!/usr/bin/env node
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required.');

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const masterPath = resolve(process.env.LESSONS_MASTER_PATH || 'content/lessons.master.json');
const master = JSON.parse(await readFile(masterPath, 'utf8'));

if (master.schemaVersion !== 2 || !Array.isArray(master.lessons) || master.lessons.length === 0) {
  throw new Error('Invalid lesson master: expected schemaVersion 2 with lessons.');
}

const labels = new Map((master.languages || []).map((lang, index) => [lang, master.languageLabels?.[index] || lang]));
const batch = db.batch();
const curriculum = db.collection('curricula').doc('discover');

for (const lesson of master.lessons) {
  if (!lesson.lang || !lesson.lessonId || !Array.isArray(lesson.pages)) {
    throw new Error(`Invalid lesson record: ${JSON.stringify(lesson)}`);
  }
  const ref = curriculum.collection('languages').doc(lesson.lang).collection('lessons').doc(String(lesson.lessonId));
  batch.set(ref, {
    schemaVersion: master.schemaVersion,
    language: lesson.lang,
    languageLabel: labels.get(lesson.lang),
    lessonId: lesson.lessonId,
    lessonNumber: lesson.lessonId.replace('lesson-', ''),
    title: lesson.title,
    description: lesson.description ?? '',
    type: lesson.type === 'Test' ? 'Test' : 'Lesson',
    pages: lesson.pages,
    contentPages: Array.isArray(lesson.pages) ? lesson.pages.map((page, index) => ({
      pageNumber: Number.isSafeInteger(page.pageNumber) ? page.pageNumber : index + 1,
      title: String(page.title ?? ''),
      content: Array.isArray(page.blocks) ? page.blocks.filter(block => block?.type === 'text').map(block => String(block.text ?? '').trim()).filter(Boolean).join('\\n\\n') : '',
      imageUrl: Array.isArray(page.blocks) ? ((page.blocks.find(block => block?.type === 'image')?.src) ? '/' + String(page.blocks.find(block => block?.type === 'image')?.src).replace(/^\\//, '') : null) : null
    })) : [],
    quiz: Array.isArray(lesson.quiz) ? lesson.quiz : [],
    guideId: 'guide-' + lesson.lang,
    discoverNumber: 1,
    guideTitle: 'Voice of Prophecy — ' + (labels.get(lesson.lang) || lesson.lang),
    guideSubtitle: labels.get(lesson.lang) || lesson.lang,
    guideDescription: 'Voice of Prophecy Bible study lessons.',
    guideImage: '/assets/guide_2.jpg',
    certificateEligible: false,
    attribution: lesson.attribution ?? null,
    source: lesson.source ?? null,
    seededAt: new Date().toISOString()
  });
}

await batch.commit();
console.log(`Seeded ${master.lessons.length} source-derived lessons into curricula/discover/languages/{language}/lessons for project ${projectId}.`);
