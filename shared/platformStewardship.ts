/** A published shared resource is already visible beyond its original tenant.
 * It cannot be destructively modified by the contributing organization.
 * The platform administrator retains stewardship; contributors must fork
 * before making incompatible changes to a shared version.
 */
export function platformStewardedResource(data: Record<string, unknown>): boolean {
  return data.scope === 'platform'
    || data.platformOwned === true
    || data.adoptedByPlatform === true
    || (data.sharingScope === 'shared' && data.published === true);
}

export function assertMutableTenantResource(
  isSuperAdmin: boolean,
  existing: Record<string, unknown> | undefined,
  operation: 'edit' | 'archive' | 'delete',
): void {
  if (isSuperAdmin || !existing || !platformStewardedResource(existing)) return;
  throw new Error(
    'This published shared resource is under VOP platform stewardship. ' +
    'An organization cannot ' + operation + ' it. Copy it into your organization or request Super Admin review.',
  );
}
