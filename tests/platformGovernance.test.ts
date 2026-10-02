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
  assert.match(modal,/previouslyAttempted/);
  assert.match(modal,/previousScore/);
  assert.match(modal,/Retake quiz/);
  assert.match(modal,/Retake exam/);
  assert.match(modal,/quiz\.retake_waiting_period/);
  assert.match(modal,/Retake replaces the current assessment credit/);
  assert.match(modal,/Revoke result/);
  assert.match(modal,/attemptStartLock/);
  assert.match(study,/ASSESSMENT_RETAKE_CONFIRMATION/);
  assert.match(study,/creditStatus:'revoked_for_retake'/);
  assert.match(study,/questions:attemptQuestions/);
  assert.match(study,/platformSettingsSnap/);
  assert.match(study,/settingsData=\{\.\.\.platformSettings,\.\.\.scopedSettings\}/);
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
  assert.match(core,/requireOrganizationSubscriptionConsumer/);
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
  assert.match(workspace,/Below current organization usage/);

  assert.match(shared,/SUBSCRIPTION_QUOTAS/);
  assert.match(shared,/SUBSCRIPTION_FEATURES/);
  assert.match(plans,/organizationUsageSnapshot/);
  assert.match(plans,/planSnapshot/);
  assert.match(plans,/currentPeriodStart/);
  assert.match(plans,/currentPeriodEnd/);
  assert.match(plans,/cancelAtPeriodEnd/);
  assert.match(core,/planVersion/);
  assert.match(core,/planSnapshot:entitlementSnapshot/);
  assert.match(core,/cancelled=data\.cancelAtPeriodEnd===true/);
});

test('subscription capabilities are enforced server-side and reflected in organization admin navigation',()=>{
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
  assert.match(permissions,/Object\.hasOwn\(entitlements,feature\)/);
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

  assert.match(admin,/loadOrganizationSubscriptionFeatures/);
  assert.match(admin,/SUBSCRIPTION_FEATURES\.map\(feature=>\[feature\.key,false\]\)/);
  assert.match(admin,/subscriptionFeatureForTab/);
  assert.match(admin,/candidates:'candidates'/);
  assert.match(admin,/certification:'certification'/);
  assert.match(admin,/mentorship:'mentorship'/);
  assert.match(admin,/Object\.hasOwn\(subscriptionFeatures,subscriptionFeature\)/);
});

test('subscription metering is based on the resource-owning organization and exposes all plan quotas',()=>{
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

  assert.match(tenant,/ownedCollectionCount\(db,organizationId,'programs'\)/);
  assert.match(tenant,/ownedCollectionCount\(db,organizationId,'events'\)/);
  assert.match(tenant,/enforceOrganizationQuota/);
  assert.match(tenant,/maxPrograms/);
  assert.match(tenant,/maxEvents/);

  assert.match(content,/SUBSCRIPTION_FEATURE_BY_COLLECTION/);
  assert.match(content,/requireOrganizationSubscriptionFeature\(ctx\.db,subscriptionFeature,effectiveOrganizationId\)/);
  assert.match(content,/enforceOrganizationQuota\(ctx\.db,effectiveOrganizationId,collection,quotaKey\)/);
  assert.match(content,/collection==='events'\?'maxEvents'/);

  assert.match(programs,/requireOrganizationSubscriptionFeature\(ctx\.db,'curriculum',targetOrganizationId\)/);
  assert.match(programs,/enforceOrganizationQuota\(ctx\.db,targetOrganizationId,'programs','maxPrograms'\)/);

  assert.match(permissions,/NON_EXPANSIVE_ACTIONS/);
  assert.match(permissions,/\['view','read','delete'\]/);
});

test('hierarchy curriculum writes consume descendant guide and quiz entitlements',()=>{
  const content=read('api_handlers/admin/content.ts');
  const quizzes=read('api/quizzes.ts');

  assert.match(content,/enforceOrganizationQuota\(ctx\.db, effectiveOrganizationId, 'guides', 'maxGuides'\)/);
  assert.match(content,/organizationId:effectiveOrganizationId/);
  assert.match(content,/organizationId:effectiveOrganizationId, copiedLessons:lessons\.size/);

  assert.match(quizzes,/requireOrganizationSubscriptionFeature\(ctx\.db,'curriculum',target\.organizationId\)/);
  assert.match(quizzes,/enforceOrganizationQuota\(ctx\.db,target\.organizationId,'quizzes','maxQuizzes'\)/);
  assert.doesNotMatch(quizzes,/enforceQuota\(ctx, 'quizzes', 'maxQuizzes'\)/);
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

test('study progress reserves HTTP 409 for assessment session state conflicts',()=>{
  const progress=read('api/study/progress.ts');
  const conflictLines=progress.split('\n').filter(line=>line.includes('status(409)'));
  assert.ok(conflictLines.length>0);
  for(const line of conflictLines){
    assert.match(line,/ASSESSMENT_SESSION_|session/);
  }
  assert.doesNotMatch(progress,/status\(409\).*ASSESSMENT_CONTENT_CHANGED/);
  assert.doesNotMatch(progress,/status\(409\).*ASSESSMENT_CONFIGURATION/);
  assert.match(progress,/Only study lessons support resume positions/);
  assert.match(progress,/Only study lessons can be marked complete/);
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

test('notification actions preserve exact admin destinations',()=>{
  const routing=read('src/services/notificationRouting.ts');
  const admin=read('src/pages/AdminPage.tsx');
  assert.match(routing,/vop_notification_admin_target/);
  assert.match(routing,/localization:'translations'/);
  assert.match(routing,/graduations:'certification'/);
  assert.match(admin,/consumeNotificationAdminTarget/);
  assert.match(admin,/validAdminTab\(target\)/);
  assert.match(admin,/navigateAdminTab\(target\)/);
});
