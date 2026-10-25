/** TypeScript compatibility entry for local Vite/SSR resolution.
 * Server/runtime imports continue to use platformStewardship.js.
 */
export function platformStewardedResource(data: Record<string, unknown>): boolean {
  const ownerOrganizationId = String(data.ownerOrganizationId || data.organizationId || '').trim();
  return !ownerOrganizationId &&
    (data.scope === 'platform' || data.platformOwned === true || data.adoptedByPlatform === true);
}

export function assertMutableTenantResource(
  isSuperAdmin: boolean,
  existing: Record<string, unknown> | undefined,
  operation: 'edit' | 'archive' | 'delete',
): void {
  if (isSuperAdmin || !existing || !platformStewardedResource(existing)) return;
  throw new Error(
    'This platform-owned resource is under VOP platform stewardship. ' +
    'An organization cannot ' + operation + ' it. Copy it into your organization or request Super Admin review.',
  );
}
