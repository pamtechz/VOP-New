import { readFileSync } from 'node:fs';

// The two queued VOP-only runs may start after one another. A migrated branch
// must remain a successful no-op rather than failing on consumed source anchors.
const source = readFileSync('src/services/storage.ts', 'utf8');
const alreadyApplied = source.includes("import { calculateCurriculumProgress } from './progress';") ||
  source.includes("import { calculateCurriculumProgress, calculateCurriculumAverageScore } from './progress';");
if (alreadyApplied) {
  console.log('Base progress migration already applied; checking final corrections.');
} else {
  await import('./apply-vop-review-fixes.mjs');
}
await import('./finalize-vop-progress.mjs');
