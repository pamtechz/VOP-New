import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = [
  'src/main.tsx',
  'src/Root.tsx',
  'src/config/deployment.ts',
  'src/pages/FirebaseStudyApp.tsx',
  'src/pages/LessonViewer.tsx',
  'src/pages/SignInPage.tsx',
  'src/services/firebaseAuth.ts',
  'src/services/offlineManifest.ts',
  'src/lib/firebase.ts',
];

test('Firebase runtime cannot select or import legacy hardcoded operational data', () => {
  for (const relative of runtimeFiles) {
    const source = readFileSync(join(root, relative), 'utf8');
    assert.ok(!source.includes("from '../data/initialData'"), `${relative} must not import initialData.`);
    assert.ok(!source.includes("from './data/initialData'"), `${relative} must not import initialData.`);
    assert.ok(!source.includes("from '../services/storage'"), `${relative} must not import legacy storage.`);
    assert.ok(!source.includes("from './services/storage'"), `${relative} must not import legacy storage.`);
    assert.ok(!source.includes('localStorage.'), `${relative} must not use localStorage as operational authority.`);
    assert.ok(!source.includes("import('./App')"), `${relative} must not load the legacy demonstration application.`);
    assert.ok(!source.includes('VITE_VOP_ENABLE_DEMO'), `${relative} must not re-enable demonstration identities.`);
  }
  const firebaseClient = readFileSync(join(root, 'src/lib/firebase.ts'), 'utf8');
  assert.ok(!firebaseClient.includes("=== 'voiceofprophecy'"), 'Firebase project identity belongs in deployment policy, not runtime literals.');
});

test('production bundle does not ship legacy demo UI or its hardcoded users', () => {
  const assets = readdirSync(join(root, 'dist/assets'));
  assert.equal(assets.some(name => /^App-[\w-]+\.js$/.test(name)), false,
    `Found legacy demonstration application chunk in production: ${assets.join(', ')}`);
  const scripts = assets.filter(name => name.endsWith('.js'));
  assert.ok(scripts.some(name => /^FirebaseStudyApp-[\w-]+\.js$/.test(name)),
    'Expected the real Firebase study application to be bundled.');
  const contents = scripts.map(name => readFileSync(join(root, 'dist/assets', name), 'utf8')).join('\n');
  assert.ok(!contents.includes('vop_demo_users'), 'Legacy demonstration user storage must not ship in production.');
  assert.ok(!contents.includes('VITE_VOP_ENABLE_DEMO'), 'Legacy demo runtime switch must not ship in production.');
});
