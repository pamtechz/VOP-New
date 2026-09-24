import type { DocumentData } from 'firebase-admin/firestore';
import {
  DEFAULT_PERMISSION_MATRIX,
  normalizePermissionMatrix,
  permissionAllowed,
  roleForPermission,
  type PermissionAction,
  type PermissionMatrix,
  type PermissionResource,
  type PermissionRole,
} from '../shared/permissions.js';
import type { TenantContext } from './tenant.js';

export async function loadPermissionMatrix(ctx: TenantContext): Promise<PermissionMatrix> {
  const snapshot = await ctx.db.doc('system/permissions').get();
  return normalizePermissionMatrix(snapshot.exists ? snapshot.data()?.matrix : DEFAULT_PERMISSION_MATRIX);
}

export async function canPermission(
  ctx: TenantContext,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const matrix = await loadPermissionMatrix(ctx);
  const role = roleForPermission({
    role: ctx.profile.role,
    organizationRole: ctx.tenantType === 'organization' ? ctx.membership.role : undefined,
    privileges: ctx.profile.privileges,
  });
  return permissionAllowed(matrix, role, resource, action);
}

export async function requirePermission(
  ctx: TenantContext,
  resource: PermissionResource,
  action: PermissionAction,
) {
  if (!(await canPermission(ctx, resource, action))) {
    throw new Error('You do not have permission to perform this action.');
  }
}

export function resourceForCollection(collection: string): PermissionResource | '' {
  const map: Record<string, PermissionResource> = {
    users: 'users', candidates: 'users', organizations: 'organizations',
    unions: 'hierarchy', conferences: 'hierarchy', districts: 'hierarchy', churches: 'hierarchy',
    curriculum: 'curriculum', guides: 'curriculum', learningPaths: 'curriculum',
    bibleTopics: 'curriculum', seasons: 'curriculum',
    books: 'materials', radioBroadcasts: 'radio', playlists: 'radio',
    languages: 'languages', translations: 'translations',
    announcements: 'announcements', prayerRequests: 'prayer',
    certificates: 'certificates', graduationRequests: 'certificates',
    certificationConfig: 'certificates', settings: 'settings', curriculumSettings: 'settings',
  };
  return map[collection] || '';
}

export function actionForContent(action: string, creating = false): PermissionAction | '' {
  if (action === 'list' || action === 'listGuides') return 'view';
  if (action === 'delete' || action === 'archiveGuide') return 'delete';
  if (action === 'publishLesson') return 'publish';
  if (action === 'unpublishLesson') return 'publish';
  if (action === 'forkGuide' || action === 'forkLesson') return 'create';
  if (action === 'proposeTranslation') return 'create';
  if (action === 'reviewTranslationProposal') return 'approve';
  if (action === 'upsert' || action === 'upsertGuide' || action === 'upsertLesson') return creating ? 'create' : 'update';
  return '';
}

export function permissionRole(ctx: TenantContext): PermissionRole {
  return roleForPermission({
    role: ctx.profile.role,
    organizationRole: ctx.tenantType === 'organization' ? ctx.membership.role : undefined,
    privileges: ctx.profile.privileges,
  });
}
