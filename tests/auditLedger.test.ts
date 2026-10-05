import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');

test('audit records are append-only and tamper-evident',()=>{
  const ledger=read('server/auditLedger.ts');
  const tenant=read('server/tenant.ts');
  assert.match(ledger,/createHash\('sha256'\)/);
  assert.match(ledger,/previousHash/);
  assert.match(ledger,/entryHash/);
  assert.match(ledger,/sequence/);
  assert.match(ledger,/transaction\.create\(recordRef/);
  assert.match(ledger,/auditIntegrityHeads/);
  assert.match(tenant,/appendImmutableAudit/);
  assert.doesNotMatch(tenant,/collection\([^\n]*audit[^\n]*\)\.add\(/);
});

test('organization audit cleanup is a visibility overlay, never evidence deletion',()=>{
  const organizations=read('api_handlers/admin/organizations.ts');
  const ui=read('src/pages/OrganizationManagement.tsx');
  assert.match(organizations,/auditVisibility/);
  assert.match(organizations,/immutableLedgerPreserved:true/);
  assert.match(organizations,/audit\.history\.hide/);
  assert.match(organizations,/audit\.history\.clear_view/);
  const auditStart=organizations.indexOf("if(action==='deleteAudit')");
  const auditEnd=organizations.indexOf("if (action === 'getUsage')",auditStart);
  assert.ok(auditStart>=0&&auditEnd>auditStart);
  const cleanup=organizations.slice(auditStart,auditEnd);
  assert.doesNotMatch(cleanup,/\.delete\(/);
  assert.doesNotMatch(cleanup,/batch\.delete/);
  assert.match(ui,/immutable ledger/);
  assert.match(ui,/Remove selected/);
  assert.match(ui,/Clear view/);
});

test('Firestore rules make audit writes server-only',()=>{
  const rules=read('firestore.rules');
  assert.match(rules,/match \/audit\/\{entryId\}[\s\S]{0,260}allow create, update, delete: if false;/);
  assert.match(rules,/match \/auditVisibility\/\{entryId\}[\s\S]{0,180}allow read, write: if false;/);
  assert.match(rules,/match \/auditIntegrityHeads\/\{scopeId\}[\s\S]{0,180}allow read, write: if false;/);
  assert.match(rules,/match \/platformAudit\/\{entryId\}[\s\S]{0,180}allow read, write: if false;/);
});
