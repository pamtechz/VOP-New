/**
 * Device-local privacy consent only. This is not a permission, identity,
 * curriculum source, or server-side authorization signal.
 */
export const OFFLINE_CONSENT_KEY = 'vop_trusted_offline_device';
export function hasTrustedOfflineDeviceConsent(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.localStorage.getItem(OFFLINE_CONSENT_KEY) === 'yes';
  } catch { return false; }
}
export function setTrustedOfflineDeviceConsent(enabled: boolean): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(OFFLINE_CONSENT_KEY, enabled ? 'yes' : 'no');
    return true;
  } catch { return false; }
}
