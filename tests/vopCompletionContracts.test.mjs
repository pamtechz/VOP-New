import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('canonical resource scope is limited to platform, hierarchy and organization', () => {
  const source = read('shared/authorization.ts');
  assert.match(source, /export type PermissionScope = 'platform' \| 'hierarchy' \| 'organization';/);
  assert.match(source, /export type AccessRelationship = 'owned' \| 'assigned' \| 'personal' \| 'public';/);
  assert.match(source, /relationship\?: AccessRelationship/);
});

test('unified search is server-side and permission-aware', () => {
  const source = read('api/admin/search.ts');
  assert.match(source, /authenticateTenant/);
  assert.match(source, /requirePermission/);
  assert.match(source, /canPermission/);
  assert.match(source, /organizationId/);
  assert.match(source, /isSuperAdmin/);
});

test('notification inbox binds every operation to the authenticated recipient', () => {
  const source = read('api/admin/notifications.ts');
  assert.match(source, /verifyIdToken/);
  assert.match(source, /recipientId/);
  assert.match(source, /Notification not found/);
  assert.match(source, /orgAllowed/);
  assert.match(source, /markRead/);
  assert.match(source, /delete/);
});

test('user management quick actions call real account workflows', () => {
  const source = read('src/pages/UserManagement.tsx');
  assert.doesNotMatch(source, /Role options are derived from current account data and permissions\.'\)/);
  assert.doesNotMatch(source, /Invitation is generated from the Add User workflow\.'\)/);
  assert.match(source, /void resetPassword\(target\)/);
  assert.match(source, /onClick=\{openCreate\}.*admin\.send_invitation/s);
});
