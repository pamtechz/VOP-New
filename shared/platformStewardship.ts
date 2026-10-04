/** TypeScript compatibility entry for local Vite/SSR resolution.
 * Server/runtime imports continue to use platformStewardship.js.
 */
export function platformStewardedResource(data: Record<string, unknown>): boolean {
  return (data.scope === 'platform' && !String(data.ownerOrganizationId || '').trim())
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
