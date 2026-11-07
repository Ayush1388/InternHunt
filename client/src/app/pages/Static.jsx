import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { LogoMark, Words, useReveal } from '@/app/ui';

// Privacy, Terms and 404, in the landing page's look. Legal text is written from what the app actually
// stores (server/src/db/schema.sql). Not legal advice: have someone check it before charging money.
const UPDATED = '7 November 2026';

const PRIVACY = [
  ['What we store about you', [
    'Your account: name, email and profile picture from Google sign-in, or your Telegram name and chat ID if you use the bot.',
    'Your profile: the skills, role choices, links and “things you built” lines you give us, and a one-line summary. When you upload a resume on the web it is read in your browser and only the skill list leaves your device. When you send a PDF to the Telegram bot, we read it once to pull out the same list and don’t keep the file.',
    'Your emails: the drafts we write for you, your edits (used to learn your writing style), what you approved, when it was sent and whether someone replied.',
    'Your pipeline, notes, reports and blocked companies, and a hashed sign-in session token.',
  ]],
  ['Gmail', [
    'Connecting Gmail is optional. We ask for two permissions: create drafts and send email (gmail.compose), and read message headers (gmail.metadata) so follow-ups stop when someone replies. We never read the body of any email in your inbox.',
    'We only send an email after you approve that exact email, from your own address, within your daily limit. Your Google token is stored encrypted and you can disconnect at any time.',
  ]],
  ['Founders and other people', [
    'Founder names come from public pages only: Y Combinator company pages and the startup’s own website. We never scrape LinkedIn.',
    'Email addresses are marked as verified, found on their website, or a best guess from the usual pattern. Every contact records where it came from.',
    'Every email we draft ends with an easy way to say no, and we stop all follow-ups the moment someone replies.',
  ]],
  ['AI', ['If AI drafting is switched on, the facts for one email (the startup fact and your proof point, not your resume) are sent to Google’s Gemini API on a paid plan, which doesn’t use them to train models. Without it, drafts are written from a template on our own server.']],
  ['What we don’t do', [
    'We don’t sell or share your data, run ads, or add ad or analytics trackers.',
    'We never send an email you didn’t approve.',
  ]],
  ['Delete your data', [
    'Settings → Delete my data (or /delete in the Telegram bot) removes your account, profile, drafts, sent history, pipeline and Gmail connection straight away. Settings → Download my data gives you a copy first.',
  ]],
];

const TERMS = [
  ['What Doorstep is', ['A free, invite-only tool that finds startups that are hiring or just raised money, writes a short email to a founder for you to review, and helps you keep track of what you sent.']],
  ['Your emails are yours', [
    'You approve every email, and it goes out from your own account. Be honest, write to one person at a time, and take no for an answer. Don’t use Doorstep for bulk or unrelated outreach.',
    'Check names and email addresses before you send. Guesses are labelled as guesses.',
  ]],
  ['Listings', [
    'Roles come from companies’ own hiring systems and Y Combinator’s public pages. We filter scam-like and stale posts, but we can’t guarantee every listing is accurate or still open.',
    'A real employer never asks you to pay. If one does, report it and don’t pay.',
  ]],
  ['Changes', ['The service may change or pause while it’s in beta. A Pro plan, if we add it, will be priced in ₹, paid by UPI, and only charged after you agree to it.']],
];

function Bar() {
  return (
    <header className="nav">
      <div className="nav-in">
        <a href="#/" className="logo" aria-label="Doorstep home"><span className="logo-mark"><LogoMark /></span><span className="t">Doorstep</span></a>
        <div className="nav-side"><a className="nav-cta" href="#/app">Open the app <ArrowRight size={15} /></a></div>
      </div>
    </header>
  );
}

export function Legal({ kind }) {
  const privacy = kind === 'privacy';
  const ref = useReveal(kind);
  useEffect(() => {
    document.title = `${privacy ? 'Privacy' : 'Terms'} · Doorstep`;
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
  useEffect(() => { document.title = 'Page not found · Doorstep'; }, []);
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
