import type { AppRoute, User } from '../types';

const ADMIN_ROLES = new Set(['super_admin','union_admin','conference_admin','district_admin','church_admin']);
const ADMIN_ORGANIZATION_ROLES = new Set(['owner','admin','editor','teacher','staff']);
const MENTOR_ROLES = new Set(['mentor']);

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isOrganizationPortalAccount(user: Pick<User,'organizationRole'|'organizationId'>): boolean {
  return Boolean(user.organizationId) && ADMIN_ORGANIZATION_ROLES.has(normalized(user.organizationRole));
}

export function hasAdminPortalAccess(user: Pick<User,'role'|'organizationRole'|'organizationId'>): boolean {
  const role = normalized(user.role);
  if (ADMIN_ROLES.has(role)) return true;
  return isOrganizationPortalAccount(user);
}

export function hasMentorPortalAccess(user: Pick<User,'role'|'organizationRole'|'organizationId'>): boolean {
  // Mentoring is tenant-scoped. Even a legacy top-level mentor flag must not
  // open the mentor workspace after the account loses its active organization.
  return Boolean(user.organizationId)
    && (MENTOR_ROLES.has(normalized(user.role)) || MENTOR_ROLES.has(normalized(user.organizationRole)));
}

export function hasLocalizationPortalAccess(user: Pick<User,'localizationAccess'>): boolean {
  return ['invited','active'].includes(normalized(user.localizationAccess?.status));
}

export function isPortalRoute(route: AppRoute): boolean {
  return route === 'admin' || route === 'mentor' || route === 'localization';
}

export function canAccessPortalRoute(user: User, route: AppRoute): boolean {
  if (route === 'admin') return hasAdminPortalAccess(user);
  if (route === 'mentor') return hasMentorPortalAccess(user);
  if (route === 'localization') return hasLocalizationPortalAccess(user);
  return true;
}

export function assignedPortalChoices(user:User):Array<{route:AppRoute;label:string}>{
  const entries:Array<{route:AppRoute;label:string}>=[];
  if(hasAdminPortalAccess(user)){
    const role=normalized(user.role);
    const title=role==='super_admin'?'Super Administrator'
      :['union_admin','conference_admin','district_admin','church_admin'].includes(role)
      ?role.replace('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase())
      :('Organization '+normalized(user.organizationRole).replace(/\b\w/g,letter=>letter.toUpperCase()));
    entries.push({route:'admin',label:title});
  }
  if(hasMentorPortalAccess(user))entries.push({route:'mentor',label:'Mentor'});
  if(hasLocalizationPortalAccess(user))entries.push({route:'localization',label:'Translator'});
  entries.push({route:'home',label:'Learner workspace'});
  return entries;
}

export function defaultPortalRoute(user: User): AppRoute {
  if (hasAdminPortalAccess(user)) return 'admin';
  if (hasMentorPortalAccess(user)) return 'mentor';
  if (hasLocalizationPortalAccess(user)) return 'localization';
  return 'home';
}

/**
 * Preserve refresh/navigation memory only inside the account's primary portal.
 * Learners may restore any learner-facing route; staff/mentor/localization
 * accounts land in their dedicated workspace unless an explicit deep link was
 * requested.
 */
export function canRestoreAsPrimaryPortal(user: User, route: AppRoute): boolean {
  const landing = defaultPortalRoute(user);
  if (landing === 'home') return !isPortalRoute(route);
  return route === landing;
}
