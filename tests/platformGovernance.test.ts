import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');

test('light mode is the default before first paint while dark mode remains available across portals',()=>{
  const html=read('index.html');
  const theme=read('src/services/themePreference.ts');
  const css=read('src/theme.css');
  const app=read('src/App.tsx');
  assert.match(html,/localStorage\.getItem\('vop_theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(theme,/return window\.localStorage\.getItem\(KEY\)==='dark'\?'dark':'light'/);
  assert.match(theme,/typeof window==='undefined'\)return 'light'/);
  assert.match(html,/setAttribute\('data-theme', 'light'\)/);
  assert.match(app,/readThemePreference\(\)==='dark'/);
  assert.match(css,/\[data-theme="dark"\]/);
  assert.match(css,/\.vop-admin/);
  assert.match(css,/\.vop-candidate-list-card/);
  assert.match(css,/\.vop-study-modal section\[role="dialog"\]/);
  assert.match(css,/CANONICAL LIGHT \/ DARK THEME CONTRACT/);
  assert.match(css,/--theme-surface:/);
  assert.match(css,/--theme-border:/);
  assert.match(css,/--theme-title:/);
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
  const contributorStudio=read('src/components/localization/LocalizationTranslationStudio.tsx');
  const governance=read('src/pages/LocalizationGovernancePanel.tsx');
  const consolePage=read('src/pages/LocalizationConsolePage.tsx');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const userLoader=read('src/services/firestoreData.ts');
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
  assert.match(participation,/LocalizationTranslationStudio/);
  assert.match(contributorStudio,/Translation Studio/);
  assert.match(contributorStudio,/assigned\.includes\('\*'\)\|\|assigned\.includes\(language\.code\)/);
  assert.match(contributorStudio,/canTranslate/);
  assert.match(contributorStudio,/canReview/);
  assert.match(contributorStudio,/submitProposal/);
  assert.match(contributorStudio,/action.*recommend|localizationRequest.*recommend/s);
  assert.match(contributorStudio,/Submit changed/);
  assert.match(contributorStudio,/Needs Translation/);
  assert.match(participation,/Request another language/);
  assert.match(participation,/Existing translation/);
  assert.match(participation,/New language/);
  assert.match(governance,/Awaiting recipient acceptance/);
  assert.match(governance,/Language access requests/);
  assert.match(governance,/90% reviewer recommendation/);
  assert.match(server,/localizationAccess:\{status:'invited',roles:assignedRoles,languages:assignedLanguages\}/);
  assert.match(server,/actionUrl:'\/localization'/);
  assert.match(consolePage,/Assigned languages/);
  assert.match(consolePage,/LocalizationParticipation/);
  assert.match(sidebar,/localization_console/);
  assert.match(userLoader,/localizationAccess/);
});

test('platform stewardship keeps both runtime JS and TypeScript compatibility entry points',()=>{
  const runtime=read('shared/platformStewardship.js');
  const compatibility=read('shared/platformStewardship.ts');
  const programManager=read('server/programManager.ts');
  assert.match(runtime,/platformStewardedResource/);
  assert.match(compatibility,/export function platformStewardedResource/);
  assert.match(compatibility,/export function assertMutableTenantResource/);
  assert.match(programManager,/from '\.\.\/shared\/platformStewardship\.js'/);
});

test('system-wide curriculum, automatic certificate review and baptism tracking stay server-governed',()=>{
  const content=read('api_handlers/admin/content.ts');
  const candidatesApi=read('api_handlers/admin/candidates.ts');
  const candidatesUi=read('src/pages/CandidateEnrollment.tsx');
  const progress=read('api/study/progress.ts');
  const automation=read('server/graduationAutomation.ts');
  const graduations=read('api_handlers/admin/graduations.ts');
  const certificateAward=read('server/certificateAward.ts');
  const certificates=read('src/pages/CertificatesPage.tsx');
  const rules=read('firestore.rules');

  assert.match(content,/where\('sharingScope','==','shared'\)\.where\('published','==',true\)/);
  assert.match(content,/guideSystemWide[\s\S]*sharingScope: guideSystemWide[\s\S]*\? 'shared'/);
  assert.match(candidatesApi,/const systemWide=guideData\.published===true/);
  assert.match(candidatesApi,/baptismScheduledDate/);
  assert.match(candidatesUi,/Baptism scheduled/);
  assert.match(candidatesUi,/action:'updateBaptism'/);
  assert.match(progress,/ensureAutomaticGraduationReview/);
  assert.match(automation,/source:'completion'/);
  assert.match(automation,/Certificate earned — review pending/);
  assert.match(graduations,/awardApprovedCertificate/);
  assert.match(graduations,/mentorAssignments/);
  assert.match(certificateAward,/certificateDocumentId\(candidateId:string,language:string,organizationId:string,guideId:string\)/);
  assert.match(certificates,/Certificate earned — awaiting review/);
  assert.match(rules,/data\.get\('scope',''\) == 'platform'/);
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
  assert.match(api,/sendMessage[\s\S]*createSupportRequest[\s\S]*replySupportRequest[\s\S]*editMessage[\s\S]*deleteMessage/);
  assert.match(api,/action === 'listMyAssignments'/);
});

test('Mentoring & Insights is an operational inbox with responsive drill-down and scoped reads',()=>{
  const page=read('src/pages/MentorshipInsights.tsx');
  const api=read('api/mentorship.ts');
  const css=read('src/pages/admin.css');

  assert.match(page,/type Tab='overview'/);
  assert.match(page,/Needs attention/);
  assert.match(page,/Mentor coverage/);
  assert.match(page,/Interest pipeline/);
  assert.match(page,/Unified communications/);
  assert.match(page,/Support & conversations/);
  assert.match(page,/Support requests/);
  assert.match(page,/Mentor conversations/);
  assert.match(page,/Unread and high priority first/);
  assert.match(page,/vop-mentoring-split/);
  assert.match(page,/Search candidate, subject, topic or doctrine/);
  assert.match(page,/Conversations are ongoing mentor–learner chats and remain separate from formal support requests/);
  assert.match(page,/Draft in-app support/);
  assert.match(page,/Outreach links/);
  assert.match(page,/Support automation/);

  assert.match(api,/collection\('mentorAssignments'\)\.where\('organizationId','==',organizationId\)\.limit\(500\)/);
  assert.match(api,/collection\('mentorConversations'\)\.where\('organizationId','==',organizationId\)\.limit\(300\)/);
  assert.match(api,/collection\('learningSupportRequests'\)\.where\('organizationId','==',organizationId\)\.limit\(200\)/);
  assert.match(api,/const studentIds=\[\.\.\.new Set/);

  assert.match(css,/\.vop-mentoring-overview\{display:grid/);
  assert.match(css,/\.vop-mentoring-split\{display:grid/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.vop-mentoring-split\{grid-template-columns:1fr/);
  assert.match(css,/--mentor-surface:var\(--theme-surface/);
});

test('admin UX consolidation, portal isolation, audit controls and engagement rewards remain wired end-to-end',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  const mentoring=read('src/pages/MentorshipInsights.tsx');
  const organizations=read('src/pages/OrganizationManagement.tsx');
  const engagement=read('api/engagement.ts');
  const points=read('server/engagementPoints.ts');
  const portal=read('src/services/portalAccess.ts');
  const app=read('src/App.tsx');
  const rules=read('firestore.rules');
  const certification=read('src/pages/CertificationConfigStudio.tsx');
  const progress=read('api/study/progress.ts');
  const graduation=read('server/graduationAutomation.ts');
  const programGraduation=read('server/programGraduationAutomation.ts');
  const users=read('src/pages/UserManagement.tsx');
  const candidates=read('src/pages/CandidateEnrollment.tsx');
  const engagementStudio=read('src/pages/EngagementStudio.tsx');
  const engagementPage=read('src/pages/EngagementPage.tsx');
  const learningCss=read('src/pages/learning.css');
  const viewModeToggle=read('src/components/admin/ViewModeToggle.tsx');
  const organizationAccount=read('src/pages/OrganizationAccountProfilePage.tsx');
  const personalSettings=read('src/pages/PersonalSettingsPage.tsx');

  assert.match(mentoring,/type Tab='overview'\|'operations'\|'support'\|'insights'\|'outreach'/);
  assert.doesNotMatch(mentoring,/type OperationsPanel=/);
  assert.doesNotMatch(mentoring,/type SupportPanel=/);
  assert.doesNotMatch(mentoring,/type InsightsPanel=/);
  assert.match(mentoring,/type CommunicationView='support'\|'conversations'/);
  assert.match(mentoring,/type OperationsView='allocation'\|'outreach'\|'automation'/);
  assert.match(mentoring,/type InsightsView='learner'\|'assessment'/);
  assert.match(mentoring,/vop-mentoring-subtabs vop-communication-tabs/);
  assert.match(mentoring,/vop-mentoring-subtabs vop-workspace-tabs/);
  assert.match(mentoring,/communicationView==='support'/);
  assert.match(mentoring,/communicationView==='conversations'/);
  assert.match(mentoring,/Support request/);
  assert.match(mentoring,/Mentor conversation/);
  assert.match(mentoring,/tab==='operations'&&<section[\s\S]*Mentoring operations/);
  assert.match(mentoring,/operationsView==='allocation'/);
  assert.match(mentoring,/operationsView==='outreach'/);
  assert.match(mentoring,/operationsView==='automation'/);
  assert.match(mentoring,/Mentor allocation/);
  assert.match(mentoring,/Performance-based outreach draft/);
  assert.match(mentoring,/Support automation/);
  assert.match(mentoring,/tab==='support'&&<section[\s\S]*Support & conversations/);
  assert.match(mentoring,/tab==='insights'&&<section[\s\S]*Performance & insights/);
  assert.match(mentoring,/insightsView==='learner'/);
  assert.match(mentoring,/insightsView==='assessment'/);
  assert.match(mentoring,/Individual learner performance/);
  assert.match(mentoring,/Assessment insights/);

  assert.match(admin,/ADMIN_NAV_GROUPS/);
  assert.match(admin,/Find an admin tool/);
  assert.match(admin,/expandedNavGroups/);
  assert.doesNotMatch(admin,/renderLegacyStudio/);
  assert.doesNotMatch(admin,/vop-editor-toolbar/);
  assert.match(admin,/ViewModeToggle value=\{languageView\}/);
  assert.match(admin,/Previous language page/);
  assert.match(admin,/Next language page/);
  assert.match(admin,/label:'Account'/);
  assert.match(admin,/accountNotifications/);
  assert.match(admin,/accountInvitations/);
  assert.match(admin,/accountPayments/);
  assert.match(admin,/accountProfile/);
  assert.match(admin,/accountPersonalSettings/);
  assert.match(admin,/accountCertificates/);
  assert.match(admin,/accountAbout/);
  assert.match(admin,/Organization portal/);
  assert.match(admin,/Admin panel/);
  assert.match(app,/isOrganizationPortalAccount\(currentUser\)/);
  assert.match(app,/Organization staff accounts use the organization portal/);
  assert.match(organizationAccount,/Organization account profile/);
  assert.match(organizationAccount,/updateOwnProfile/);
  assert.match(personalSettings,/context\?: 'learner'\|'organization'/);
  assert.match(personalSettings,/organizationAccount/);
  assert.match(personalSettings,/Light \(default\)/);

  assert.match(organizations,/Delete selected/);
  assert.match(organizations,/Clear all/);
  assert.match(organizations,/Select all audit records/);
  assert.match(organizations,/auditView==='table'/);
  assert.match(organizations,/auditView==='cards'/);
  assert.match(organizations,/organizationView==='table'/);
  assert.match(organizations,/organizationView==='cards'/);
  assert.match(viewModeToggle,/AdminViewMode='table'\|'cards'/);
  assert.match(users,/ViewModeToggle value=\{viewMode\}/);
  assert.match(candidates,/ViewModeToggle value=\{viewMode\}/);
  assert.match(engagementStudio,/ViewModeToggle value=\{viewMode\}/);
  assert.match(users,/viewMode==='table'/);
  assert.match(candidates,/viewMode==='table'/);
  assert.match(engagementStudio,/viewMode==='table'/);

  for(const key of ['soloChallenge','duelChallenge','memoryReview','practiceQuiz','chapterQuiz','finalExam']){
    assert.match(points,new RegExp(key));
    assert.match(admin,new RegExp(key));
  }
  assert.match(engagement,/mode:'solo'/);
  assert.match(engagement,/kind:'duelChallenge'/);
  assert.match(engagement,/soloChallenges/);
  assert.match(engagement,/arena:\{/);
  assert.match(engagement,/rewards:\{soloChallenge:pointRules\.soloChallenge,duelChallenge:pointRules\.duelChallenge\}/);
  assert.match(engagement,/scriptureChallengeResults/);
  assert.match(engagement,/timestampMillis/);
  assert.match(points,/pointsLedger/);
  assert.match(engagementPage,/Scripture Memory/);
  assert.match(engagementPage,/Reviewed verses never disappear/);
  assert.match(engagementPage,/memoryView==='reviewed'/);
  assert.match(engagementPage,/Practice again/);
  assert.match(engagementPage,/practice:true/);
  assert.match(engagementPage,/moved to Reviewed and scheduled for later/);
  assert.match(engagement,/reviewed,scheduled,all/);
  assert.match(engagement,/practice=b\.practice===true/);
  assert.match(engagement,/pointsAwarded:0,practice:true/);
  assert.match(engagementPage,/Scripture Arena/);
  assert.match(engagementPage,/Arena missions/);
  assert.match(engagementPage,/duelSoloJoin/);
  assert.match(engagementPage,/Recent Arena results/);
  assert.match(engagementPage,/Level \{arena\.level\}/);
  assert.match(learningCss,/\.vop-arena-dashboard/);
  assert.match(learningCss,/\.vop-arena-mode-grid/);

  assert.match(portal,/hasAdminPortalAccess/);
  assert.match(portal,/Boolean\(user\.organizationId\).*ADMIN_ORGANIZATION_ROLES/);
  assert.match(portal,/Boolean\(user\.organizationId\)[\s\S]*MENTOR_ROLES/);
  assert.match(portal,/defaultPortalRoute/);
  assert.match(app,/PORTAL_SESSION_STORAGE_KEY/);
  assert.match(app,/defaultPortalRoute\(profile\)/);
  assert.match(rules,/exists\(\/databases\/\$\(database\)\/documents\/organizations\/\$\(orgId\)\/members\/\$\(request\.auth\.uid\)\)/);
  assert.match(rules,/members\/\$\(request\.auth\.uid\)\)\.data\.get\('active', false\) == true/);

  assert.match(certification,/releaseMode\?: 'automatic' \| 'review'/);
  assert.match(certification,/Automatic — issue immediately after verified completion/);
  assert.match(progress,/finalizeAutomaticCertificateRelease/);
  assert.match(progress,/awardApprovedCertificate/);
  assert.match(progress,/awardApprovedProgramCertificate/);
  assert.match(graduation,/text\(config\.releaseMode\)==='review'\?'review':'automatic'/);
  assert.match(programGraduation,/text\(config\.releaseMode\)==='review'\?'review':'automatic'/);
});

test('candidate contextual support covers doctrine, lesson references, mentor/team routing and evangelism follow-up',()=>{
  const support=read('src/pages/SupportPage.tsx');
  const api=read('api/mentorship.ts');
  const mentor=read('src/pages/MentorWorkspace.tsx');
  const admin=read('src/pages/MentorshipInsights.tsx');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const drawer=read('src/components/layout/MenuDrawer.tsx');
  const routing=read('src/services/notificationRouting.ts');

  assert.match(api,/action === 'createSupportRequest'/);
  assert.match(api,/learningSupportRequests/);
  assert.match(api,/CHAT_REFERENCE_TYPES/);
  assert.match(api,/'challenge','duel','resource','event','prayer','media','announcement'/);
  assert.match(api,/CHAT_REFERENCE_ROUTES/);
  assert.match(api,/supportTeamRecipients/);
  assert.match(api,/activeMentorFor/);
  assert.match(api,/one_voice_27/);
  assert.match(api,/action === 'replySupportRequest'/);
  assert.match(api,/action === 'updateSupportRequest'/);
  assert.match(api,/\/admin\/mentorship/);

  assert.match(support,/Organization support team/);
  assert.match(support,/Mentor \+ support team/);
  assert.match(support,/WhatsApp \+ VOP record/);
  assert.match(support,/Doctrine/);
  assert.match(support,/One Voice 27 follow-up/);
  assert.match(support,/I want to discuss baptism/);
  assert.match(mentor,/Candidate support queue/);
  assert.match(admin,/Support & conversations/);
  assert.match(admin,/Support requests/);
  assert.match(admin,/Mentor conversations/);
  assert.match(admin,/WhatsApp \{target\.label\}/);
  assert.match(sidebar,/Learning & spiritual support/);
  assert.match(drawer,/Learning & spiritual support/);

  assert.match(routing,/if\(path\.startsWith\('\/admin'\)\|\|type==='user'\)return 'admin';[\s\S]*type==='learning-support'/);
});

test('lesson reader hands exact study context into support and evangelism follow-up remains operational',()=>{
  const app=read('src/App.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  const support=read('src/pages/SupportPage.tsx');
  const context=read('src/services/supportContext.ts');
  const api=read('api/mentorship.ts');
  const admin=read('src/pages/MentorshipInsights.tsx');

  assert.match(reader,/Ask about this page/);
  assert.match(reader,/referenceType:currentSection\?'section':'topic'/);
  assert.match(reader,/guideId:guide\.id/);
  assert.match(reader,/lessonId:lesson\.id/);
  assert.match(app,/saveSupportContextPrefill\(context\)/);
  assert.match(app,/navigate\('support'\)/);
  assert.match(support,/consumeSupportContextPrefill/);
  assert.match(context,/vop_support_context_v1/);

  assert.match(api,/SUPPORT_FOLLOW_UP_STATUSES/);
  assert.match(api,/followUpStatus=spiritualInterest==='none'\?'not_required':'new'/);
  assert.match(api,/followUpScheduledAt/);
  assert.match(admin,/Bible study/);
  assert.match(admin,/Baptism/);
  assert.match(admin,/One Voice 27/);
  assert.match(admin,/onClick=\{\(\)=>void updateEvangelismFollowUp\('scheduled'\)\}/);
  assert.match(admin,/onClick=\{\(\)=>void updateEvangelismFollowUp\('completed'\)\}/);
});

test('assessment architecture separates classification and policy and starts attempts on the server',()=>{
  const manager=read('src/pages/QuizLibrary.tsx');
  const api=read('api/quizzes.ts');
  const study=read('api/study/progress.ts');
  const modal=read('src/components/quiz/QuizModal.tsx');
  assert.match(api,/attachment==='guide'\?'final_exam':attachment==='chapter'\?'chapter_quiz':'practice'/);
  for(const field of [
    'assessmentInstructions','assessmentTimeLimitMinutes','assessmentPassThreshold',
    'assessmentMaxAttemptsMode','assessmentMaxAttempts','assessmentRetakeCooldownMinutes','assessmentFeedbackMode',
  ])assert.match(manager,new RegExp(field));
  assert.match(study,/action === 'startQuiz'/);
  assert.match(study,/assessmentSessions/);
  assert.match(study,/expiresAt/);
  assert.match(modal,/beginQuizAttempt/);
  assert.match(modal,/instructions/);
  assert.match(modal,/remainingSeconds/);
  assert.match(modal,/previouslyAttempted/);
  assert.match(modal,/previousScore/);
  assert.match(modal,/Retake quiz/);
  assert.match(modal,/Retake exam/);
  assert.match(modal,/Retake replaces the current assessment credit/);
  assert.match(modal,/Revoke result/);
  assert.match(modal,/attemptStartLock/);
  assert.doesNotMatch(modal,/const retakeAllowed=/);
  assert.match(modal,/let startQuiz enforce the current authoritative policy/);
  assert.match(modal,/quiz\.check_retake_availability/);
  assert.match(modal,/Never infer retake eligibility from cached client state/);
  assert.match(modal,/const requestStart=\(\)=>\{[\s\S]*void startAttempt\(false\)/);
  assert.match(modal,/setConfirmingRetake\(false\);[\s\S]*const permanentlyBlocked=/);
  assert.match(modal,/vop-retake-policy-error/);
  assert.match(modal,/1 total attempt \(retakes disabled\)/);
  assert.match(study,/ASSESSMENT_RETAKE_CONFIRMATION/);
  assert.match(study,/creditStatus:'revoked_for_retake'/);
  assert.match(study,/questions:attemptQuestions/);
  assert.match(study,/platformSettingsSnap/);
  assert.match(study,/settingsData=\{\.\.\.platformSettings,\.\.\.scopedSettings\}/);
  assert.match(study,/explicitAttemptOverride=String\(lesson\.assessmentMaxAttemptsMode\|\|''\)==='custom'/);
  assert.match(study,/Legacy assessmentMaxAttempts values are not authoritative by themselves/);
  assert.match(manager,/Inherit organization policy/);
  assert.match(manager,/Custom for this assessment/);
  assert.match(api,/assessmentMaxAttemptsMode=data\.assessmentMaxAttemptsMode==='custom'\?'custom':'inherit'/);
  assert.match(study,/maxAttempts>0&&priorAttempts>=policy\.maxAttempts/);
  assert.match(study,/const retryAtForAttempt=retakeCooldownMinutes>0/);
  assert.match(study,/activeSessionId/);
  assert.match(study,/gradingQuestionsSnapshot/);
  assert.match(study,/submissionResult/);
  assert.match(study,/replayed:true/);
});


test('platform finance administration is Super Admin-only while organizations consume subscription packages',()=>{
  const admin=read('src/pages/PaymentManagement.tsx');
  const consumer=read('src/pages/PaymentsPage.tsx');
  const api=read('api/payments.ts');
  const core=read('server/payments/core.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const serverPermissions=read('server/permissions.ts');
  const sharedPermissions=read('shared/permissions.ts');

  assert.match(admin,/Plans & subscriptions/);
  assert.match(admin,/isSuperAdmin&&tab==='items'/);
  assert.match(admin,/isSuperAdmin&&tab==='providers'/);
  assert.match(admin,/isSuperAdmin&&tab==='reconciliation'/);
  assert.match(admin,/New subscription package/);
  assert.match(core,/requireSuperAdminFinanceControl\(ctx,'payable item administration'\)/);
  assert.match(core,/requireSuperAdminFinanceControl\(ctx,'payment provider administration'\)/);
  assert.match(core,/requireSuperAdminFinanceControl\(ctx,'payment reconciliation'\)/);
  assert.match(core,/requireInstitutionalSubscriptionConsumer/);
  assert.match(core,/billingTenantSubscriptionRef/);
  assert.match(core,/selectProviderForMethod/);
  assert.match(core,/scopedTransactionProjection/);
  assert.match(serverPermissions,/resource === 'payable_items'/);
  assert.match(sharedPermissions,/resource === 'payable_items'/);
  assert.match(api,/json\(\{ok:true,items\}\)/);
  assert.doesNotMatch(api,/checkoutOptions/);
  assert.match(plans,/action === 'listAvailablePlans'/);
  assert.match(plans,/Only the VOP Super Admin can access subscription package administration/);
  assert.match(plans,/subscription_'\+planId/);
  assert.match(plans,/upsertPayableItem/);
  assert.match(consumer,/Subscription packages/);
  assert.doesNotMatch(consumer,/Payment provider/);
  assert.doesNotMatch(consumer,/selectedProvider/);
  assert.doesNotMatch(consumer,/providerKey/);
});

test('organization plan limits are consolidated into the subscription entitlement domain',()=>{
  const organizationPage=read('src/pages/OrganizationManagement.tsx');
  const organizationApi=read('api_handlers/admin/organizations.ts');
  const paymentAdmin=read('src/pages/PaymentManagement.tsx');
  const workspace=read('src/components/admin/SubscriptionWorkspace.tsx');
  const plans=read('api_handlers/admin/plans.ts');
  const core=read('server/payments/core.ts');
  const shared=read('shared/subscriptions.ts');

  assert.doesNotMatch(organizationPage,/quotaPayload/);
  assert.doesNotMatch(organizationPage,/api\('getUsage'/);
  assert.doesNotMatch(organizationPage,/admin\.usage_limits/);
  assert.match(organizationPage,/Subscription & plan/);
  assert.match(organizationPage,/Open Billing & Subscriptions/);
  assert.match(organizationApi,/Plan, feature entitlements and usage limits are managed through Billing & Subscriptions/);
  assert.doesNotMatch(organizationApi,/plan: typeof data\.plan/);
  assert.doesNotMatch(organizationApi,/quotas: ctx\.isSuperAdmin/);

  assert.match(paymentAdmin,/Billing & Subscriptions/);
  assert.match(paymentAdmin,/Plans & subscriptions/);
  assert.match(paymentAdmin,/SubscriptionWorkspace/);
  assert.match(workspace,/Usage against plan limits/);
  assert.match(workspace,/Plan entitlements/);
  assert.match(workspace,/Cancel at period end/);
  assert.match(workspace,/Assign manually/);
  assert.match(workspace,/Below current institutional usage/);

  assert.match(shared,/SUBSCRIPTION_QUOTAS/);
  assert.match(shared,/SUBSCRIPTION_FEATURES/);
  assert.match(plans,/billingTenantUsageSnapshot/);
  assert.match(plans,/planSnapshot/);
  assert.match(plans,/currentPeriodStart/);
  assert.match(plans,/currentPeriodEnd/);
  assert.match(plans,/cancelAtPeriodEnd/);
  assert.match(core,/planVersion/);
  assert.match(core,/planSnapshot:entitlementSnapshot/);
  assert.match(core,/cancelled=data\.cancelAtPeriodEnd===true/);
});

test('organization certification stays visible and degrades to a locked workspace instead of disappearing',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  const certification=read('src/pages/CertificationManager.tsx');

  assert.match(admin,/item\.id!=='certification'&&organizationAdmin&&subscriptionFeature&&subscriptionFeatures/);
  assert.match(admin,/else if\(item\.id==='certification'\)\{[\s\S]*coreTenantAdmin\|\|canSee\(item\.id\)/);
  assert.match(admin,/featureAvailable=\{isSuperAdmin\|\|subscriptionFeatures===null/);
  assert.match(admin,/onOpenBilling=\{\(\)=>navigateAdminTab\('payments'\)\}/);

  assert.match(certification,/Certification is not included in the current subscription/);
  assert.match(certification,/You can still review existing certification records/);
  assert.match(certification,/disabled=\{!featureAvailable\|\|decidingRequestId === request\.id\}/);
  assert.match(certification,/item\.status==='Certified'&&featureAvailable/);
});

test('subscription capabilities are enforced server-side and reflected in institutional admin navigation',()=>{
  const permissions=read('server/permissions.ts');
  const admin=read('src/pages/AdminPage.tsx');
  const enrollCandidate=read('api_handlers/admin/enrollCandidate.ts');
  const candidates=read('api_handlers/admin/candidates.ts');
  const mentorship=read('api/mentorship.ts');
  const graduations=read('api_handlers/admin/graduations.ts');
  const graduationAutomation=read('server/graduationAutomation.ts');
  const contentApi=read('api_handlers/admin/content.ts');

  assert.match(permissions,/SUBSCRIPTION_FEATURE_BY_RESOURCE/);
  assert.match(permissions,/curriculum:'curriculum'/);
  assert.match(permissions,/lessons:'curriculum'/);
  assert.match(permissions,/quizzes:'curriculum'/);
  assert.match(permissions,/certificates:'certification'/);
  assert.match(permissions,/mentoring:'mentorship'/);
  assert.match(permissions,/Object\.prototype\.hasOwnProperty\.call\(entitlements,feature\)/);
  assert.match(permissions,/subscription plan does not include/);
  assert.match(permissions,/plan\|\|'\'\)\.trim\(\)==='unsubscribed'/);
  assert.match(permissions,/requireSubscriptionFeature/);
  assert.match(permissions,/requireOrganizationSubscriptionFeature/);

  assert.match(enrollCandidate,/requireSubscriptionFeature\(ctx,'candidates',organizationId\)/);
  assert.match(candidates,/requireSubscriptionFeature\(ctx,'candidates',organizationId\)/);
  assert.match(candidates,/requireSubscriptionFeature\(ctx,'candidates',candidateOrganizationId\)/);
  assert.match(mentorship,/requireOrganizationSubscriptionFeature\(db,'mentorship',organizationId\)/);
  assert.match(graduations,/requireSubscriptionFeature\(ctx,'certification',ctx\.organizationId\)/);
  assert.match(graduations,/requireSubscriptionFeature\(ctx,'certification',requestOrganizationId\)/);
  assert.match(graduationAutomation,/organizationSubscriptionFeatureBlockReason\(db,'certification',organizationId\)/);
  assert.match(contentApi,/required\|subscription\|organization/);

  assert.match(admin,/loadInstitutionalSubscriptionState/);
  assert.match(admin,/currentUser\.adminNodeId/);
  assert.match(admin,/exhaustedQuotaKeys/);
  assert.match(admin,/freeTier/);
  assert.match(admin,/SUBSCRIPTION_FEATURES\.map\(feature=>\[feature\.key,false\]\)/);
  assert.match(admin,/subscriptionFeatureForTab/);
  assert.match(admin,/candidates:'candidates'/);
  assert.match(admin,/certification:'certification'/);
  assert.match(admin,/mentorship:'mentorship'/);
  assert.match(admin,/Object\.hasOwn\(subscriptionFeatures,subscriptionFeature\)/);
});

test('subscription metering follows the resource-owning institutional tenant and exposes all plan quotas',()=>{
  const shared=read('shared/subscriptions.ts');
  const tenant=read('server/tenant.ts');
  const content=read('api_handlers/admin/content.ts');
  const programs=read('server/programManager.ts');
  const permissions=read('server/permissions.ts');

  assert.match(shared,/maxPrograms/);
  assert.match(shared,/maxLearningPaths/);
  assert.match(shared,/maxBibleTopics/);
  assert.match(shared,/maxSeasons/);
  assert.match(shared,/maxEvents/);

  assert.match(tenant,/billingTenantFromContext/);
  assert.match(tenant,/ownedBillingTenantCollectionCount/);
  assert.match(tenant,/ownerTenantId','==',ownerTenantId/);
  assert.match(tenant,/enforceBillingTenantQuota/);
  assert.match(tenant,/billingTenantUsageSnapshot/);
  assert.match(tenant,/maxPrograms/);
  assert.match(tenant,/maxEvents/);

  assert.match(content,/SUBSCRIPTION_FEATURE_BY_COLLECTION/);
  assert.match(content,/const enforceOwnedQuota=/);
  assert.match(content,/enforceBillingTenantQuota\(ctx\.db,target\.type,target\.id,collectionName,quotaKey,increment\)/);
  assert.match(content,/const requireOwnedFeature=/);
  assert.match(content,/requireSubscriptionFeature\(ctx,feature,''\)/);
  assert.match(content,/collection==='events'\?'maxEvents'/);

  assert.match(programs,/billingTenantFromContext/);
  assert.match(programs,/requireSubscriptionFeature\(ctx,'curriculum',''\)/);
  assert.match(programs,/enforceBillingTenantQuota\(ctx\.db,billingTarget\.type,billingTarget\.id,'programs','maxPrograms'\)/);

  assert.match(permissions,/billingTenantSubscriptionFeatureBlockReason/);
  assert.match(permissions,/billingTenantFromContext/);
  assert.match(permissions,/NON_EXPANSIVE_ACTIONS/);
  assert.match(permissions,/\['view','read','delete'\]/);
});

test('hierarchy curriculum writes consume the hierarchy tenant plan while retaining descendant delivery scope',()=>{
  const content=read('api_handlers/admin/content.ts');
  const quizzes=read('api/quizzes.ts');

  assert.match(content,/enforceBillingTenantQuota/);
  assert.match(content,/requireSubscriptionFeature\(ctx,feature,''\)/);
  assert.match(content,/organizationId:effectiveOrganizationId/);
  assert.match(content,/organizationId:effectiveOrganizationId, copiedLessons:lessons\.size/);

  assert.match(quizzes,/requireSubscriptionFeature\(ctx,'curriculum',''\)/);
  assert.match(quizzes,/enforceBillingTenantQuota\(ctx\.db,billingTarget\.type,billingTarget\.id,'quizzes','maxQuizzes'\)/);
  assert.match(quizzes,/organizationId:current\.organizationId \|\| target\.organizationId/);
});

test('subscription quota editor preserves unlimited values and usage counts only active resources',()=>{
  const payment=read('src/pages/PaymentManagement.tsx');
  const tenant=read('server/tenant.ts');
  const shared=read('shared/subscriptions.ts');

  assert.match(payment,/Number\(value\)<0\?'':String\(value\)/);
  assert.match(payment,/left blank for Unlimited/);
  assert.match(payment,/type="number" min="0" step="1"/);
  assert.doesNotMatch(payment,/Math\.max\(0,Math\.trunc\(Number\(value\)\|\|0\)\)/);

  assert.match(tenant,/document\.data\(\)\?\.archived!==true/);
  assert.match(tenant,/currentUsage=await ownedCollectionCount/);
  assert.match(shared,/Active, non-archived organization-owned curriculum guides/);
  assert.match(shared,/Active, non-archived organization-owned assessment records/);
});

test('legacy assessment attempt counters are versioned and reconciled before limit enforcement',()=>{
  const progress=read('api/study/progress.ts');
  assert.match(progress,/ASSESSMENT_ATTEMPT_POLICY_VERSION = 2/);
  assert.match(progress,/storedPolicyVersion<ASSESSMENT_ATTEMPT_POLICY_VERSION/);
  assert.match(progress,/currentPolicy\.exists&&!legacyPolicy[\s\S]{0,120}relevant\.length/);
  assert.match(progress,/policyVersion:ASSESSMENT_ATTEMPT_POLICY_VERSION/);
  assert.match(progress,/legacyCounterReconciledAt:FieldValue\.serverTimestamp\(\)/);
});

test('study progress reserves HTTP 409 for assessment session state conflicts',()=>{
  const progress=read('api/study/progress.ts');
  const conflictCount=(progress.match(/status\(409\)/g)||[]).length;
  const sessionConflictCount=(progress.match(/code:'ASSESSMENT_SESSION_[A-Z_]+'/g)||[]).length;
  assert.ok(conflictCount>0);
  assert.equal(conflictCount,sessionConflictCount);
  assert.doesNotMatch(progress,/status\(409\)[\s\S]{0,200}ASSESSMENT_CONTENT_CHANGED/);
  assert.doesNotMatch(progress,/status\(409\)[\s\S]{0,200}ASSESSMENT_CONFIGURATION/);
  assert.match(progress,/Only study lessons support resume positions/);
  assert.match(progress,/Only study lessons can be marked complete/);
});

test('subscription authorization checks the live term instead of waiting for the daily cron',()=>{
  const tenant=read('server/tenant.ts');
  const permissions=read('server/permissions.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const vercel=read('vercel.json');

  assert.match(tenant,/organizationSubscriptionTermBlockReason/);
  assert.match(tenant,/currentPeriodEnd/);
  assert.match(tenant,/subscription term has ended/);
  assert.match(tenant,/enforceOrganizationQuota[\s\S]*organizationSubscriptionTermBlockReason/);
  assert.match(tenant,/enforceOrganizationMembershipQuotas[\s\S]*organizationSubscriptionTermBlockReason/);

  assert.match(permissions,/billingTenantSubscriptionTermBlockReason/);
  assert.match(permissions,/billingTenantSubscriptionFeatureBlockReason[\s\S]*billingTenantSubscriptionTermBlockReason/);
  assert.match(plans,/billingAccessSuspended:storedSuspended\|\|Boolean\(liveTermBlock\)/);
  assert.match(plans,/effectiveSubscriptionStatus=liveExpired\?'expired'/);
  assert.match(vercel,/\/api\/payments\/reconcile-cron/);
});

test('free subscription plans never enter the positive-amount payment pipeline',()=>{
  const billing=read('server/billing.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const workspace=read('src/components/admin/SubscriptionWorkspace.tsx');

  assert.match(billing,/if\(priceUsd===0\)/);
  assert.match(billing,/amountMinor:0,amountDecimal:'0\.00'/);
  assert.match(billing,/fxSource:'free-plan'/);

  assert.match(plans,/action === 'activateFreePlan'/);
  assert.match(plans,/Paid subscription packages must be activated through secure checkout/);
  assert.match(plans,/activationSource:'free_plan'/);
  assert.match(plans,/currentPeriodStart:startedAt,currentPeriodEnd:null/);
  assert.match(plans,/if \(data\.active && data\.priceUsd > 0\)/);

  assert.match(workspace,/Activate free plan/);
  assert.match(workspace,/action:'activateFreePlan'/);
  assert.match(workspace,/const freePlan=Number\(plan\.priceUsd\?\?plan\.price\?\?0\)===0/);
  assert.match(workspace,/>Free<\/strong>/);
});

test('all organization creation paths attach the default free subscription',()=>{
  const organizations=read('api_handlers/admin/organizations.ts');
  const onboarding=read('api_handlers/admin/onboarding.ts');

  assert.match(organizations,/ensureOrganizationDefaultSubscription\(bootstrapDb,organizationId,ctx\.auth\.uid\)/);
  assert.match(onboarding,/ensureOrganizationDefaultSubscription\(ctx\.db,organizationId,ctx\.auth\.uid\)/);
  assert.match(onboarding,/defaultSubscriptionPlanId/);
  assert.match(onboarding,/effectivePlan/);
});

test('organizations without a plan automatically receive the default free subscription',()=>{
  const tenant=read('server/tenant.ts');
  const organizations=read('api_handlers/admin/organizations.ts');
  const permissions=read('server/permissions.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const payments=read('src/pages/PaymentManagement.tsx');

  assert.match(tenant,/defaultFreeSubscriptionPlan/);
  assert.match(tenant,/ensureOrganizationDefaultSubscription/);
  assert.match(tenant,/defaultForUnsubscribed===true/);
  assert.match(tenant,/activationSource:'automatic_free_plan'/);
  assert.match(tenant,/currentPeriodEnd:null/);
  assert.match(tenant,/renewalMode:'none'/);

  assert.match(organizations,/ensureOrganizationDefaultSubscription\(bootstrapDb,organizationId,ctx\.auth\.uid\)/);
  assert.match(permissions,/ensureBillingTenantDefaultSubscription\(db,billingTenantType,billingTenantId\)/);
  assert.match(plans,/await ensureBillingTenantDefaultSubscription\(ctx\.db,target\.type,target\.id,ctx\.auth\.uid\)/);
  assert.match(plans,/defaultForUnsubscribed:priceUsd===0/);
  assert.match(plans,/where\('defaultForUnsubscribed','==',true\)/);

  assert.match(payments,/Default free plan for institutions without a subscription/);
  assert.match(payments,/defaultForUnsubscribed:price===0&&packageDraft\.active/);
});

test('notification and invitation workflows are visible, actionable and routed to their destination',()=>{
  const app=read('src/App.tsx');
  const types=read('src/types/index.ts');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const drawer=read('src/components/layout/MenuDrawer.tsx');
  const tools=read('src/components/layout/CommunicationTools.tsx');
  const inbox=read('src/pages/InboxPage.tsx');
  const notificationPage=read('src/pages/NotificationsPage.tsx');
  const invitationPage=read('src/pages/InvitationsPage.tsx');
  const notifications=read('api_handlers/admin/notifications.ts');
  const organizations=read('api_handlers/admin/organizations.ts');
  const mentoring=read('api/mentorship.ts');
  const localization=read('api_handlers/admin/localization.ts');
  const prayer=read('api/prayer.ts');
  const graduation=read('api_handlers/admin/graduations.ts');
  assert.match(types,/\| 'notifications'/);
  assert.match(types,/\| 'invites'/);
  assert.match(app,/currentRoute === 'notifications' && <NotificationsPage/);
  assert.match(app,/currentRoute === 'invites' && <InvitationsPage/);
  assert.match(notificationPage,/fixedMode="notifications"/);
  assert.match(invitationPage,/fixedMode="invites"/);
  assert.match(inbox,/if\(activeMode==='notifications'\)/);
  assert.match(inbox,/organizationAction<\{items\?:InviteItem\[\]\}>\('listInvites'\)/);
  assert.match(sidebar,/route:'notifications'/);
  assert.match(sidebar,/route:'invites'/);
  assert.match(drawer,/route: 'notifications'/);
  assert.match(drawer,/route: 'invites'/);
  assert.match(tools,/setInterval\(refresh,60000\)/);
  assert.match(tools,/loadNotificationSummary/);
  assert.match(tools,/loadCommunicationSummary/);
  assert.match(tools,/vop-communication-banner/);
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
  assert.match(notifications,/authenticateNotificationAccount/);
  assert.match(notifications,/const ownAction=\['summary','list','markRead','markUnread','delete','markAllRead','clearAll'\]/);
  assert.match(notifications,/\.where\('read','==',false\)[\s\S]*\.count\(\)\.get\(\)/);
  assert.match(notifications,/const account=await authenticateNotificationAccount\(req\)/);
  assert.match(notifications,/const ctx=await authenticateTenant\(req,requestedOrganization\|\|undefined,true\)/);
  assert.match(notifications,/\?401/);
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

test('passkey sign-in is server-verified and keeps biometric data on the device',()=>{
  const signIn=read('src/pages/SignInPage.tsx');
  const settings=read('src/pages/PersonalSettingsPage.tsx');
  const client=read('src/services/passkeys.ts');
  const api=read('api_handlers/admin/passkeys.ts');
  const server=read('server/passkeys.ts');
  const rules=read('firestore.rules');

  assert.match(signIn,/<strong>Passkey<\/strong>/);
  assert.match(settings,/Enable passkey on this device/);
  assert.match(settings,/Biometric data remains on your device/);
  assert.match(client,/fetch\('\/api\/admin\/passkeys'/);
  assert.match(client,/navigator\.credentials\.create/);
  assert.match(client,/navigator\.credentials\.get/);
  assert.match(client,/userVerification:'required'/);
  assert.match(client,/attestationObject:encode\(response\.attestationObject\)/);
  assert.match(api,/requireRecentAuthentication/);
  assert.match(api,/parseRegistrationAttestation/);
  assert.match(api,/createCustomToken/);
  assert.match(server,/format!=='none'/);
  assert.match(server,/Passkey did not complete fingerprint, face, PIN, or device verification/);
  assert.match(server,/credentialId!==expectedCredentialId/);
  assert.match(server,/verifySignature\('sha256'/);
  assert.match(rules,/match \/passkeyCredentials\/\{credentialId\}[\s\S]*allow read, write: if false/);
});

test('messaging supports unread banners, edit/delete and rich in-app attachments without leaving chat',()=>{
  const api=read('api/mentorship.ts');
  const chat=read('src/components/messaging/ChatThread.tsx');
  const support=read('src/pages/SupportPage.tsx');
  const mentor=read('src/pages/MentorWorkspace.tsx');
  const tools=read('src/components/layout/CommunicationTools.tsx');

  assert.match(api,/action==='unreadSummary'/);
  assert.match(api,/where\('unreadFor','array-contains',decoded\.uid\)\.count\(\)\.get\(\)/);
  assert.match(api,/action==='editMessage'\|\|action==='deleteMessage'/);
  assert.match(api,/action==='editSupportMessage'\|\|action==='deleteSupportMessage'/);
  assert.match(api,/You can only change messages you sent/);
  assert.match(chat,/Attach VOP content/);
  assert.match(chat,/App activities & games/);
  assert.match(chat,/Solo Scripture Challenge/);
  assert.match(chat,/Ranked Scripture Duel/);
  assert.match(chat,/Scripture Arena/);
  assert.match(chat,/attachmentOptions/);
  assert.match(chat,/Open in VOP/);
  assert.match(chat,/onEdit/);
  assert.match(chat,/onDelete/);
  assert.match(chat,/Message deleted/);
  assert.match(support,/ChatThread/);
  assert.match(support,/APP_CHAT_REFERENCES/);
  assert.match(support,/Attach VOP activity \/ game/);
  assert.match(support,/onEdit=\{editRequestMessage\}/);
  assert.match(support,/onDelete=\{deleteMentorMessage\}/);
  assert.match(mentor,/onEdit=\{editMessage\}/);
  assert.match(mentor,/onDelete=\{deleteSupportMessage\}/);
  assert.match(tools,/unread conversation/);
});

test('Firestore client reads avoid route-change reloads and aggressive notification polling',()=>{
  const app=read('src/App.tsx');
  const publicData=read('src/services/publicFirestore.ts');
  const firestoreData=read('src/services/firestoreData.ts');
  const tools=read('src/components/layout/CommunicationTools.tsx');
  const notifications=read('api_handlers/admin/notifications.ts');

  assert.doesNotMatch(app,/\[currentUser\.uid, currentUser\.organizationId, currentRoute, contentRefresh\]/);
  assert.doesNotMatch(app,/onSnapshot/);
  assert.match(app,/10\*60\*1000/);
  assert.match(app,/vop_public_content_changed/);
  assert.match(app,/loadPublicContent\(currentUser\.uid \? currentUser : undefined,loadMode\)/);
  assert.match(app,/dataModeForRoute\(currentRoute\)/);
  assert.match(app,/contentLoadMode,contentRefresh/);
  assert.doesNotMatch(app,/currentRoute,contentRefresh/);
  assert.match(publicData,/loadPublicContent\(scopeUser\?: User,mode:PublicContentLoadMode='full'\)/);
  assert.match(publicData,/loadPublicRouteData/);
  assert.match(publicData,/PublicRouteDataKind='events'\|'resources'\|'radio'\|'profile'/);
  assert.match(app,/loadPublicRouteData\(kind,currentUser\)/);
  assert.match(app,/lazyRouteLoadsRef/);
  assert.match(app,/currentRoute==='resources'/);
  assert.match(app,/currentRoute==='radio'/);
  assert.match(app,/currentRoute==='profile'/);
  assert.match(publicData,/mode==='portal'/);
  assert.match(publicData,/loadFirestoreGuides\(undefined,scopeUser\)/);
  assert.match(firestoreData,/scopeUser\?\.uid === currentUser\.uid/);
  assert.match(firestoreData,/offset\+=8/);
  assert.match(tools,/setInterval\(refresh,60000\)/);
  assert.doesNotMatch(tools,/15000/);
  assert.match(notifications,/action==='summary'/);
  assert.match(notifications,/\.count\(\)\.get\(\)/);
});

test('startup path reuses the authoritative profile, scopes refresh cache and deduplicates admin scope reads',()=>{
  const root=read('src/Root.tsx');
  const app=read('src/App.tsx');
  const adminFirestore=read('src/services/adminFirestore.ts');
  const usersApi=read('api_handlers/admin/users.ts');
  const i18n=read('src/services/i18n.ts');

  assert.match(root,/setResolvedProfile\(profile\)/);
  assert.match(root,/<App initialUser=\{resolvedProfile\}/);
  assert.doesNotMatch(root,/fetch\('\/api\/admin\/users'/);
  assert.match(app,/STARTUP_CACHE_META_KEY/);
  assert.match(app,/scope:startupScope\(currentUser\)/);
  assert.match(app,/sessionStorage\.removeItem\(STARTUP_CACHE_META_KEY\)/);
  assert.match(app,/React\.lazy\(\(\)=>import\('\.\/pages\/AdminPage'/);
  assert.match(adminFirestore,/tenantScopeInflight/);
  assert.match(adminFirestore,/expiresAt:Date\.now\(\)\+60_000/);
  assert.match(usersApi,/const needsWrite=/);
  assert.match(usersApi,/if\(needsWrite\)/);
  assert.doesNotMatch(usersApi,/const latest=await ref\.get\(\)/);
  assert.match(i18n,/localizationInitInflight/);
});

test('tenant authentication reuses one organization scope read per request',()=>{
  const tenant=read('server/tenant.ts');
  assert.match(tenant,/const readOrganizationScope=async\(id:string\)=>/);
  assert.match(tenant,/Promise\.all\(\[/);
  assert.match(tenant,/organizationSnap,membershipSnap/);
  assert.match(tenant,/resolvedScope\?\.id===organizationId/);
  assert.doesNotMatch(tenant,/const profileMembership=await/);
});

test('web Google authentication uses popup flow without delaying the root auth observer',()=>{
  const firebaseAuth=read('src/services/firebaseAuth.ts');
  const root=read('src/Root.tsx');
  const vercel=read('vercel.json');
  const vite=read('vite.config.ts');

  assert.match(firebaseAuth,/signInWithPopup/);
  assert.doesNotMatch(firebaseAuth,/signInWithRedirect/);
  assert.doesNotMatch(firebaseAuth,/getRedirectResult/);
  assert.doesNotMatch(firebaseAuth,/completeGoogleRedirectSignIn/);
  assert.doesNotMatch(root,/completeGoogleRedirectSignIn/);
  assert.match(root,/const unsubscribe = onAuthStateChanged/);
  assert.doesNotMatch(vercel,/Cross-Origin-Opener-Policy/);
  assert.doesNotMatch(vite,/Cross-Origin-Opener-Policy/);
});

test('organization records open as read-only browser-navigable pages and require explicit edit mode',()=>{
  const page=read('src/pages/OrganizationManagement.tsx');
  const admin=read('src/pages/AdminPage.tsx');
  const css=read('src/pages/admin.css');
  assert.doesNotMatch(page,/ModalLayer/);
  assert.doesNotMatch(page,/vop-org-editor-backdrop/);
  assert.match(page,/vop-org-detail-page/);
  assert.match(page,/Back to organizations/);
  assert.match(page,/setEditing\(true\)/);
  assert.match(page,/disabled=\{!editing\}/);
  assert.match(page,/Read only/);
  assert.match(page,/Editing is enabled/);
  assert.match(page,/const cancelEditing=\(\)=>/);
  assert.match(page,/restoreOrganizationFields\(selected\)/);
  assert.match(page,/searchParams\.set\('organization',item\.slug\)/);
  assert.match(page,/vop-admin-organization-view-v1:/);
  assert.match(page,/history\.pushState/);
  assert.match(page,/history\.replaceState/);
  assert.match(page,/addEventListener\('popstate'/);
  assert.match(admin,/ADMIN_TAB_STORAGE_PREFIX/);
  assert.match(admin,/params\.get\('organization'\)\)return 'organizations'/);
  assert.match(admin,/navigateAdminTab/);
  assert.match(admin,/addEventListener\('popstate'/);
  assert.match(css,/\.vop-org-detail-page/);
  assert.match(css,/\.vop-org-detail-card/);
});

test('candidate billing, free-tier reminders and Super Admin exemption are enforced as separate concerns',()=>{
  const shared=read('shared/subscriptions.ts');
  const tenant=read('server/tenant.ts');
  const permissions=read('server/permissions.ts');
  const billing=read('server/billing.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const payments=read('src/pages/PaymentManagement.tsx');
  const workspace=read('src/components/admin/SubscriptionWorkspace.tsx');
  const organizations=read('src/pages/OrganizationManagement.tsx');
  const organizationApi=read('api_handlers/admin/organizations.ts');
  const admin=read('src/pages/AdminPage.tsx');
  const reminders=read('server/subscriptionReminders.ts');
  const paymentApi=read('api/payments.ts');

  assert.match(shared,/label:'Member \/ staff seats'/);
  assert.match(shared,/Learners\/candidates do not consume member seats/);
  assert.match(tenant,/const memberSeats=roles\.filter\(role=>!CANDIDATE_MEMBERSHIP_ROLES\.has\(role\)\)\.length/);
  assert.match(tenant,/seats:memberSeats/);
  assert.match(tenant,/nextConsumesMemberSeat=!CANDIDATE_MEMBERSHIP_ROLES\.has\(normalizedRole\)/);
  assert.match(tenant,/audience\.learnersCandidates&&usage\.candidates\+candidateDelta>maxCandidates/);
  assert.match(tenant,/if\(!audience\.organizations\|\|ctx\.isSuperAdmin\)return/);
  assert.match(permissions,/billingTenantAudienceEnabled/);
  assert.match(permissions,/billingTenantFromContext/);

  assert.match(billing,/learnersCandidates:audience\.learnersCandidates===true/);
  assert.match(billing,/organizations:audience\.organizations!==false/);
  assert.match(payments,/Learners \/ candidates require subscription billing/);
  assert.match(payments,/do not require an individual subscription and do not consume member\/staff seats/);
  assert.match(workspace,/Not billed/);
  assert.match(workspace,/Free version active/);
  assert.match(plans,/exhaustedQuotaKeys/);
  assert.match(plans,/freeTier/);

  assert.match(reminders,/RECIPIENT_ROLES=new Set\(\['owner','admin'\]\)/);
  assert.match(reminders,/subscription_free_/);
  assert.match(reminders,/free_subscription_upgrade/);
  assert.match(paymentApi,/remindFreeTierOrganizations\(db,200\)/);

  assert.match(organizationApi,/candidateCount/);
  assert.match(organizationApi,/memberCount:documents\.length-candidates/);
  assert.match(organizations,/const institutionalMembers=members\.filter/);
  assert.match(organizations,/Candidates \/ learners/);
  assert.match(organizations,/Open Candidates workspace/);
  assert.doesNotMatch(organizations,/\['learner','Learner'\].*memberRoleOptions/);

  assert.match(admin,/vop-free-tier-banner/);
  assert.match(admin,/Free plan limit reached/);
  assert.match(admin,/New usage in those categories is blocked/);
  assert.match(admin,/loadInstitutionalSubscriptionState/);
  assert.match(admin,/isHierarchyAdmin&&hierarchyId/);
});

test('unions, conferences, districts and churches are first-class subscription owners',()=>{
  const tenant=read('server/tenant.ts');
  const billing=read('server/billing.ts');
  const plans=read('api_handlers/admin/plans.ts');
  const payments=read('server/payments/core.ts');
  const reminders=read('server/subscriptionReminders.ts');
  const workspace=read('src/components/admin/SubscriptionWorkspace.tsx');
  const management=read('src/pages/PaymentManagement.tsx');

  assert.match(tenant,/BillingTenantType='organization'\|'church'\|'district'\|'conference'\|'union'/);
  assert.match(tenant,/billingTenantSubscriptionRef/);
  assert.match(tenant,/ensureHierarchyDefaultSubscription/);
  assert.match(tenant,/ensureBillingTenantDefaultSubscription/);
  assert.match(tenant,/billingTenantUsageSnapshot/);
  assert.match(tenant,/billingTenantSubscriptionTermBlockReason/);

  assert.match(billing,/quoteSubscriptionPlanForTenant/);
  assert.match(plans,/targetFromRequest/);
  assert.match(plans,/billingTenantType/);
  assert.match(plans,/billingTenantId/);
  assert.match(plans,/validateBillingTenantPlanCapacity/);
  assert.match(plans,/A plan assigned to an active institutional tenant cannot be deleted/);

  assert.match(payments,/requireInstitutionalSubscriptionConsumer/);
  assert.match(payments,/paymentBillingTarget/);
  assert.match(payments,/billingTenantSubscriptionRef/);
  assert.match(payments,/billingTenantRef/);
  assert.match(payments,/billingTenantType,billingTenantId/);
  assert.doesNotMatch(payments,/\(!org&&ctx\.tenantType==='hierarchy'\)/);

  assert.match(reminders,/INSTITUTIONAL_TENANTS/);
  assert.match(reminders,/sendBillingTenantFreeTierUpgradeReminder/);
  assert.match(reminders,/role=billingTenantType\+'_admin'/);

  assert.match(workspace,/BillingTenantOption/);
  assert.match(workspace,/Choose institution/);
  assert.match(workspace,/billingTenantType:selectedTarget\.type/);
  assert.match(management,/billingTenants/);
  assert.match(management,/union_admin/);
  assert.match(management,/collection:'unions'/);
  assert.match(management,/collection:'churches'/);
});

test('notification actions preserve exact admin destinations',()=>{
  const routing=read('src/services/notificationRouting.ts');
  const admin=read('src/pages/AdminPage.tsx');
  assert.match(routing,/vop_notification_admin_target/);
  assert.match(routing,/localization:'translations'/);
  assert.match(routing,/graduations:'certification'/);
  assert.match(routing,/mentorship/);
  assert.match(routing,/adminTargets/);
  assert.match(admin,/consumeNotificationAdminTarget/);
  assert.match(admin,/validAdminTab\(target\)/);
  assert.match(admin,/navigateAdminTab\(target\)/);
});
