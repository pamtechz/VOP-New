import type { DocumentData, Firestore } from 'firebase-admin/firestore';
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
import { decidePermission } from '../shared/authorization.js';
import { SUBSCRIPTION_FEATURES, type SubscriptionFeatureKey } from '../shared/subscriptions.js';

const SUBSCRIPTION_MUTATION_RESOURCES=new Set<PermissionResource>([
  'curriculum','lessons','quizzes','materials','radio','announcements','prayer',
  'mentoring','portfolio','scripture','duels','certificates','translations',
]);
const READ_ACTIONS=new Set<PermissionAction>(['view','read']);
const SUBSCRIPTION_FEATURE_BY_RESOURCE:Partial<Record<PermissionResource,SubscriptionFeatureKey>>={
  curriculum:'curriculum',
  lessons:'curriculum',
  quizzes:'curriculum',
  materials:'materials',
  radio:'radio',
  announcements:'announcements',
  mentoring:'mentorship',
  certificates:'certification',
};
const SUBSCRIPTION_FEATURE_LABELS=Object.fromEntries(
  SUBSCRIPTION_FEATURES.map(feature=>[feature.key,feature.label]),
) as Record<SubscriptionFeatureKey,string>;

function entitlementRecord(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{};
}

export async function organizationSubscriptionFeatureBlockReason(
  db:Firestore,
  feature:SubscriptionFeatureKey,
  organizationId:string,
){
  if(!organizationId)return 'An organization is required for subscription entitlement checks.';
  const organization=await db.doc('organizations/'+organizationId).get();
  if(!organization.exists)return 'The organization is not available.';
  const data=organization.data()||{};
  if(data.billingAccessSuspended===true){
    return 'This organization subscription is inactive. Renew or activate a subscription package to make changes.';
  }
  if(String(data.plan||'').trim()==='unsubscribed'){
    return 'This organization does not have an active subscription package. Choose a plan before using this capability.';
  }
  const entitlements=entitlementRecord(data.featureEntitlements);
  // Legacy organizations may predate plan snapshots. Fail closed only when a
  // current entitlement record explicitly excludes the capability.
  if(Object.hasOwn(entitlements,feature)&&entitlements[feature]!==true){
    const label=SUBSCRIPTION_FEATURE_LABELS[feature]||feature;
    return `This organization's subscription plan does not include ${label}. Upgrade the subscription package to use this capability.`;
  }
  return null;
}

export async function requireOrganizationSubscriptionFeature(
  db:Firestore,
  feature:SubscriptionFeatureKey,
  organizationId:string,
){
  const reason=await organizationSubscriptionFeatureBlockReason(db,feature,organizationId);
  if(reason)throw new Error(reason);
}

async function subscriptionMutationBlockReason(
  ctx:TenantContext,resource:PermissionResource,action:PermissionAction,
){
  if(ctx.isSuperAdmin||ctx.tenantType!=='organization'||!ctx.organizationId)return null;
  if(READ_ACTIONS.has(action)||!SUBSCRIPTION_MUTATION_RESOURCES.has(resource))return null;
  const feature=SUBSCRIPTION_FEATURE_BY_RESOURCE[resource];
  if(feature)return organizationSubscriptionFeatureBlockReason(ctx.db,feature,ctx.organizationId);
  const organization=await ctx.db.doc('organizations/'+ctx.organizationId).get();
  return organization.exists&&organization.data()?.billingAccessSuspended===true
    ?'This organization subscription is inactive. Renew or activate a subscription package to make changes.'
    :null;
}

export async function requireSubscriptionFeature(
  ctx:TenantContext,
  feature:SubscriptionFeatureKey,
  organizationId=ctx.organizationId,
){
  if(ctx.isSuperAdmin)return;
  await requireOrganizationSubscriptionFeature(ctx.db,feature,organizationId);
}

export async function loadPermissionMatrix(ctx: TenantContext): Promise<PermissionMatrix> {
  const snapshot = await ctx.db.doc('system/permissions').get();
  return normalizePermissionMatrix(snapshot.exists ? snapshot.data()?.matrix : DEFAULT_PERMISSION_MATRIX);
}

async function permissionMatrixAllows(
  ctx:TenantContext,
  resource:PermissionResource,
  action:PermissionAction,
):Promise<boolean>{
  if(ctx.isSuperAdmin)return true;
  // Payable-item administration is a platform finance control. Never allow an
  // organization/hierarchy role to recover it through a legacy/custom matrix.
  if(resource==='payable_items')return false;
  const matrix=await loadPermissionMatrix(ctx);
  const role=roleForPermission({
    role:ctx.profile.role,
    organizationRole:ctx.tenantType==='organization'?ctx.membership.role:undefined,
    privileges:ctx.profile.privileges,
  });
  return decidePermission(matrix,{
    uid:ctx.auth.uid,
    role,
    organizationId:ctx.organizationId||undefined,
    tenantType:ctx.tenantType,
    tenantId:ctx.tenantId||undefined,
  },resource,action).allowed;
}

export async function canPermission(
  ctx:TenantContext,
  resource:PermissionResource,
  action:PermissionAction,
):Promise<boolean>{
  if(await subscriptionMutationBlockReason(ctx,resource,action))return false;
  return permissionMatrixAllows(ctx,resource,action);
}

export async function requirePermission(
  ctx:TenantContext,
  resource:PermissionResource,
  action:PermissionAction,
){
  const subscriptionReason=await subscriptionMutationBlockReason(ctx,resource,action);
  if(subscriptionReason)throw new Error(subscriptionReason);
  if(!(await permissionMatrixAllows(ctx,resource,action))){
    throw new Error('You do not have permission to perform this action.');
  }
}

export function resourceForCollection(collection: string): PermissionResource | '' {
  const map: Record<string, PermissionResource> = {
    users: 'users', candidates: 'users', organizations: 'organizations',
    unions: 'hierarchy', conferences: 'hierarchy', districts: 'hierarchy', churches: 'hierarchy',
    curriculum: 'curriculum', guides: 'curriculum', programs: 'curriculum', learningPaths: 'curriculum',
    bibleTopics: 'curriculum', seasons: 'curriculum',
    books: 'materials', radioBroadcasts: 'radio', playlists: 'radio',
    languages: 'languages', translations: 'translations',
    announcements: 'announcements', events: 'announcements', prayerRequests: 'prayer',
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

export async function canPermissionForProfile(
  db: FirebaseFirestore.Firestore,
  profile: Record<string, unknown>,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<boolean> {
  if (String(profile.role || '') === 'super_admin') return true;
  const snapshot = await db.doc('system/permissions').get();
  const matrix = normalizePermissionMatrix(snapshot.exists ? snapshot.data()?.matrix : DEFAULT_PERMISSION_MATRIX);
  const role = roleForPermission({
    role: profile.role,
    organizationRole: profile.organizationRole,
    privileges: profile.privileges as Record<string, unknown> | undefined,
  });
  return permissionAllowed(matrix, role, resource, action);
}

export async function requirePermissionForProfile(
  db: FirebaseFirestore.Firestore,
  profile: Record<string, unknown>,
  resource: PermissionResource,
  action: PermissionAction,
) {
  if (!(await canPermissionForProfile(db, profile, resource, action))) {
    throw new Error('You do not have permission to perform this action.');
  }
}
