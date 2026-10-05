import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { installNativeDeepLinkBridge } from './services/nativeDeepLinks';
import './index.css';
import './reference.css';
import './radio-responsive.css';
import './admin-layout-overrides.css';
import './theme.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/auth?action=policy', { headers:{Accept:'application/json'} });
        if (!response.ok) return;
        const policy = await response.json() as {pwa?:{enabled?:boolean}};
        if (policy.pwa?.enabled === true) {
          const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          registration.update().catch(() => undefined);
          return;
        }
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      } catch (error) {
        // A temporary policy/network failure must not destroy an existing
        // offline-capable installation. Reconcile again on the next online load.
        console.warn('[pwa] service worker policy could not be reconciled', error);
      }
    })();
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
