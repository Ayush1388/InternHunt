import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LogOut, UserRound } from 'lucide-react';
import { api, session } from '@/api';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
      reject(new Error("Couldn't load Google sign-in"));
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
        if (!r.user) session.set(null); // expired session
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

  /** Open the sign-in dialog, with an optional line saying why. */
  const requestSignIn = useCallback((reason = '') => setDialog({ open: true, reason }), []);

  return (
    <AuthContext.Provider value={{ user, ready, clientId, signOut, requestSignIn, version }}>
      {children}
      <SignInDialog
        open={dialog.open}
        reason={dialog.reason}
        clientId={clientId}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onCredential={onCredential}
      />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function GoogleButton({ clientId, onCredential }) {
  const ref = useRef(null);
  const { resolved } = useTheme();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup' });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          theme: resolved === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: 300,
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, resolved]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return <div ref={ref} className="flex min-h-11 justify-center" />;
}

function SignInDialog({ open, onOpenChange, reason, clientId, onCredential }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">Sign in</DialogTitle>
          <DialogDescription>
            {reason || 'Keep your own saved roles and application tracker, on any device.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {clientId ? (
            open && <GoogleButton clientId={clientId} onCredential={onCredential} />
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Sign-in isn't set up on this server yet (GOOGLE_CLIENT_ID is missing).
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">We only use your name and email to keep your tracker. Browsing never needs an account.</p>
      </DialogContent>
    </Dialog>
  );
}

/** Header control: "Sign in" button, or the account menu. */
export function AccountButton() {
  const { user, ready, requestSignIn, signOut } = useAuth();
  if (!ready) return <div className="size-9" />;
  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={() => requestSignIn()}>
        Sign in
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full">
          {user.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full border" />
          ) : (
            <UserRound />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
