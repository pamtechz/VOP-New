import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const required=[
  ['api/admin/content.ts',['authenticateTenant','ownerOrganizationId','sharingScope']],
  ['api/quizzes.ts',['authenticateTenant','ownerOrganizationId','sharingScope']],
  ['api/admin/candidates.ts',['authenticateTenant','organizationId']],
  ['api/mentorship.ts',['organizationId','sameTenant','union_admin','conference_admin','district_admin','church_admin']],
  ['api/certificates.ts',['authenticateTenant','organizationId']],
  ['api/localization.ts',['authenticateTenant','published']],
  ['api/preferences.ts',['authenticateTenant','studyLanguage','uiLocale']],
  ['src/services/i18n.ts',['localeFallbacks','dictionaryCache','getUiLocale']],
  ['server/tenant.ts',['legacyTenantId','legacyTenantFromProfile','ensureLegacyTenant','tenantKind']],
  ['scripts/migrate-legacy-hierarchy-tenants.mjs',['legacy-union-','legacy-conference-','legacy-district-','legacy-church-']],
  ['firestore.rules',['organizationIdForUser','ownerOrganizationId','allow create: if false']],
  ['storage.rules',['function manager','radio']],
];
const errors=[];
for(const [file,needles] of required){
  const text=read(file);
  for(const needle of needles) if(!text.includes(needle)) errors.push(`${file}: missing invariant "${needle}"`);
}
const mission=read('docs/VOP_IMPLEMENTATION_MISSION.md');
for(const phrase of ['canonical editing ownership never transfers','Tenant boundaries must be enforced server-side and in Firestore rules','Curriculum content is human-authored','union_admin`, `conference_admin`, `district_admin`, and `church_admin` are first-class tenants']) if(!mission.includes(phrase)) errors.push(`Mission documentation lost invariant: ${phrase}`);
if(errors.length){console.error('SaaS verification failed');errors.forEach(e=>console.error(' - '+e));process.exit(1);}
console.log('SaaS structural verification passed: tenant auth, ownership metadata, localization boundary, preferences and audit invariants are present.');
