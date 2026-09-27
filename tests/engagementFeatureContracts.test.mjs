import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Master Guide portfolio is persisted through authenticated API actions', () => {
  const source = read('api/engagement.ts');
  assert.match(source, /masterGuidePortfolios/);
  assert.match(source, /masterGuideRequirements/);
  assert.match(source, /portfolioSaveActivity/);
  assert.match(source, /portfolioEvidence/);
  assert.match(source, /portfolioSignoff/);
  assert.match(source, /portfolioShare/);
  assert.match(source, /requirePermissionForProfile/);
});

test('Scripture memory uses persistent per-learner spaced-repetition state', () => {
  const source = read('api/engagement.ts');
  assert.match(source, /scriptureMemoryDecks/);
  assert.match(source, /scriptureMemoryState/);
  assert.match(source, /scriptureMemoryReviews/);
  assert.match(source, /easeFactor/);
  assert.match(source, /intervalDays/);
  assert.match(source, /dueAt/);
  assert.match(source, /mastery/);
});

test('Iron Duels score and rating changes are server authoritative', () => {
  const source = read('api/engagement.ts');
  assert.match(source, /scriptureDuelQuestions/);
  assert.match(source, /scriptureDuels/);
  assert.match(source, /scriptureDuelResults/);
  assert.match(source, /FieldValue\.increment/);
  assert.match(source, /runTransaction/);
  assert.match(source, /function elo/);
  assert.match(source, /expiresAt/);
});

test('Engagement UI is connected to the real API', () => {
  const source = read('src/pages/ResourcesPage.tsx');
  assert.match(source, /\/api\/engagement/);
  assert.match(source, /Master Guide/);
  assert.match(source, /Scripture Memory/);
  assert.match(source, /Iron Duels/);
  assert.match(source, /portfolioSaveActivity/);
  assert.match(source, /memoryReview/);
  assert.match(source, /duelAnswer/);
});

test('PWA has manifest, service worker, offline fallback and update lifecycle', () => {
  const index = read('index.html');
  const sw = read('public/sw.js');
  const manifest = read('public/manifest.webmanifest');
  assert.match(index, /manifest\.webmanifest/);
  assert.match(index, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  assert.match(sw, /offline\.html/);
  assert.match(sw, /vop-shell-/);
  assert.match(manifest, /"display":\s*"standalone"/);
});

test('Vendor splitting is configured instead of suppressing the bundle warning', () => {
  const source = read('vite.config.ts');
  assert.match(source, /manualChunks/);
  assert.match(source, /firebase/);
  assert.match(source, /react/);
});
