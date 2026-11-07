import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initTheme } from './theme/theme';
import { App } from './app/App';

initTheme();
if (import.meta.env.DEV) void import('./dev/debugHandle').then((m) => m.installDebugHandle());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
