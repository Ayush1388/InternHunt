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

// Hash routes:  #/            landing (also #how, #faq… section anchors)
//               #/app[/page]  the app: today | internships | jobs | government | tracker | recruiting | drafts
//               #/privacy, #/terms
function parse(hash = window.location.hash) {
  if (hash.startsWith('#/app')) {
    const page = hash.slice(6).split(/[/?]/)[0] || 'today';
    const alias = { intern: 'internships', job: 'jobs', applications: 'tracker', programs: 'government' }[page] || page;
    return PAGES.includes(alias) ? { view: 'app', page: alias } : { view: 'notfound' };
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
      setRoute((prev) => (prev.view === next.view && prev.page === next.page ? prev : next));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.view === 'landing') return <Landing />;
  return (
    <AuthProvider>
      {route.view === 'app' && <App page={route.page} />}
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
