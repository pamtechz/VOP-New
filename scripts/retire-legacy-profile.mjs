import { readFileSync, writeFileSync } from 'node:fs';

// Run only after the guarded migration: the old profile is no longer routed,
// but TypeScript still compiles it and its account-switch logic is obsolete.
const storage = readFileSync('src/services/storage.ts', 'utf8');
if (!storage.includes("import { calculateCurriculumProgress, calculateCurriculumAverageScore } from './progress';")) {
  throw new Error('Refusing to retire the legacy profile before the progress migration.');
}

const path = 'src/pages/ProfilePage.tsx';
const replacement = "// Backwards-compatible export; the legacy account impersonation UI is retired.\nexport { ReferenceProfilePage as ProfilePage } from './ReferenceProfilePage';\n";
const current = readFileSync(path, 'utf8');
if (current === replacement) {
  console.log('Legacy profile already retired.');
} else {
  if (!current.includes('export const ProfilePage: React.FC<ProfilePageProps>')) {
    throw new Error('Unexpected legacy profile source. Nothing was changed.');
  }
  writeFileSync(path, replacement);
  console.log('Retired redundant profile and its unauthenticated persona-switching code.');
}
