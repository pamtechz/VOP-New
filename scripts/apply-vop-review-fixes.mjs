import { readFileSync, writeFileSync } from 'node:fs';

/** One-shot source migration: assert every original anchor before writing any file. */
const pending = new Map();
const load = path => pending.get(path) ?? readFileSync(path, 'utf8');
const replace = (source, before, after, name) => {
  if (!source.includes(before)) throw new Error(`Missing expected source anchor: ${name}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Ambiguous source anchor: ${name}`);
  return source.replace(before, after);
};
const section = (source, start, end, replacement, name) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || source.indexOf(start, from + 1) >= 0) throw new Error(`Invalid section: ${name}`);
  return source.slice(0, from) + replacement + source.slice(to);
};

{
  const path = 'src/services/storage.ts';
  let file = load(path);
  file = replace(file, "} from '../data/initialData';", "} from '../data/initialData';\nimport { calculateCurriculumProgress } from './progress';", 'progress import');
  file = replace(file, "const defaultId = users[0]?.uid || 'user-aubrey-matende';", "const defaultId = users[0]?.uid;\n  if (!defaultId) throw new Error('No account has been provisioned. Configure authentication before production use.');", 'remove named default account');
  const replacement = `export const recordLessonCompletion = (lessonId: string) => {
  const user = getCurrentUser();
  const guide = getStoredGuides().find(g => g.lessons.some(l => l.id === lessonId && l.type === 'Lesson'));
  if (!guide) return;
  const completedLessons = [...new Set([...(user.progress.completedLessons || []), lessonId])];
  const candidate: User = { ...user, progress: { ...user.progress, completedLessons } };
  const state = calculateCurriculumProgress(getStoredGuides(), candidate, getStoredSettings().quizPassThreshold, getActiveLanguage());
  updateUser({ ...candidate, progress: {
    ...candidate.progress, discoverProgress: state.percent,
    completedGuidesCount: state.completedGuides, totalGuidesCount: state.totalGuides
  } });
};

export const recordQuizScore = (guideId: string, lessonId: string, scorePercentage: number) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  const assessment = guide?.lessons.find(l => l.id === lessonId && l.type === 'Test');
  if (!guide || !assessment || !Number.isFinite(scorePercentage) || scorePercentage < 0 || scorePercentage > 100) return;
  const user = getCurrentUser();
  const updatedScores = {
    ...(user.progress.guideScores || {}),
    [guideId + ':' + lessonId]: scorePercentage,
    // Maintain a guide-level score only when this guide has a single test.
    ...(guide.lessons.filter(l => l.type === 'Test').length === 1 ? { [guideId]: scorePercentage } : {})
  };
  const candidate: User = { ...user, progress: { ...user.progress, guideScores: updatedScores } };
  const language = getActiveLanguage();
  const state = calculateCurriculumProgress(guides, candidate, getStoredSettings().quizPassThreshold, language);
  const updated: User = { ...candidate, progress: {
    ...candidate.progress, discoverProgress: state.percent,
    completedGuidesCount: state.completedGuides, totalGuidesCount: state.totalGuides
  } };
  const requestExists = getStoredGraduationRequests().some(request =>
    request.candidateId === user.uid && request.status !== 'rejected'
  );
  if (state.certificateEligible && !updated.information.graduated && !updated.information.graduating && !requestExists) {
    const firstRequired = guides.find(g => g.certificateEligible && g.language === language);
    if (firstRequired) {
      updated.information = { ...updated.information, graduating: true };
      submitGraduationRequest(updated, firstRequired, scorePercentage);
    }
  }
  updateUser(updated);
};

`;
  file = section(file, 'export const recordLessonCompletion = (lessonId: string) => {', '// ---------------- Announcements & Resources ---------------- //', replacement, 'progress recording');
  file = replace(file, '  recordQuizScore(guideId, scorePercent);', '  recordQuizScore(guideId, lessonId, scorePercent);', 'per-test score forwarding');
  pending.set(path, file);
}

// The old ProfilePage is no longer routed. Do not mutate its stale JSX or
// attempt to fix its old account-switching controls. retire-legacy-profile.mjs
// replaces the entire file only after the storage migration is complete.
{
  const path = 'src/pages/ProfilePage.tsx';
  if (!load(path).includes('export const ProfilePage: React.FC<ProfilePageProps>')) {
    throw new Error('Unexpected legacy ProfilePage source; refusing VOP migration.');
  }
}

{
  const path = 'src/pages/AdminPage.tsx';
  let file = load(path);
  file = replace(file,
    "const dist = districts.find(d => d.id === newOrgDistrictId) || districts[0];",
    "const dist = districts.find(d => d.id === newOrgDistrictId);\n    if (!dist) { notify('Select a valid district before creating the organization.'); return; }",
    'explicit organization scope');
  file = replace(file, "type: newOrgType as any,", 'type: newOrgType,', 'typed organization category');
  file = replace(file, "districtId: dist?.id || 'dist-1',\n      conferenceId: dist?.conferenceId || 'conf-1',\n      unionId: dist?.unionId || 'union-szuc'",
    'districtId: dist.id,\n      conferenceId: dist.conferenceId,\n      unionId: dist.unionId', 'remove organization ID fallbacks');
  file = replace(file,
    "const [localizationSearch, setLocalizationSearch] = useState('');",
    "const [localizationSearch, setLocalizationSearch] = useState('');\n  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});",
    'draft translations');
  file = replace(file,
    "notify('All translations saved successfully!');",
    "const changes = Object.entries(translationDrafts);\n                        changes.forEach(([compound, value]) => {\n                          const separator = compound.indexOf(':');\n                          updateLocalizationTranslation(compound.slice(separator + 1), compound.slice(0, separator), value);\n                        });\n                        setTranslationDrafts({});\n                        notify(changes.length ? `Saved ${changes.length} translations.` : 'No unsaved translation changes.');",
    'real translation save');
  file = replace(file,
    "defaultValue={entry.translations[localizationActiveLang] || ''}\n                                onBlur={(e) => {\n                                  updateLocalizationTranslation(entry.key, localizationActiveLang, e.target.value);\n                                }}",
    "value={translationDrafts[`${localizationActiveLang}:${entry.key}`] ?? entry.translations[localizationActiveLang] ?? ''}\n                                onChange={(e) => setTranslationDrafts(previous => ({ ...previous, [`${localizationActiveLang}:${entry.key}`]: e.target.value }))}",
    'controlled translations');
  pending.set(path, file);
}

{
  const path = 'src/types/index.ts';
  let file = load(path);
  file = replace(file,
    "type: 'Church' | 'Company' | 'Campus Ministry' | 'Prison Ministry' | 'Community Center';",
    'type: string; // Admin-configured ministry organization type.',
    'allow administrator-provided organization category');
  pending.set(path, file);
}

for (const [path, text] of pending) writeFileSync(path, text);
console.log(`Applied guarded changes to ${pending.size} VOP source files; obsolete profile will be retired separately.`);
