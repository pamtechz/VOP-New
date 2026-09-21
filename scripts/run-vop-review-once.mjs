import { readFileSync } from 'node:fs';

// Queued VOP-only jobs may start after another completes. Detect a previously
// migrated branch, avoiding a second pass over consumed source anchors.
const source = readFileSync('src/services/storage.ts', 'utf8');
const alreadyApplied = source.includes("import { calculateCurriculumProgress } from './progress';") ||
  source.includes("import { calculateCurriculumProgress, calculateCurriculumAverageScore } from './progress';");
if (alreadyApplied) {
  console.log('Base progress migration already applied; checking final corrections.');
} else {
  await import('./apply-vop-review-fixes.mjs');
}
await import('./finalize-vop-progress.mjs');
await import('./retire-legacy-profile.mjs');
