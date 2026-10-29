/** TypeScript compatibility entry for local Vite/SSR resolution.
 * Server/runtime imports continue to use platformStewardship.js.
 */
export function platformStewardedResource(data: Record<string, unknown>): boolean {
  const ownerOrganizationId=String(data.ownerOrganizationId || data.organizationId || '').trim();
  return data.platformOwned === true
    || data.adoptedByPlatform === true
    || (!ownerOrganizationId && (data.scope === 'platform'
      || (data.sharingScope === 'shared' && data.published === true)));
}

export function assertMutableTenantResource(
  isSuperAdmin: boolean,
  existing: Record<string, unknown> | undefined,
  operation: 'edit' | 'archive' | 'delete',
): void {
  if (isSuperAdmin || !existing || !platformStewardedResource(existing)) return;
  throw new Error(
    'This platform-owned resource is under VOP platform stewardship. ' +
    'An organization cannot ' + operation + ' it. Request Super Admin review.',
  );
}
