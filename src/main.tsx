import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { installNativeDeepLinkBridge } from './services/nativeDeepLinks';
import { loadPublicAuthPolicy } from './services/authPolicy';
import './index.css';
import './reference.css';
import './radio-responsive.css';
import './admin-layout-overrides.css';
import './theme.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void loadPublicAuthPolicy().then(async policy => {
      if(!policy.available)return;
      if (policy.pwa.enabled) {
        try {
          const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
          await registration.update().catch(()=>undefined);
        } catch (error) {
          console.warn('[pwa] service worker registration failed',error);
        }
        return;
      }
      const registrations=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
      await Promise.all(registrations
        .filter(item=>String(item.active?.scriptURL||item.installing?.scriptURL||item.waiting?.scriptURL||'').endsWith('/sw.js'))
        .map(item=>item.unregister().catch(()=>false)));
      if('caches' in window){
        const keys=await caches.keys().catch(()=>[]);
        await Promise.all(keys.filter(key=>key.startsWith('vop-shell-')).map(key=>caches.delete(key)));
      }
    }).catch(error=>console.warn('[pwa] runtime policy unavailable',error));
  });
}

void installNativeDeepLinkBridge().catch(error=>console.warn('[native] deep link bridge unavailable',error));

// Only the Firebase-backed study app can be mounted; no legacy demo fallback.
// Release marker: admin portal, certification automation and serverless hardening verified 2026-10-04.
const container = document.getElementById('root');
if (!container) throw new Error('Voice of Prophecy root element is missing.');

createRoot(container).render(
  <StrictMode><Root /></StrictMode>,
);
