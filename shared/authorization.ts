import type { PermissionAction, PermissionMatrix, PermissionResource, PermissionRole } from './permissions.js';
import { permissionAllowed } from './permissions.js';

export type PermissionScope = 'platform' | 'hierarchy' | 'organization' | 'owned' | 'assigned' | 'personal' | 'public';

export interface AuthorizationSubject {
  uid: string;
  role: PermissionRole;
  organizationId?: string;
  tenantType?: 'platform' | 'organization' | 'hierarchy';
  tenantId?: string;
}

export interface AuthorizationTarget {
  scope?: PermissionScope;
  uid?: string;
  organizationId?: string;
  tenantId?: string;
  ownerUid?: string;
  ownerTenantId?: string;
  assignedUid?: string;
  scopeAllowed?: boolean;
  ownershipRequired?: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: 'allowed' | 'permission_denied' | 'platform_scope_required' | 'tenant_scope_denied' | 'ownership_denied' | 'personal_scope_denied' | 'assignment_denied';
}

export function decidePermission(
  matrix: PermissionMatrix, subject: AuthorizationSubject, resource: PermissionResource, action: PermissionAction, target: AuthorizationTarget = {},
): AuthorizationDecision {
  if (!permissionAllowed(matrix, subject.role, resource, action)) return { allowed: false, reason: 'permission_denied' };
  if (target.scopeAllowed === false) return { allowed: false, reason: 'tenant_scope_denied' };
  if (target.scope === 'platform' && subject.role !== 'super_admin') return { allowed: false, reason: 'platform_scope_required' };
  if (target.scope === 'personal' && target.uid && target.uid !== subject.uid) return { allowed: false, reason: 'personal_scope_denied' };
  if (target.scope === 'organization' && target.organizationId && subject.role !== 'super_admin' && subject.organizationId !== target.organizationId) return { allowed: false, reason: 'tenant_scope_denied' };
  if (target.scope === 'hierarchy' && target.tenantId && subject.role !== 'super_admin' && subject.tenantId !== target.tenantId) return { allowed: false, reason: 'tenant_scope_denied' };
  if (target.scope === 'assigned' && target.assignedUid && target.assignedUid !== subject.uid && subject.role !== 'super_admin') return { allowed: false, reason: 'assignment_denied' };
  if (target.ownershipRequired && subject.role !== 'super_admin') {
    const ownsByUid = !!target.ownerUid && target.ownerUid === subject.uid;
    const ownsByTenant = !!target.ownerTenantId && !!subject.tenantId && target.ownerTenantId === subject.tenantId;
    if (!ownsByUid && !ownsByTenant) return { allowed: false, reason: 'ownership_denied' };
  }
  return { allowed: true, reason: 'allowed' };
}