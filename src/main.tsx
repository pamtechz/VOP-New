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
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(registration => {
      registration.update().catch(() => undefined);
    }).catch(error => {
      console.warn('[pwa] service worker registration failed', error);
    });
  });
}

void installNativeDeepLinkBridge().catch(error=>console.warn('[native] deep link bridge unavailable',error));

// Only the Firebase-backed study app can be mounted; no legacy demo fallback.
const container = document.getElementById('root');
if (!container) throw new Error('Voice of Prophecy root element is missing.');

createRoot(container).render(
  <StrictMode><Root /></StrictMode>,
);
