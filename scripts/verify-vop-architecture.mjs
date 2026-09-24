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
  ]],
  ['firestore.rules', [
    "'union_admin'",
    "'conference_admin'",
    "'district_admin'",
    "'church_admin'",
    'organizationIdForUser()',
    'canEditOwnedContent',
    'canViewHierarchyCertificate',
    'isHierarchyTenant',
    'hierarchyTenantId',
    "request.resource.data.get('ownerUid'",
  ]],
  ['src/services/i18n.ts', ['getUiLocale','loadUiLocaleRegistry','dictionaryCache','localeFallbacks']],
  ['api/localization.ts', ['authenticateTenant','isSuperAdmin','published','bulkSave']],
  ['api/admin/content.ts', ['HIERARCHY_COLLECTIONS','tenantOwnerKey','ownerTenantId','proposeTranslation','reviewTranslationProposal']],
  ['api/admin/users.ts', ['Super Admin may delete any user','replacementUid','organizationRole','hierarchyUserInScope','hierarchyScopeQuery']],
  ['api/admin/organizations.ts', ['assignOwner','organization owner cannot be removed']],
  ['api/quizzes.ts', ['tenantOwnerKey','ownerTenantId','canManageQuizTenant']],
  ['api/certificates.ts', ['hierarchyScopeField','unionId:String(candidate.unionId','const organizationId=String(profileData.organizationId']],
  ['src/pages/PersonalSettingsPage.tsx', ['uiLocale','studyLanguage','setUiLocale']],
  ['src/components/home/HomeDashboard.tsx', ['evangelism.title','evangelism.prayer','evangelism.radio']],
  ['src/pages/PrayerPage.tsx', ['prayer.hero_title','prayer.submit']],
  ['src/pages/ResourcesPage.tsx', ['vop-materials-page']],
  ['src/pages/RadioPage.tsx', ['vop-audience-radio']],
  ['src/components/reader/LessonReaderModal.tsx', ['lesson.next_page','lesson.complete']],
];
const errors = [];
const localizationGuardSource = read('src/components/admin/ContentStudio.tsx');
if (/<\\{t\\(|'\\{t\\(|"\\{t\\(/.test(localizationGuardSource)) {
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
