import { useEffect, useState } from 'react';
import { BellRing, Check, Download, Loader2, Mail, PauseCircle, PenLine, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { api, downloadMyData, session } from '@/api';
import { BRAND } from '@/brand';
import { Empty, Layer, Switch, TelegramIcon, Words, cx, toast } from '@/app/ui';
import { useAuth } from '@/app/auth';
import { go } from '@/app/App';

export default function Settings({ version }) {
  const auth = useAuth();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [cap, setCap] = useState(15);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');

  const load = () => api.me.get().then((r) => { setS(r); setCap(r.dailyCap); }).catch(() => {});
  useEffect(() => { if (auth?.user) load(); }, [auth?.user, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Google's Gmail screen: #/app/settings?gmail=connected|error&reason=...
  useEffect(() => {
    const qs = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (qs.get('gmail') === 'connected') toast('Gmail connected', { description: 'Approved emails now go out from your own account.' });
    if (qs.get('gmail') === 'error') toast('Gmail wasn’t connected', { description: qs.get('reason') || 'Try again.' });
    if (qs.get('gmail')) window.history.replaceState(null, '', '#/app/settings');
  }, []);

  // While the Telegram tab is open, check back for the link every few seconds.
  useEffect(() => {
    if (busy !== 'tg-wait') return;
    const t = setInterval(async () => {
      const r = await api.me.get().catch(() => null);
      if (r?.telegram.linked) { setS(r); setBusy(''); toast('Telegram connected', { description: 'Your morning picks start tomorrow at 8:30.' }); }
    }, 3000);
    const stop = setTimeout(() => setBusy(''), 120000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [busy]);

  if (!auth?.user) {
    return (
      <div>
        <section className="hero"><span className="eyebrow"><i className="dot" /> Your account</span><h1><Words text="Settings" mark="Settings" /></h1></section>
        <Empty icon={ShieldCheck} title="Sign in to change settings" action={<button className="btn dark" onClick={() => auth?.requestSignIn()}>Sign in with Google</button>}>Connect Telegram and Gmail, set your daily limit, or delete your data.</Empty>
      </div>
    );
  }
  if (!s) return <div className="hero"><Loader2 className="spin" /></div>;

  const update = async (patch, msg) => {
    try {
      const r = await api.me.update(patch);
      setS(r);
      if (msg) toast(msg);
    } catch (e) {
      toast(e.message);
    }
  };
  async function linkTelegram() {
    setBusy('tg');
    try {
      const r = await api.telegram.link();
      window.open(r.url, '_blank', 'noopener');
      setBusy('tg-wait');
    } catch (e) {
      toast(e.message);
      setBusy('');
    }
  }
  async function connectGmail() {
    setBusy('gmail');
    try {
      const r = await api.gmail.connect();
      window.location.href = r.url;
    } catch (e) {
      toast(e.message);
      setBusy('');
    }
  }
  async function deleteAll() {
    setBusy('delete');
    try {
      await api.me.remove();
      ['ih.profile', 'ih.selected', 'ih.filters.explore'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
      session.set(null);
      toast('Everything is deleted', { description: `Thanks for trying ${BRAND}.` });
      setTimeout(() => { window.location.hash = '#/'; window.location.reload(); }, 900);
    } catch (e) {
      toast(e.message);
      setBusy('');
    }
  }

  const style = s.style || {};
  const styleBits = [style.greeting && `Opens with “${style.greeting}”`, style.signoff && `Signs off “${style.signoff}”`, style.avgWords && `About ${style.avgWords} words`, style.contractions === false && 'No contractions'].filter(Boolean);

  return (
    <div>
      <section className="hero compact">
        <span className="eyebrow"><i className="dot" /> {s.user.email || s.user.name}</span>
        <h1><Words text="Settings, in one place" mark="one" /></h1>
      </section>

      <div className="settings">
        <section className="card set tg">
          <div className="set-h">
            <span className="tile tgc"><TelegramIcon size={20} /></span>
            <div><h3>Telegram</h3><p>Your morning picks at 8:30, and SEND / EDIT / SKIP right in the chat.</p></div>
            {s.telegram.linked && <span className="tag mint"><Check /> Connected{s.telegram.username ? ` · @${s.telegram.username}` : ''}</span>}
          </div>
          {!s.telegram.available ? (
            <p className="note">The Telegram bot isn’t switched on for this server yet.</p>
          ) : s.telegram.linked ? (
            <div className="set-row">
              <div className="switch-row grow"><span><BellRing size={15} /> Morning picks</span><Switch checked={s.digest && !s.paused} onChange={(v) => update({ digest: v, paused: !v }, v ? 'Morning picks are on' : 'Morning picks paused')} label="Morning picks" /></div>
              <a className="btn light" href={`https://t.me/${s.telegram.bot}`} target="_blank" rel="noopener noreferrer"><TelegramIcon size={16} /> Open chat</a>
              <button className="btn ghost" onClick={async () => { await api.telegram.unlink(); load(); toast('Telegram disconnected'); }}>Disconnect</button>
            </div>
          ) : (
            <div className="set-row">
              <button className="btn tgb" onClick={linkTelegram} disabled={busy === 'tg'}>
                {busy === 'tg' || busy === 'tg-wait' ? <Loader2 className="spin" /> : <TelegramIcon size={17} />}
                {busy === 'tg-wait' ? 'Waiting for you to tap Start in Telegram…' : 'Connect Telegram'}
              </button>
              <span className="note" style={{ marginTop: 0 }}>Opens @{s.telegram.bot}. Tap Start and you’re linked.</span>
            </div>
          )}
        </section>

        <section className="card set">
          <div className="set-h">
            <span className="tile gm"><Mail /></span>
            <div><h3>Gmail</h3><p>Approved emails go out from your own address, one at a time. We never read your inbox, only reply headers so follow-ups stop.</p></div>
            {s.gmail.connected && <span className="tag mint"><Check /> {s.gmail.email || 'Connected'}</span>}
          </div>
          {!s.gmail.available ? (
            <p className="note">Gmail sending isn’t switched on for this server yet. You can still copy emails or open them in your mail app.</p>
          ) : s.gmail.connected ? (
            <div className="set-row"><button className="btn ghost" onClick={async () => { await api.gmail.disconnect(); load(); toast('Gmail disconnected'); }}>Disconnect Gmail</button></div>
          ) : (
            <div className="set-row"><button className="btn dark" onClick={connectGmail} disabled={busy === 'gmail'}>{busy === 'gmail' ? <Loader2 className="spin" /> : <Mail />} Connect Gmail</button><span className="note" style={{ marginTop: 0 }}>Permission: create drafts and send. Nothing else.</span></div>
          )}
        </section>

        <section className="card set">
          <div className="set-h">
            <span className="tile"><PauseCircle /></span>
            <div><h3>Daily sending limit</h3><p>Low and steady keeps your Gmail out of spam folders. Emails over the limit wait for tomorrow morning.</p></div>
            <span className="tag tab">{s.sentToday} sent today</span>
          </div>
          <div className="cap">
            <input type="range" min={1} max={s.maxCap} value={cap} onChange={(e) => setCap(Number(e.target.value))} onMouseUp={() => update({ dailyCap: cap }, `Limit set to ${cap} a day`)} onTouchEnd={() => update({ dailyCap: cap }, `Limit set to ${cap} a day`)} onKeyUp={() => update({ dailyCap: cap })} aria-label="Emails per day" style={{ '--v': `${((cap - 1) / (s.maxCap - 1)) * 100}%` }} />
            <b className="tab">{cap}<small>/ day</small></b>
          </div>
        </section>

        <section className="card set">
          <div className="set-h">
            <span className="tile"><PenLine /></span>
            <div><h3>Your writing style</h3><p>Learned from the emails you edit. New drafts follow it.</p></div>
          </div>
          {styleBits.length ? <div className="skills">{styleBits.map((b) => <span key={b} className="tag line">{b}</span>)}</div> : <p className="note" style={{ marginTop: 0 }}>Edit a few drafts and we’ll pick it up.</p>}
          <div className="set-row" style={{ marginTop: 6 }}><button className="btn light" onClick={() => go('foryou')}>Edit profile and proof points</button></div>
        </section>

        <section className="card set danger">
          <div className="set-h">
            <span className="tile"><ShieldCheck /></span>
            <div><h3>Your data</h3><p>We keep your skills, links and proof points, never your resume file. Every founder contact records where it came from.</p></div>
          </div>
          <div className="set-row">
            <button className="btn light" onClick={() => downloadMyData().catch((e) => toast(e.message))}><Download /> Download my data</button>
            <button className="btn ghost red" onClick={() => setConfirm(true)}><Trash2 /> Delete my data</button>
          </div>
        </section>
      </div>

      <Layer open={confirm} onClose={() => setConfirm(false)} label="Delete my data">
        <span className="m-ico red"><TriangleAlert /></span>
        <h2>Delete everything?</h2>
        <p className="sub">Your profile, drafts, sent history, pipeline, Telegram link and Gmail connection are removed for good. This can’t be undone.</p>
        <label className="flabel" htmlFor="del-confirm">Type <b>delete</b> to confirm</label>
        <input id="del-confirm" className="field" style={{ width: '100%' }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn lg chip" onClick={() => setConfirm(false)}>Cancel</button>
          <button className={cx('btn lg dark', 'danger')} disabled={typed.trim().toLowerCase() !== 'delete' || busy === 'delete'} onClick={deleteAll}>{busy === 'delete' && <Loader2 className="spin" />} Delete my data</button>
        </div>
      </Layer>
    </div>
  );
}
