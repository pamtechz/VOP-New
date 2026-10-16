const APP_LINK_HOSTS = new Set(['vopafrica.vercel.app']);

export function normalizeNativeDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'vop:') {
      if (url.hostname !== 'invite') return null;
      const token = url.searchParams.get('token') || '';
      if (!/^[A-Za-z0-9]{32,128}$/.test(token)) return null;
      return '/?invite=' + encodeURIComponent(token);
    }
    if (url.protocol !== 'https:' || !APP_LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.username || url.password) return null;
    return (url.pathname || '/') + url.search + url.hash;
  } catch {
    return null;
  }
}

export async function installNativeDeepLinkBridge(): Promise<void> {
  // Web application deep link handling if needed in the future
}
