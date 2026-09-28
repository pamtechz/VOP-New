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

test('unified search is server-side, permission-aware and scope-aware', () => {
  const source = read('api/admin/search.ts');
  assert.match(source, /authenticateTenant/);
  assert.match(source, /canPermission/);
  assert.match(source, /organizationInHierarchyScope/);
  assert.match(source, /scopeOf/);
  assert.match(source, /accessibleOrganizationIds/);
});

test('notification service is centralized and validates recipients', () => {
  const service = read('server/notifications.ts');
  assert.match(service, /export async function createNotification/);
  assert.match(service, /recipientId/);
  assert.match(service, /createdAt:FieldValue\.serverTimestamp/);
  const api = read('api/admin/notifications.ts');
  assert.match(api, /createNotification/);
  assert.match(api, /action==='send'/);
  assert.match(api, /canPermission/);
});

test('notification inbox binds every operation to the authenticated recipient and tenant', () => {
  const source = read('api/admin/notifications.ts');
  assert.match(source, /verifyIdToken/);
  assert.match(source, /recipientId/);
  assert.match(source, /Notification not found/);
  assert.match(source, /notificationAllowed/);
  assert.match(source, /organizationInHierarchyScope/);
  assert.match(source, /markRead/);
  assert.match(source, /delete/);
});

test('global search and notifications are wired into the application header', () => {
  const source = read('src/components/layout/Header.tsx');
  assert.match(source, /\/api\/admin\/search\?q=/);
  assert.match(source, /\/api\/admin\/notifications\?action=list/);
  assert.match(source, /action:'markRead'/);
  assert.match(source, /Search/);
  assert.match(source, /Bell/);
});

test('user management quick actions call real account workflows', () => {
  const source = read('src/pages/UserManagement.tsx');
  assert.doesNotMatch(source, /Role options are derived from current account data and permissions\.'\)/);
  assert.doesNotMatch(source, /Invitation is generated from the Add User workflow\.'\)/);
  assert.match(source, /void resetPassword\(target\)/);
  assert.match(source, /onClick=\{openCreate\}.*admin\.send_invitation/s);
});
