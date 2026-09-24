import { auth } from '../lib/firebase';
import { DEFAULT_PERMISSION_MATRIX, normalizePermissionMatrix, permissionAllowed, roleForPermission, type PermissionAction, type PermissionMatrix, type PermissionResource } from '../../shared/permissions';

let cachedMatrix: PermissionMatrix = DEFAULT_PERMISSION_MATRIX;
let loaded = false;

export async function loadPermissionMatrixClient(force = false): Promise<PermissionMatrix> {
  if (loaded && !force) return cachedMatrix;
  if (!auth?.currentUser) return cachedMatrix;
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/permissions', { headers: { Authorization: 'Bearer ' + token } });
  const body = await response.json().catch(() => ({})) as { matrix?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not load the permission matrix.');
  cachedMatrix = normalizePermissionMatrix(body.matrix);
  loaded = true;
  return cachedMatrix;
}

export function permissionRoleForUser(profile: { role?: unknown; organizationRole?: unknown; privileges?: Record<string, unknown> }) {
  return roleForPermission(profile);
}

export function can(matrix: PermissionMatrix, profile: { role?: unknown; organizationRole?: unknown; privileges?: Record<string, unknown> }, resource: PermissionResource, action: PermissionAction) {
  return permissionAllowed(matrix, roleForPermission(profile), resource, action);
}

export function clearPermissionMatrixCache() {
  loaded = false;
  cachedMatrix = DEFAULT_PERMISSION_MATRIX;
}