#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultSeed = resolve(here, '../../content/lessons.seed.json');
const shaPattern = /^[a-f0-9]{64}$/;
const pathPattern = /^curricula\/[A-Za-z0-9_-]+\/languages\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*\/lessons\/[A-Za-z0-9_-]+$/;
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = name => args.includes(name);
const projectId = option('--project-id');
const databaseId = option('--database-id') || '(default)';
const curriculumId = option('--curriculum-id') || 'discover';
const seedPath = resolve(option('--seed') || defaultSeed);
const apply = has('--apply');

function fail(message) {
  throw new Error(message);
}

const seed = JSON.parse(await readFile(seedPath, 'utf8'));
if (seed.schemaVersion !== 2 || seed.curriculumId !== curriculumId ||
    !shaPattern.test(seed.sourceArchiveSha256) || !shaPattern.test(seed.importRevision) ||
    !Array.isArray(seed.documents) || seed.documents.length === 0) {
  fail('The editorial seed has an invalid schema or does not match the requested curriculum.');
}
const paths = new Set();
for (const document of seed.documents) {
  if (!document || !pathPattern.test(document.path) || paths.has(document.path) ||
      document.data?.curriculumId !== curriculumId ||
      document.data?.sourceArchiveSha256 !== seed.sourceArchiveSha256 ||
      document.data?.importRevision !== seed.importRevision) {
    fail(`Invalid or duplicate editorial document: ${document?.path ?? '<missing>'}`);
  }
  paths.add(document.path);
}
const canonical = JSON.stringify(seed.documents.map(document => [document.path, document.data.source.sha256]).sort());
const inventoryHash = createHash('sha256').update(canonical).digest('hex');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', projectId: projectId ?? null,
  databaseId, curriculumId, documents: seed.documents.length, inventoryHash }, null, 2));

if (!apply) process.exit(0);
if (!projectId) fail('--project-id is required with --apply.');
if (!has('--acknowledge-source-headings')) {
  fail('Live apply requires --acknowledge-source-headings after reviewing the Bemba 11/12 source discrepancy.');
}
const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
  import('firebase-admin/app'), import('firebase-admin/firestore'),
]);
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app, databaseId);
for (let offset = 0; offset < seed.documents.length; offset += 400) {
  const batch = db.batch();
  for (const document of seed.documents.slice(offset, offset + 400)) {
    const reference = db.doc(document.path);
    const existing = await reference.get();
    if (existing.exists && existing.data()?.importRevision !== seed.importRevision) {
      fail(`Refusing to overwrite a different editorial revision at ${document.path}.`);
    }
    batch.set(reference, document.data, { merge: false });
  }
  await batch.commit();
}
console.log(`Applied ${seed.documents.length} idempotent editorial lesson documents to ${projectId}/${databaseId}.`);
