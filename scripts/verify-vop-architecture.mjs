import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
function verifyCertificateBackgroundAsset() {
  const assetPath = path.join(root, 'public', 'assets', 'certificate_bg.png');
  if (!fs.existsSync(assetPath)) throw new Error('Missing authoritative certificate background asset: public/assets/certificate_bg.png');
  const bytes = fs.readFileSync(assetPath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Certificate background is not a valid PNG.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== 1513 || height !== 1040) throw new Error(`Certificate background dimensions must be 1513x1040; found ${width}x${height}.`);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== '3e3051618c632c7142b09e5257fc4526269bff98df6c0032af3a4743e8f59478') throw new Error('Certificate background does not match the supplied authoritative artwork.');
}
const read = file => fs.readFileSync(path.join(root,file),'utf8');
verifyCertificateBackgroundAsset();

const checks = [
  ['server/tenant.ts', ['canEditCanonicalContent','tenantOwnerKey','ownerTenantId','ownerUid','tenantType: \'platform\' | \'organization\' | \'hierarchy\'','accessibleOrganizationIds','canManageOrganizationContent','platformAudit']],
  ['tests/firestoreRules.test.mjs', ['hierarchy tenant scope','radio-owned','candidate-2','Updated Scoped Tenant','system/permissions','cert-org-1','cert-org-2']],
  ['firestore.rules', ["'union_admin'","'conference_admin'","'district_admin'","'church_admin'",'organizationIdForUser()','canEditOwnedContent','tenantSettings/{tenantId}/settings/{settingId}','canViewHierarchyCertificate','hierarchyOrganizationScope(resource.data.get(\'organizationId\',\'\'))','canManageHierarchyUser','unionAdminForCreateUpdate','isHierarchyTenant','hierarchyTenantId']],
  ['shared/permissions.ts', ['DEFAULT_PERMISSION_MATRIX','PERMISSION_ROLES','PERMISSION_RESOURCES','PERMISSION_ACTIONS','normalizePermissionMatrix','billing']],
  ['shared/authorization.ts', ['PermissionScope','AuthorizationSubject','AuthorizationTarget','decidePermission','ownershipRequired']],
  ['server/permissions.ts', ['loadPermissionMatrix','requirePermission','resourceForCollection','decidePermission']],
  ['src/services/permissions.ts', ['loadPermissionMatrixClient','permissionRoleForUser','clearPermissionMatrixCache']],
  ['api/admin/content.ts', ['proposeTranslation','reviewTranslationProposal','effectiveOrganizationId','accessibleOrganizationIds','organizationInHierarchyScope']],
  ['api/admin/users.ts', ['Super Admin may delete any user','replacementUid','organizationRole','hierarchyUserInScope','preservedPlatformRole']],
  ['api/admin/organizations.ts', ['assignOwner','organization owner cannot be removed','resolveManagedOrganization','organizationAllowedForHierarchy']],
  ['api/admin/candidates.ts', ['organizationInHierarchyScope','candidate belongs outside your authorized organization scope']],
  ['api/admin/graduations.ts', ['organizationInHierarchyScope','graduation request belongs outside your hierarchy scope']],
  ['api/mentorship.ts', ['organizationInHierarchyScope','requested organization is outside your hierarchy scope','mentorAssignments']],
  ['src/pages/AdminPage.tsx', ['Permission Matrix','Prayer Requests']],
  ['src/pages/CertificationConfigStudio.tsx', ['certificate_bg.png','fixed artboard','default view 40%','setZoom(0.4)']],
  ['src/pages/RadioPage.tsx', ['onBack','vop-radio-page-back','ArrowLeft']],
  ['api/quizzes.ts', ['tenantOwnerKey','ownerTenantId','canManageQuizTenant']],
  ['api/certificates.ts', ['candidateId','template']],
  ['src/pages/PersonalSettingsPage.tsx', ['uiLocale','studyLanguage','setUiLocale']],
  ['src/pages/PrayerPage.tsx', ['prayer.hero_title','prayer.submit']],
  ['src/pages/PrayerManagementPanel.tsx', ['Prayer Requests','/api/prayer?ministry=true','Mark praying','Mark answered']],
  ['api/prayer.ts', ['accessibleOrganizationIds','organizationInHierarchyScope','requirePermission']],
  ['src/components/reader/LessonReaderModal.tsx', ['lesson.next_page','lesson.complete']],
  ['src/services/firestoreData.ts', ['createFirestoreStudentProfile','/api/admin/users','organizationsRef','scopedOrganizationIds']],
  ['api/study/progress.ts', ['candidateId: decoded.uid','userId: decoded.uid']],
  ['api/admin/analytics.ts', ['accessibleOrganizationIds','requirePermission','ORG_SCOPED_COLLECTIONS']],
  ['api/admin/audit.ts', ['platformAudit','tenantAudit','requirePermission']],
  ['api/admin/onboarding.ts', ['organization.initialize','onboarding','owner_assignment','invite_users']],
  ['api/admin/plans.ts', ['system/plans/catalog','assignPlan','cancelSubscription','featureEntitlements','externalSubscriptionId']],
];
const errors = [];
const legacyCertificateModal = path.join(root, 'src/components/certificate/CertificateModal.tsx');
if (fs.existsSync(legacyCertificateModal)) errors.push('Legacy CertificateModal renderer must remain removed; use CertificateArtwork + CertificationConfigStudio.');
for (const [file, needles] of checks) {
  if (!fs.existsSync(path.join(root,file))) { errors.push(file + ': missing'); continue; }
  const source = read(file);
  for (const needle of needles) if (!source.includes(needle)) errors.push(file + ': missing invariant "' + needle + '"');
}
const routes = read('src/types/index.ts');
for (const route of ['home','guide','lesson','resources','prayer','radio','certificates','admin']) if (!routes.includes("'"+route+"'")) errors.push('src/types/index.ts: missing route "'+route+'"');
if (errors.length) {
  console.error('VOP architecture regression gate FAILED');
  errors.forEach(error => console.error(' - ' + error));
  process.exit(1);
}
console.log('VOP architecture regression gate passed: tenant isolation, hierarchy roles, permissions, learner ownership, analytics, audit, onboarding and plan contracts are present.');
