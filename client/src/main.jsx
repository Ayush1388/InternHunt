import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import Landing from '@/Landing';
import App, { PAGES } from '@/app/App';
import { AuthProvider } from '@/app/auth';
import { Legal, NotFound } from '@/app/pages/Static';
import { Toaster } from '@/app/ui';
import '@/app/app.css';
import '@/app/doorstep.css';

// Hash routes:  #/                 landing (also #how, #faq… section anchors)
//               #/app[/page[/arg]]  the app: explore | foryou | drafts[/id] | pipeline | settings | recruiting
//               #/privacy, #/terms
function parse(hash = window.location.hash) {
  if (hash.startsWith('#/app')) {
    const [page = '', arg = ''] = hash.slice(6).split('?')[0].split('/');
    // Older links: the separate lists became filters on Explore; the tracker became the pipeline.
    const alias = {
      '': { page: 'explore' }, today: { page: 'explore' }, internships: { page: 'explore', kind: 'intern' }, intern: { page: 'explore', kind: 'intern' },
      jobs: { page: 'explore', kind: 'job' }, job: { page: 'explore', kind: 'job' }, government: { page: 'explore' }, programs: { page: 'explore' },
      applications: { page: 'pipeline' }, tracker: { page: 'pipeline' }, profile: { page: 'foryou' },
    }[page] || { page };
    return PAGES.includes(alias.page) ? { view: 'app', page: alias.page, kind: alias.kind || '', arg } : { view: 'notfound' };
  }
  if (hash === '#/privacy' || hash === '#/terms') return { view: 'legal', page: hash.slice(2) };
  if (hash.startsWith('#/') && hash.length > 2) return { view: 'notfound' };
  return { view: 'landing' };
}

function Root() {
  const [route, setRoute] = React.useState(parse);
  React.useEffect(() => {
    const onHash = () => {
      const next = parse();
      setRoute((prev) => (prev.view === next.view && prev.page === next.page && prev.kind === next.kind && prev.arg === next.arg ? prev : next));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.view === 'landing') return <Landing />;
  return (
    <AuthProvider>
      {route.view === 'app' && <App page={route.page} kind={route.kind} arg={route.arg} />}
      {route.view === 'legal' && <Legal kind={route.page} />}
      {route.view === 'notfound' && <NotFound />}
      <Toaster />
    </AuthProvider>
  );
}

const container = document.getElementById('root');
// Reuse the root across hot reloads in development.
const root = (container.__root ||= createRoot(container));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
