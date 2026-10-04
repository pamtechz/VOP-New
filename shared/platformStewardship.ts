// Compatibility source entry for local Vite/SSR and older checkouts that still
// resolve the TypeScript path. Runtime/server imports use platformStewardship.js.
export { platformStewardedResource, assertMutableTenantResource } from './platformStewardship.js';
