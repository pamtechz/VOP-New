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

const collection = process.env.FIRESTORE_LESSONS_COLLECTION || 'lessons';
const batch = db.batch();

for (const lesson of master.lessons) {
  if (!lesson.lang || !lesson.lessonId || !Array.isArray(lesson.pages)) {
    throw new Error(`Invalid lesson record: ${JSON.stringify(lesson)}`);
  }
  const ref = db.collection(collection).doc(`${lesson.lang}_${lesson.lessonId}`);
  batch.set(ref, {
    schemaVersion: master.schemaVersion,
    language: lesson.lang,
    lessonId: lesson.lessonId,
    title: lesson.title,
    pages: lesson.pages,
    quiz: Array.isArray(lesson.quiz) ? lesson.quiz : [],
    attribution: lesson.attribution ?? null,
    source: lesson.source,
    seededAt: new Date().toISOString()
  });
}

await batch.commit();
console.log(`Seeded ${master.lessons.length} source-derived lessons into ${collection} for project ${projectId}.`);
