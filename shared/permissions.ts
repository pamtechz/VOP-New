export const PERMISSION_ROLES = [
  'super_admin','union_admin','conference_admin','district_admin','church_admin',
  'owner','admin','editor','teacher','mentor','staff','student',
] as const;

export const PERMISSION_RESOURCES = [
  'dashboard','organizations','users','hierarchy','curriculum','lessons','quizzes',
  'materials','radio','languages','translations','announcements','prayer',
  'mentoring','certificates','analytics','settings','audit',
] as const;

export const PERMISSION_ACTIONS = [
  'view','create','read','update','delete','publish','approve','assign','manage',
] as const;

export type PermissionRole = typeof PERMISSION_ROLES[number];
export type PermissionResource = typeof PERMISSION_RESOURCES[number];
export type PermissionAction = typeof PERMISSION_ACTIONS[number];
export type PermissionMatrix = Record<PermissionRole, Partial<Record<PermissionResource, PermissionAction[]>>>;

const all = [...PERMISSION_ACTIONS] as PermissionAction[];
const read = ['view','read'] as PermissionAction[];
const manage = [...PERMISSION_ACTIONS] as PermissionAction[];
const contentManager = ['view','read','create','update','delete','publish'] as PermissionAction[];
const contributor = ['view','read','create','update'] as PermissionAction[];

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  super_admin: Object.fromEntries(PERMISSION_RESOURCES.map(resource => [resource, manage])) as PermissionMatrix['super_admin'],
  union_admin: {
    dashboard: read, organizations: ['view','read','update','manage'], users: ['view','read','update','assign','manage'],
    hierarchy: manage, curriculum: contentManager, lessons: contentManager, quizzes: contentManager,
    materials: contributor, radio: contributor, languages: contributor, translations: contributor,
    announcements: contributor, prayer: ['view','read','update','manage'], mentoring: ['view','read','assign','manage'],
    certificates: ['view','read','manage'], analytics: read, settings: ['view','read','update','manage'],
  },
  conference_admin: {
    dashboard: read, organizations: ['view','read','update','manage'], users: ['view','read','update','assign','manage'],
    hierarchy: manage, curriculum: contentManager, lessons: contentManager, quizzes: contentManager,
    materials: contributor, radio: contributor, languages: contributor, translations: contributor,
    announcements: contributor, prayer: ['view','read','update','manage'], mentoring: ['view','read','assign','manage'],
    certificates: ['view','read','manage'], analytics: read, settings: ['view','read','update','manage'],
  },
  district_admin: {
    dashboard: read, organizations: ['view','read','update','manage'], users: ['view','read','update','assign','manage'],
    hierarchy: manage, curriculum: contentManager, lessons: contentManager, quizzes: contentManager,
    materials: contributor, radio: contributor, languages: contributor, translations: contributor,
    announcements: contributor, prayer: ['view','read','update','manage'], mentoring: ['view','read','assign','manage'],
    certificates: ['view','read','manage'], analytics: read, settings: ['view','read','update','manage'],
  },
  church_admin: {
    dashboard: read, organizations: ['view','read','update','manage'], users: ['view','read','update','assign','manage'],
    hierarchy: manage, curriculum: contentManager, lessons: contentManager, quizzes: contentManager,
    materials: contributor, radio: contributor, languages: contributor, translations: contributor,
    announcements: contributor, prayer: ['view','read','update','manage'], mentoring: ['view','read','assign','manage'],
    certificates: ['view','read','manage'], analytics: read, settings: ['view','read','update','manage'],
  },
  owner: {
    dashboard: read, organizations: ['view','read','update'], users: ['view','read','create','update','delete','assign','manage'],
    curriculum: contentManager, lessons: contentManager, quizzes: contentManager, materials: contributor, radio: contributor,
    languages: contributor, translations: contributor, announcements: contributor, prayer: ['view','read','update','manage'],
    mentoring: ['view','read','assign','manage'], certificates: ['view','read'], analytics: read, settings: ['view','read','update','manage'],
  },
  admin: {
    dashboard: read, organizations: ['view','read'], users: ['view','read','create','update','delete','assign','manage'],
    curriculum: contentManager, lessons: contentManager, quizzes: contentManager, materials: contributor, radio: contributor,
    languages: contributor, translations: contributor, announcements: contributor, prayer: ['view','read','update','manage'],
    mentoring: ['view','read','assign','manage'], certificates: ['view','read'], analytics: read, settings: ['view','read','update','manage'],
  },
  editor: {
    dashboard: read, curriculum: contentManager, lessons: contentManager, quizzes: contentManager,
    materials: contributor, radio: contributor, languages: contributor, translations: contributor, announcements: contributor,
    prayer: read, mentoring: read, certificates: read, analytics: read,
  },
  mentor: {
    dashboard: read, users: ['view','read'], curriculum: read, lessons: read, materials: read, radio: read,
    announcements: read, prayer: ['view','read','create','update'], mentoring: ['view','read','create','update','assign'],
    certificates: read, analytics: read,
  },
  staff: {
    dashboard: read, users: ['view','read'], curriculum: read, lessons: read, materials: read, radio: read,
    announcements: read, prayer: ['view','read','create','update'], mentoring: ['view','read'], certificates: read,
    analytics: read,
  },
  teacher: {
    dashboard: read, users: ['view','read'], curriculum: read, lessons: contributor, quizzes: ['view','read','create','update'], materials: contributor, radio: read,
    languages: read, translations: read, announcements: read, prayer: ['view','read','create','update'], mentoring: ['view','read','create','update'],
    certificates: read, analytics: read, settings: ['view','read'],
  },
  student: {
    dashboard: read, curriculum: read, lessons: read, quizzes: ['view','read','create'], materials: read, radio: read,
    languages: read, translations: read, announcements: read, prayer: ['view','read','create','update','delete'],
    mentoring: ['view','read','create'], certificates: ['view','read'], settings: ['view','read','update'],
  },
};

export function normalizePermissionMatrix(value: unknown): PermissionMatrix {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const output = {} as PermissionMatrix;
  for (const role of PERMISSION_ROLES) {
    const roleValue = source[role] && typeof source[role] === 'object' ? source[role] as Record<string, unknown> : {};
    const defaults = DEFAULT_PERMISSION_MATRIX[role] || {};
    const resources: Partial<Record<PermissionResource, PermissionAction[]>> = {};
    for (const resource of PERMISSION_RESOURCES) {
      const raw = roleValue[resource];
      if (Array.isArray(raw)) {
        resources[resource] = raw.filter((action): action is PermissionAction => PERMISSION_ACTIONS.includes(action as PermissionAction));
      } else if (defaults[resource]) {
        resources[resource] = [...defaults[resource]!];
      }
    }
    output[role] = resources;
  }
  output.super_admin = Object.fromEntries(PERMISSION_RESOURCES.map(resource => [resource, all])) as PermissionMatrix['super_admin'];
  return output;
}

export function roleForPermission(profile: { role?: unknown; organizationRole?: unknown; privileges?: Record<string, unknown> }): PermissionRole {
  const role = String(profile.role || '');
  // Platform and hierarchy roles are authoritative. An organization membership
  // role must never downgrade a hierarchy administrator or Super Admin.
  if (role === 'super_admin' || role === 'union_admin' || role === 'conference_admin' || role === 'district_admin' || role === 'church_admin') {
    return role;
  }
  const organizationRole = String(profile.organizationRole || '');
  if (organizationRole === 'owner' || organizationRole === 'admin' || organizationRole === 'editor' || organizationRole === 'teacher' || organizationRole === 'mentor') return organizationRole;
  if (role === 'learner') return 'student';
  if (PERMISSION_ROLES.includes(role as PermissionRole)) return role as PermissionRole;
  if (profile.privileges?.manager === true) return 'staff';
  if (profile.privileges?.editor === true) return 'editor';
  return 'student';
}

export function permissionAllowed(
  matrix: PermissionMatrix,
  role: PermissionRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  if (role === 'super_admin') return true;
  return Boolean(matrix[role]?.[resource]?.includes(action));
}
