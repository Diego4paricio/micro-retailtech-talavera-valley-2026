/**
 * Moved to `features/business-profile/profile-store.ts` (domain audit
 * 2026-10-13, A2-3): the business profile is the whole panel's, not
 * Configuración's. Kept so older imports keep working; import from
 * `../business-profile/profile-store.js` in new code.
 */
export { useWorkspaceProfile } from "../business-profile/profile-store.js";
