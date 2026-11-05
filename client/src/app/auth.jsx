import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { api, session } from '@/api';
import { Layer, Menu, toast } from '@/app/ui';

// Google sign-in: Google Identity Services renders its own button and hands us a signed ID token,
// which the server checks and swaps for an InternHunt session token (kept in localStorage).
const AuthContext = createContext(null);

let gisLoading = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('Couldn’t load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [clientId, setClientId] = useState(null);
  const [dialog, setDialog] = useState({ open: false, reason: '' });
  const [version, setVersion] = useState(0); // bumps on sign-in / sign-out so lists reload

  useEffect(() => {
    api.auth.config().then((c) => setClientId(c.googleClientId)).catch(() => {});
    if (!session.get()) return setReady(true);
    api.auth
      .me()
      .then((r) => {
        setUser(r.user);
        if (!r.user) session.set(null);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const onCredential = useCallback(async ({ credential }) => {
    try {
      const r = await api.auth.google(credential);
      session.set(r.token);
      setUser(r.user);
      setDialog({ open: false, reason: '' });
      setVersion((v) => v + 1);
      toast(`Signed in as ${r.user.name}`);
    } catch (e) {
      toast(e.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    session.set(null);
    setUser(null);
    setVersion((v) => v + 1);
    toast('Signed out');
  }, []);

  const requestSignIn = useCallback((reason = '') => setDialog({ open: true, reason }), []);

  return (
    <AuthContext.Provider value={{ user, ready, clientId, signOut, requestSignIn, version }}>
      {children}
      <Layer open={dialog.open} onClose={() => setDialog((d) => ({ ...d, open: false }))} label="Sign in">
        <span className="m-ico"><UserRound /></span>
        <h2>Sign in to InternHunt</h2>
        <p className="sub">{dialog.reason || 'Keep your own saved roles and application tracker, on any device.'}</p>
        <div style={{ marginTop: 22 }}>
          {clientId ? (
            dialog.open && <GoogleButton clientId={clientId} onCredential={onCredential} />
          ) : (
            <p className="res bad" style={{ marginTop: 0 }}>Sign-in isn’t set up on this server yet (GOOGLE_CLIENT_ID is missing).</p>
          )}
        </div>
        <p className="note">We only use your name and email to keep your tracker. Browsing never needs an account.</p>
      </Layer>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function GoogleButton({ clientId, onCredential }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup' });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);
  if (error) return <p className="res bad">{error}</p>;
  return <div ref={ref} style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} />;
}

/** Right side of the floating nav: a white "Sign in" pill, or your avatar with a sign-out menu. */
export function NavAccount() {
  const { user, ready, requestSignIn, signOut } = useAuth();
  if (!ready) return <span className="nav-avatar" aria-hidden="true" />;
  if (!user) return <button className="nav-cta" onClick={() => requestSignIn()}>Sign in</button>;
  return (
    <Menu
      trigger={(p) => (
        <button {...p} className="nav-avatar" aria-label="Account">
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <UserRound size={18} />}
        </button>
      )}
    >
      <h6>{user.name}<br />{user.email}</h6>
      <hr />
      <button role="menuitem" onClick={signOut}><LogOut /> Sign out</button>
    </Menu>
  );
}
