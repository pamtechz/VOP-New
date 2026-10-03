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
  assert.match(notifications,/authenticateNotificationAccount/);
  assert.match(notifications,/const ownAction=\['list','markRead','markUnread','delete','markAllRead','clearAll'\]/);
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
  assert.match(admin,/consumeNotificationAdminTarget/);
  assert.match(admin,/validAdminTab\(target\)/);
  assert.match(admin,/navigateAdminTab\(target\)/);
});
