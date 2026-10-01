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
  assert.match(css,/Dark-mode regression shield/);
  assert.match(css,/\.vop-account-link/);
  assert.match(css,/\.vop-guide-first-card/);
  assert.match(css,/\.vop-header-popover/);
});

test('organization administrators retain candidates while language governance stays Super Admin only',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  const candidates=read('src/pages/CandidateEnrollment.tsx');
  const languageApi=read('api_handlers/admin/languages.ts');
  const localization=read('api/localization.ts');
  assert.match(admin,/item\.id==='candidates'/);
  assert.match(admin,/const coreTenantAdmin=isSuperAdmin\|\|isHierarchyAdmin\|\|organizationAdmin/);
  assert.match(admin,/item\.id==='curriculum'/);
  assert.match(admin,/curriculumContributor/);
  assert.match(admin,/\(item\.id === 'languages' \|\| item\.id === 'translations'\) && !isSuperAdmin/);
  assert.match(candidates,/\/api\/admin\/enrollCandidate/);
  assert.match(candidates,/organizationId/);
  assert.match(languageApi,/Language registry management is platform-wide/);
  assert.match(localization,/Organization-specific localization is no longer supported/);
});

test('localization workflow requires invite acceptance, scopes assigned languages and supports governed language requests',()=>{
  const server=read('api_handlers/admin/localization.ts');
  const participation=read('src/components/localization/LocalizationParticipation.tsx');
  const governance=read('src/pages/LocalizationGovernancePanel.tsx');
  assert.match(server,/action==='apply'/);
  assert.match(server,/action==='inviteCollaborator'/);
  assert.match(server,/status:'invited'/);
  assert.match(server,/action==='acceptInvitation'\|\|action==='declineInvitation'/);
  assert.match(server,/action==='requestLanguageAccess'/);
  assert.match(server,/action==='reviewAccessRequest'/);
  assert.match(server,/FieldValue\.arrayUnion\(code\)/);
  assert.match(server,/createRequestedLanguage\(db,code/);
  assert.match(server,/action==='recommend'/);
  assert.match(server,/if\(percent>=90\)/);
  assert.match(server,/publishProposal\(db,code,proposalId,uid,'automatic'\)/);
  assert.match(participation,/Accept invitation/);
  assert.match(participation,/assignedLanguageOptions/);
  assert.match(participation,/Request another language/);
  assert.match(participation,/Existing translation/);
  assert.match(participation,/New language/);
  assert.match(governance,/Awaiting recipient acceptance/);
  assert.match(governance,/Language access requests/);
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


test('notification and invitation workflows are visible, actionable and routed to their destination',()=>{
  const app=read('src/App.tsx');
  const types=read('src/types/index.ts');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const drawer=read('src/components/layout/MenuDrawer.tsx');
  const tools=read('src/components/layout/CommunicationTools.tsx');
  const inbox=read('src/pages/InboxPage.tsx');
  const notifications=read('api_handlers/admin/notifications.ts');
  const organizations=read('api_handlers/admin/organizations.ts');
  const mentoring=read('api/mentorship.ts');
  const localization=read('api_handlers/admin/localization.ts');
  const prayer=read('api/prayer.ts');
  const graduation=read('api_handlers/admin/graduations.ts');
  assert.match(types,/\| 'notifications'/);
  assert.match(types,/\| 'invites'/);
  assert.match(app,/currentRoute === 'notifications' \|\| currentRoute === 'invites'/);
  assert.match(sidebar,/route:'notifications'/);
  assert.match(sidebar,/route:'invites'/);
  assert.match(drawer,/route: 'notifications'/);
  assert.match(drawer,/route: 'invites'/);
  assert.match(tools,/setInterval\(\(\)=>void loadNotifications\(true\),15000\)/);
  assert.match(tools,/vop-notification-toast/);
  assert.match(tools,/action:'clearAll'/);
  assert.match(inbox,/acceptInvite/);
  assert.match(inbox,/createMemberInvite/);
  assert.match(inbox,/Create invitation/);
  assert.match(inbox,/quickchart\.io\/qr/);
  assert.match(app,/Organization invitations require an explicit Accept action/);
  assert.doesNotMatch(app,/body:JSON\.stringify\(\{action:'acceptInvite',token:inviteToken\}\)/);
  assert.match(organizations,/action==='previewInvite'/);
  assert.match(organizations,/action === 'createMemberInvite'/);
  assert.match(organizations,/source:'member-link'/);
  assert.match(organizations,/targetKind/);
  assert.match(inbox,/declineInvite/);
  assert.match(inbox,/cancelInvite/);
  assert.match(inbox,/dismissInvite/);
  assert.match(inbox,/clearInviteHistory/);
  assert.match(notifications,/action==='clearAll'/);
  assert.match(organizations,/action === 'listInvites'/);
  assert.match(organizations,/action === 'dismissInvite'/);
  assert.match(organizations,/action === 'clearInviteHistory'/);
  assert.match(organizations,/action === 'declineInvite'/);
  assert.match(organizations,/action === 'cancelInvite'/);
  assert.match(organizations,/type:'invitation'/);
  assert.match(mentoring,/title:'New mentoring message'/);
  assert.match(localization,/Localization application approved/);
  assert.match(prayer,/title:'New prayer request'/);
  assert.match(graduation,/Graduation approval required/);
});

test('notification actions preserve exact admin destinations',()=>{
  const routing=read('src/services/notificationRouting.ts');
  const admin=read('src/pages/AdminPage.tsx');
  assert.match(routing,/vop_notification_admin_target/);
  assert.match(routing,/localization:'translations'/);
  assert.match(routing,/graduations:'certification'/);
  assert.match(admin,/consumeNotificationAdminTarget/);
  assert.match(admin,/setActiveTab\(target as AdminTab\)/);
});
