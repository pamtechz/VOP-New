import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const checks = [
  ['server/tenant.ts', [
    "String(profile.role || '') === 'super_admin'",
    "organizationId = isSuperAdmin",
    "requestedId !== profileOrganizationId",
    "canEditCanonicalContent",
    "tenantType: 'platform' | 'organization' | 'hierarchy'",
    "tenantType: 'hierarchy'",
    "tenantOwnerKey",
    "ownerTenantId",
    "ownerUid",
    "ctx.tenantType === 'hierarchy'",
    'requestedMembership',
    "collectionGroup('members')",
    'organizationInHierarchyScope',
    'accessibleOrganizationIds', 'canManageOrganizationContent'
  ]],
  ['tests/firestoreRules.test.mjs', ['hierarchy tenant scope','radio-owned','candidate-2','Updated Scoped Tenant','system/permissions']],
  ['firestore.rules', [
    "'union_admin'",
    "'conference_admin'",
    "'district_admin'",
    "'church_admin'",
    'organizationIdForUser()',
    'canEditOwnedContent',
    'tenantSettings/{tenantId}/settings/{settingId}',
    'canViewHierarchyCertificate',
    'canManageHierarchyUser',
    'unionAdminForCreateUpdate',
    "unionAdminForCreateUpdate('unions', id)",
    "conferenceAdminForCreateUpdate('conferences', id)",
    "districtAdminForCreateUpdate('districts', id)",
    'isHierarchyTenant',
    'hierarchyTenantId',
    "request.resource.data.get('ownerUid'",
  ]],
  ['src/services/i18n.ts', ['getUiLocale','loadUiLocaleRegistry','dictionaryCache','localeFallbacks']],
  ['api/localization.ts', ['authenticateTenant','isSuperAdmin','published','bulkSave']],
  ['api/admin/content.ts', ['HIERARCHY_COLLECTIONS','tenantOwnerKey','ownerTenantId','proposeTranslation','reviewTranslationProposal','proposerUid','pending proposal for this translation key','effectiveOrganizationId','accessibleOrganizationIds','organizationInHierarchyScope']],
  ['api/admin/users.ts', ['Super Admin may delete any user','replacementUid','organizationRole','hierarchyUserInScope','hierarchyScopeQuery', 'organizationInHierarchy', 'hierarchyOrganizations', 'managedOrganizationId', 'preservedPlatformRole']],
  ['src/pages/UserManagement.tsx', ['tenantOrganizationsLoading','listOrganizations','scope?.organizationId','Locked to your current organisation']],
  ['api/admin/organizations.ts', ['assignOwner','organization owner cannot be removed','resolveManagedOrganization','organizationAllowedForHierarchy','managedOrganizationId']],
  ['api/admin/candidates.ts', ['organizationInHierarchyScope','candidate belongs outside your authorized organization scope']],
  ['api/admin/graduations.ts', ['organizationInHierarchyScope','graduation request belongs outside your hierarchy scope']],
  ['api/mentorship.ts', ['organizationInHierarchyScope','requested organization is outside your hierarchy scope']],
  ['src/pages/AdminPage.tsx', ['Permission Matrix','organizations','userManagement','certification','Prayer Requests']],
  ['src/pages/CertificationManager.tsx', ['isSuperAdmin','Certificate Settings','Issue Certificate','CertificateTemplateConfig']],
  ['src/pages/CertificationConfigStudio.tsx', ['DEFAULT_BACKGROUND','certificate_bg.png','fixed artboard','default view 40%','setZoom(0.4)','template','Aubrey Matende','/assets/vop_logo.png','/assets/pm_logo.png','/assets/vop_logo_2.png','setSelectedId(DEFAULT_TEMPLATE.elements?.[0]?.id || \'certify\')']],
  ['src/pages/RadioPage.tsx', ['RadioPageProps','onBack','vop-radio-page-back','vop-radio-hero-back','ArrowLeft']],
  ['src/pages/CertificationManager.tsx', ['template: nextConfig.template','Persist the authoritative template itself','certificate_bg.png']],
  ['api/quizzes.ts', ['tenantOwnerKey','ownerTenantId','canManageQuizTenant']],
  ['api/certificates.ts', ['hierarchyScopeField','unionId:String(candidate.unionId','const organizationId=String(profileData.organizationId','template']],
  ['src/pages/PersonalSettingsPage.tsx', ['uiLocale','studyLanguage','setUiLocale']],
  ['src/components/home/HomeDashboard.tsx', ['evangelism.title','evangelism.prayer','evangelism.radio']],
  ['src/pages/PrayerPage.tsx', ['prayer.hero_title','prayer.submit']],
  ['src/pages/ResourcesPage.tsx', ['vop-materials-page']],
  ['src/pages/RadioPage.tsx', ['vop-audience-radio']],
  ['src/pages/PrayerManagementPanel.tsx', ['Prayer Requests','/api/prayer?ministry=true','Mark praying','Mark answered']],
  ['src/pages/AdminPage.tsx', ['permissions','Permission Matrix','Prayer Requests']],
  ['shared/permissions.ts', ['DEFAULT_PERMISSION_MATRIX','PERMISSION_ROLES','PERMISSION_RESOURCES','PERMISSION_ACTIONS','normalizePermissionMatrix']],
  ['shared/authorization.ts', ['PermissionScope','AuthorizationSubject','AuthorizationTarget','decidePermission','ownershipRequired']],
  ['server/permissions.ts', ['loadPermissionMatrix','requirePermission','resourceForCollection','decidePermission']],
  ['src/services/permissions.ts', ['loadPermissionMatrixClient','permissionRoleForUser','clearPermissionMatrixCache']],
  ['src/services/publicFirestore.ts', ['profileData','loadHierarchy','organizationId']],
  ['docs/VOP_MODULAR_COMPONENT_MISSION.md', ['Component priority by system influence','Module contract','Communication rule','Super Admin rule','Completion rule']],
  ['api/admin/permissions.ts', ['system/permissions','DEFAULT_PERMISSION_MATRIX','Only the VOP Super Admin']],
  ['src/services/adminFirestore.ts', ['tenantSettings', "'settings', 'settings'", "collectionName === 'unions'", "collectionName === 'conferences'", "collectionName === 'districts'", "collectionName === 'churches'"]],
  ['src/pages/CurriculumManager.tsx', ['Publishing scope','System-wide','scopeOrganizationId','organizationOptions']],
  ['src/pages/GuideManager.tsx', ['organizationId?: string','organizationId: organizationId || undefined']],
  ['api/prayer.ts', ['accessibleOrganizationIds','organizationInHierarchyScope','requirePermission']],
  ['src/components/reader/LessonReaderModal.tsx', ['lesson.next_page','lesson.complete']],
];
const errors = [];
const localizationGuardSource = read('src/components/admin/ContentStudio.tsx');
if (localizationGuardSource.includes('<{t(') || localizationGuardSource.includes("'{t(") || localizationGuardSource.includes('"{t(')) {
  errors.push('src/components/admin/ContentStudio.tsx: malformed localization expression detected');
}
for (const [file, needles] of checks) {
  if (!fs.existsSync(path.join(root,file))) { errors.push(file + ': missing'); continue; }
  const source = read(file);
  for (const needle of needles) if (!source.includes(needle)) errors.push(file + ': missing invariant "' + needle + '"');
}
const routes = read('src/types/index.ts');
for (const route of ['home','guide','lesson','resources','prayer','radio','certificates','admin']) {
  if (!routes.includes("'"+route+"'")) errors.push('src/types/index.ts: missing route "'+route+'"');
}
if (errors.length) {
  console.error('VOP architecture regression gate FAILED');
  errors.forEach(error => console.error(' - ' + error));
  process.exit(1);
}
console.log('VOP architecture regression gate passed: tenant isolation, hierarchy roles, localization boundary, learner mission surfaces and ministry routes are present.');
