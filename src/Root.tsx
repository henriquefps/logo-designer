import { lazy, Suspense } from 'react';
import { App } from './app/App';

// Two pages, no router: /sync is the sync server setup guide, everything else is the editor.
// The Worker (single-page-application fallback) and the PWA's navigation fallback serve index.html for /sync.
const SyncSetup = lazy(() => import('./pages/SyncSetup'));

const isSyncPagePath = (pathname: string) => /^\/sync\/?$/.test(pathname);

export function Root() {
  if (!isSyncPagePath(window.location.pathname)) return <App />;
  return (
    <Suspense fallback={null}>
      <SyncSetup />
    </Suspense>
  );
}
