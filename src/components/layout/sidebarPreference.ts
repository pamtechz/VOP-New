/** Keep all authenticated VOP portals on the same desktop sidebar preference.
 * No account, progress or administrative data is stored here. */
const KEY = 'vop:sidebar-collapsed';
export const SIDEBAR_COLLAPSED_STORAGE_KEY = KEY;
export function readSidebarCollapsed(): boolean {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value !== null) return value === '1';
    return window.localStorage.getItem('vop:learner-sidebar-collapsed') === '1'
      || window.localStorage.getItem('vop:admin-sidebar-collapsed') === '1';
  } catch { return false; }
}
export function persistSidebarCollapsed(collapsed:boolean):void {
  try { window.localStorage.setItem(KEY, collapsed ? '1' : '0'); }
  catch { /* The rail stays usable when storage is blocked. */ }
}
