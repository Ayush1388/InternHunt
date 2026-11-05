import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { LogoMark, Words, useReveal } from '@/app/ui';

// Privacy, Terms and 404, in the landing page's look. Legal text is written from what the app actually
// stores (server/src/db.js). Not legal advice: have someone check it before charging money.
const UPDATED = '6 November 2026';
// Put a real inbox here before launch.
const CONTACT = '';

const PRIVACY = [
  ['What we store', [
    'If you sign in with Google: your name, email address, profile picture and Google account ID, plus when you created your account and last signed in.',
    'Your tracker: the roles you save or mark as applied, interviewing, offer, rejected or no reply, any notes you write, and when you changed them.',
    'Your reports: roles you report as a scam, fake, expired or “never heard back”, and companies you block.',
    'A sign-in session, kept as a scrambled (hashed) token so the raw token never sits in our database.',
  ]],
  ['What stays in your browser', ['Your filters, the last page you opened, your weekly goal and, if you join an early-access list, the email you typed. These live in your browser’s local storage and never reach our server.']],
  ['What we don’t do', [
    'We don’t sell or share your data, run ads, or add ad or analytics trackers. The only outside services the site loads are Google’s sign-in button and Google Fonts.',
    'Browsing roles never needs an account.',
    'We read job listings only from companies’ own hiring systems, official program pages and a few vetted job boards. We don’t scrape LinkedIn or similar sites.',
  ]],
  ['Coming features', ['Resume matching and founder drafts aren’t live yet. When they are, we’ll update this page first and ask before using your resume or Gmail. Drafts will go to your own Gmail, and nothing will be sent without your approval.']],
  ['Delete your data', [
    CONTACT ? `Email ${CONTACT} from the address you signed in with and we’ll delete your account, tracker, notes and reports.` : 'Write to us from the email you signed in with and we’ll delete your account, tracker, notes and reports. A one-tap delete button is on the way.',
    'Signing out removes the session from your browser. Clearing your browser storage removes everything kept locally.',
  ]],
];

const TERMS = [
  ['What InternHunt is', ['A free, invite-only tool that collects internships and early-career roles from official sources and helps you keep track of your applications.']],
  ['Listings', [
    'Roles come from companies’ hiring systems and official pages. We filter scam-like and stale posts, but we can’t guarantee every listing is accurate or still open. Always check the official page before applying.',
    'A real employer or government program never asks you to pay. If one does, report it and don’t pay.',
  ]],
  ['Your account', ['Use your own Google account and keep your sign-in to yourself. Don’t misuse the service, scrape it, or try to break it.']],
  ['Changes', ['The service may change or pause while it’s in beta. Paid plans, if we add them, will be priced in ₹ and only charged after you agree to them.']],
];

function Bar() {
  return (
    <header className="nav">
      <div className="nav-in">
        <a href="#/" className="logo" aria-label="InternHunt home"><span className="logo-mark"><LogoMark /></span><span className="t">InternHunt</span></a>
        <div className="nav-side"><a className="nav-cta" href="#/app">Open the app <ArrowRight size={15} /></a></div>
      </div>
    </header>
  );
}

export function Legal({ kind }) {
  const privacy = kind === 'privacy';
  const ref = useReveal(kind);
  useEffect(() => {
    document.title = `${privacy ? 'Privacy' : 'Terms'} · InternHunt`;
    window.scrollTo(0, 0);
  }, [privacy]);
  return (
    <div className="ih" ref={ref}>
      <Bar />
      <main className="legal">
        <a href="#/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--muted)' }}><ArrowLeft size={16} /> Back home</a>
        <h1 key={kind}><Words text={privacy ? 'Privacy, in plain words' : 'Terms, in plain words'} mark="plain" /></h1>
        <p className="upd">Last updated {UPDATED}</p>
        <div className="stack" style={{ marginTop: 36 }}>
          {(privacy ? PRIVACY : TERMS).map(([title, paras], i) => (
            <section key={title} className="card rv" style={{ '--d': i }}>
              <h2>{title}</h2>
              {paras.map((p) => <p key={p}>{p}</p>)}
            </section>
          ))}
        </div>
        <p style={{ marginTop: 36, fontSize: 14, color: 'var(--muted)' }}>
          See also our {privacy ? <a href="#/terms" style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>terms</a> : <a href="#/privacy" style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>privacy page</a>}.
        </p>
      </main>
    </div>
  );
}

export function NotFound() {
  useEffect(() => { document.title = 'Page not found · InternHunt'; }, []);
  return (
    <div className="ih">
      <Bar />
      <main className="nf">
        <div className="hero-photo" aria-hidden="true"><img src="/hero-sky.jpg" alt="" /></div>
        <div className="pop">
          <b>404</b>
          <h1><Words text="This page flew away." mark="flew" /></h1>
          <p>The link may be old, or the page moved.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <a className="btn lg dark" href="#/app">Open the app <ArrowRight className="nudge" /></a>
            <a className="btn lg light" href="#/">Home</a>
          </div>
        </div>
      </main>
    </div>
  );
}
