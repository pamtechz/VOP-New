import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');

test('dark mode is applied before first paint and covers learner and admin portals',()=>{
  const html=read('index.html');
  const theme=read('src/services/themePreference.ts');
  const css=read('src/theme-dark.css');
  const app=read('src/App.tsx');
  assert.match(html,/localStorage\.getItem\('vop_theme'\) === 'light' \? 'light' : 'dark'/);
  assert.match(theme,/return window\.localStorage\.getItem\(KEY\)==='light'\?'light':'dark'/);
  assert.match(app,/readThemePreference\(\)==='dark'/);
  assert.match(css,/\[data-theme="dark"\] \.vop-learner-shell/);
  assert.match(css,/\.vop-admin/);
  assert.match(css,/\.vop-candidate-list-card/);
  assert.match(css,/\.vop-study-modal section\[role="dialog"\]/);
});

test('organization administrators retain candidates while language governance stays Super Admin only',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  const candidates=read('src/pages/CandidateEnrollment.tsx');
  const languageApi=read('api_handlers/admin/languages.ts');
  const localization=read('api/localization.ts');
  assert.match(admin,/item\.id === 'candidates'/);
  assert.match(admin,/isSuperAdmin \|\| isHierarchyAdmin \|\| organizationAdmin/);
  assert.match(admin,/\(item\.id === 'languages' \|\| item\.id === 'translations'\) && !isSuperAdmin/);
  assert.match(candidates,/\/api\/admin\/enrollCandidate/);
  assert.match(candidates,/organizationId/);
  assert.match(languageApi,/Language registry management is platform-wide/);
  assert.match(localization,/Organization-specific localization is no longer supported/);
});

test('localization workflow supports open applications, assigned reviewers and 90 percent auto publication',()=>{
  const server=read('api_handlers/admin/localization.ts');
  const participation=read('src/components/localization/LocalizationParticipation.tsx');
  const governance=read('src/pages/LocalizationGovernancePanel.tsx');
  assert.match(server,/action==='apply'/);
  assert.match(server,/action==='setCollaborator'/);
  assert.match(server,/action==='recommend'/);
  assert.match(server,/if\(percent>=90\)/);
  assert.match(server,/publishProposal\(db,code,proposalId,uid,'automatic'\)/);
  assert.match(participation,/Apply for localization/);
  assert.match(participation,/Reviewer queue/);
  assert.match(governance,/Invite translator or reviewer/);
  assert.match(governance,/90% reviewer recommendation/);
});

test('mentor accounts have a dedicated assigned-learner workspace and messaging uses participant permission',()=>{
  const app=read('src/App.tsx');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const workspace=read('src/pages/MentorWorkspace.tsx');
  const api=read('api/mentorship.ts');
  assert.match(app,/currentRoute === 'mentor'/);
  assert.match(sidebar,/mentor_workspace/);
  assert.match(workspace,/listMyAssignments/);
  assert.match(workspace,/performance/);
  assert.match(workspace,/sendMessage/);
  assert.match(api,/action === 'sendMessage' \? 'create'/);
  assert.match(api,/action === 'listMyAssignments'/);
});

test('assessment architecture separates classification and policy and starts attempts on the server',()=>{
  const manager=read('src/pages/QuizLibrary.tsx');
  const api=read('api/quizzes.ts');
  const study=read('api/study/progress.ts');
  const modal=read('src/components/quiz/QuizModal.tsx');
  assert.match(api,/attachment==='guide'\?'final_exam':attachment==='chapter'\?'chapter_quiz':'practice'/);
  for(const field of [
    'assessmentInstructions','assessmentTimeLimitMinutes','assessmentPassThreshold',
    'assessmentMaxAttempts','assessmentRetakeCooldownMinutes','assessmentFeedbackMode',
  ])assert.match(manager,new RegExp(field));
  assert.match(study,/action === 'startQuiz'/);
  assert.match(study,/assessmentSessions/);
  assert.match(study,/expiresAt/);
  assert.match(modal,/beginQuizAttempt/);
  assert.match(modal,/instructions/);
  assert.match(modal,/remainingSeconds/);
});
