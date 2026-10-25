/** A published shared resource is already visible beyond its original tenant.
 * It cannot be destructively modified by the contributing organization.
 * The platform administrator retains stewardship; contributors must fork
 * before making incompatible changes to a shared version.
 */
export function platformStewardedResource(data) {
  // A tenant can draft a contribution in a platform collection. The scope
  // alone does not transfer ownership; adoption or public sharing does.
  const ownerOrganizationId = String(data.ownerOrganizationId || data.organizationId || '').trim();
  return !ownerOrganizationId &&
    (data.scope === 'platform' || data.platformOwned === true || data.adoptedByPlatform === true);
}

export function assertMutableTenantResource(isSuperAdmin, existing, operation) {
  if (isSuperAdmin || !existing || !platformStewardedResource(existing)) return;
  throw new Error(
    'This platform-owned resource is under VOP platform stewardship. ' +
    'An organization cannot ' + operation + ' it. Copy it into your organization or request Super Admin review.',
  );
}
