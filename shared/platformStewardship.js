/** Platform-owned material and shared records without a tenant owner require
 * VOP stewardship. Publishing an organisation-owned record for sharing does
 * not transfer its canonical ownership to the platform.
 */
export function platformStewardedResource(data) {
  const ownerOrganizationId=String(data.ownerOrganizationId || data.organizationId || '').trim();
  return data.platformOwned === true
    || data.adoptedByPlatform === true
    || (!ownerOrganizationId && (data.scope === 'platform'
      || (data.sharingScope === 'shared' && data.published === true)));
}

export function assertMutableTenantResource(isSuperAdmin, existing, operation) {
  if (isSuperAdmin || !existing || !platformStewardedResource(existing)) return;
  throw new Error(
    'This platform-owned resource is under VOP platform stewardship. ' +
    'An organization cannot ' + operation + ' it. Request Super Admin review.',
  );
}
