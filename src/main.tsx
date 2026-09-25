import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import './index.css';
import './reference.css';
import './radio-responsive.css';

// Only the Firebase-backed study app can be mounted; no legacy demo fallback.
const container = document.getElementById('root');
if (!container) throw new Error('Voice of Prophecy root element is missing.');

createRoot(container).render(
  <StrictMode><Root /></StrictMode>,
);
