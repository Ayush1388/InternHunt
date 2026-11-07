import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark, FileText, GitBranch, Hammer, Link2, Loader2, Lock, Mail, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { api } from '@/api';
import { ALL_SKILLS, EMPTY_PROFILE, hasProfile, linksFromText, looksLikeStudent, profileStore, rolesFromSkills, skillsFromGithub, skillsFromText, summaryFromText, textFromFile } from '@/lib/profile';
import { Empty, RowsSkeleton, Words, cx, toast, useReveal } from '@/app/ui';
import { JobCard } from '@/app/jobs';
import { BackedChips, KindToggle, RegionChips } from '@/app/scope';
import { useAuth } from '@/app/auth';
import { go } from '@/app/App';

/** "One thing you built", in a sentence: the proof point every email uses. Never invented. */
function Proofs({ proofs = [], onChange }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.replace(/\s+/g, ' ').trim();
    if (t.length >= 12 && !proofs.includes(t)) onChange([...proofs, t].slice(0, 5));
    setV('');
  };
  return (
    <div className="src proofs">
      <div className="src-h"><span className="tile"><Hammer /></span> Things you built <span className="tag got">{proofs.length || 'needed'}</span></div>
      {proofs.map((p, i) => (
        <div key={p} className="proof">
          <span className="n">{i + 1}</span><span className="t">{p}</span>
          <button aria-label="Remove" onClick={() => onChange(proofs.filter((x) => x !== p))}><X /></button>
        </div>
      ))}
      {proofs.length < 5 && (
        <div className="addskill">
          <input className="mini" placeholder="e.g. Built a React app for our canteen, 600 students use it" aria-label="Something you built" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button className="btn dark icon" aria-label="Add" onClick={add} disabled={v.trim().length < 12}><Plus /></button>
        </div>
      )}
      <p className="note" style={{ margin: 0 }}>One sentence each, with a real number if you have one. Emails quote these, and nothing else about you.</p>
    </div>
  );
}

const initialsOf = (p) => (p.github ? p.github.slice(0, 2) : (p.resumeName || 'Me').slice(0, 2)).toUpperCase();

/* ------------------------------------------------------------------ profile builder */
function Builder({ profile, onDone, busy, setBusy }) {
  const [draft, setDraft] = useState(profile);
  const [text, setText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [over, setOver] = useState(false);
  const [gh, setGh] = useState(profile.github || '');
  const [ghInfo, setGhInfo] = useState(null);
  const [error, setError] = useState('');
  const file = useRef(null);
  const merge = (patch) => setDraft((d) => ({ ...d, ...patch, skills: [...new Set([...(d.skills || []), ...(patch.skills || [])])] }));

  async function readResume(f) {
    setError('');
    setBusy(true);
    try {
      const t = await textFromFile(f);
      const skills = skillsFromText(t);
      const links = linksFromText(t);
      merge({ skills, summary: summaryFromText(t), resumeName: f.name, github: draft.github || links.github, linkedin: draft.linkedin || links.linkedin, kind: draft.kind || (looksLikeStudent(t) ? 'intern' : '') });
      if (links.github && !gh) setGh(links.github);
      toast(skills.length ? `Found ${skills.length} skills in your resume` : 'Read your resume, but found no known skills', { description: 'Add or remove any below.' });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function readPasted() {
    const skills = skillsFromText(text);
    const links = linksFromText(text);
    merge({ skills, summary: summaryFromText(text), resumeName: 'Pasted text', github: draft.github || links.github, linkedin: draft.linkedin || links.linkedin, kind: draft.kind || (looksLikeStudent(text) ? 'intern' : '') });
    if (links.github && !gh) setGh(links.github);
    setPasting(false);
    toast(skills.length ? `Found ${skills.length} skills` : 'No known skills found in that text');
  }
  async function scanGithub() {
    setError('');
    setBusy(true);
    try {
      const r = await skillsFromGithub(gh);
      merge({ skills: r.skills, github: r.user });
      setGhInfo(r);
      toast(`Read ${r.repos} public repos`, { description: r.skills.length ? `Skills: ${r.skills.slice(0, 5).join(', ')}` : 'No known skills found.' });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const ready = draft.skills.length > 0;
  const finish = () => {
    const skills = draft.skills;
    onDone({ ...EMPTY_PROFILE, ...draft, skills, roles: rolesFromSkills(skills), github: ghInfo?.user || draft.github });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="src">
        <div className="src-h">
          <span className="tile"><FileText /></span> Resume
          {draft.resumeName && <span className="tag mint got">{draft.resumeName.length > 18 ? `${draft.resumeName.slice(0, 16)}…` : draft.resumeName}</span>}
        </div>
        {pasting ? (
          <>
            <textarea className="mini" placeholder="Paste your resume text here" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm dark" disabled={text.trim().length < 20} onClick={readPasted}>Read it</button>
              <button className="btn sm ghost" onClick={() => setPasting(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={cx('drop', over && 'over')}
              onClick={() => file.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) readResume(f); }}
            >
              <Upload aria-hidden="true" />
              <b style={{ fontWeight: 500 }}>Drop your resume or click to choose</b>
              <small>PDF, .txt or .md. It’s read in your browser and never uploaded.</small>
            </button>
            <input ref={file} type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readResume(f); }} />
            <button className="linkbtn" onClick={() => setPasting(true)}>or paste the text instead</button>
          </>
        )}
      </div>

      <div className="src">
        <div className="src-h">
          <span className="tile"><GitBranch /></span> GitHub
          {ghInfo && <span className="tag mint got">{ghInfo.repos} repos</span>}
        </div>
        <div className="addskill">
          <input className="mini" placeholder="username" aria-label="GitHub username" value={gh} onChange={(e) => setGh(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && gh.trim() && scanGithub()} />
          <button className="btn dark" disabled={!gh.trim() || busy} onClick={scanGithub}>Scan</button>
        </div>
      </div>

      <div className="src">
        <div className="src-h"><span className="tile"><Link2 /></span> Portfolio and LinkedIn</div>
        <input className="mini" type="url" placeholder="https://your-portfolio.com" aria-label="Portfolio link" value={draft.portfolio} onChange={(e) => setDraft((d) => ({ ...d, portfolio: e.target.value }))} />
        <input className="mini" type="url" placeholder="https://linkedin.com/in/you" aria-label="LinkedIn link" value={draft.linkedin} onChange={(e) => setDraft((d) => ({ ...d, linkedin: e.target.value }))} />
        <p className="note" style={{ margin: 0 }}>Saved to use in your emails. We don’t scan these pages.</p>
      </div>

      <Proofs proofs={draft.proofs || []} onChange={(proofs) => setDraft((d) => ({ ...d, proofs }))} />
      {draft.skills.length > 0 && <SkillEditor skills={draft.skills} onChange={(skills) => setDraft((d) => ({ ...d, skills }))} />}
      {error && <p className="res bad" style={{ margin: 0 }}>{error}</p>}
      <button className="btn lg dark" disabled={!ready || busy} onClick={finish}>
        {busy ? <Loader2 className="spin" /> : <Sparkles />} {ready ? 'Find my matches' : 'Add a resume or GitHub first'}
      </button>
      <p className="privacy-note"><Lock aria-hidden="true" /> We keep your skills and links, never your resume text. Delete them any time.</p>
    </div>
  );
}

function SkillEditor({ skills, onChange }) {
  const [v, setV] = useState('');
  const add = () => {
    const s = v.trim().toLowerCase();
    if (s && s.length <= 40 && !skills.includes(s)) onChange([...skills, s]);
    setV('');
  };
  return (
    <div className="src">
      <div className="src-h">Your skills <span className="tag got" style={{ marginLeft: 'auto' }}>{skills.length}</span></div>
      <div className="skills">
        {skills.map((s) => <span key={s} className="skill">{s}<button aria-label={`Remove ${s}`} onClick={() => onChange(skills.filter((x) => x !== s))}><X /></button></span>)}
      </div>
      <div className="addskill">
        <input className="mini" list="skill-list" placeholder="Add a skill" aria-label="Add a skill" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <datalist id="skill-list">{ALL_SKILLS.filter((s) => !skills.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        <button className="btn dark icon" aria-label="Add skill" onClick={add} disabled={!v.trim()}><Plus /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export default function ForYou({ version, onOpen, onTrack, onReport, onApply, onDraft, drafting, facets }) {
  const auth = useAuth();
  const [profile, setProfile] = useState(() => profileStore.get());
  const [editing, setEditing] = useState(() => !hasProfile(profileStore.get()));
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState({ kind: profileStore.get().kind || '', backed: '', loc: profileStore.get().loc || [] });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('ih.selected') || '[]')); } catch { return new Set(); } });
  const [writing, setWriting] = useState(false);
  const ref = useReveal(res?.matches.length);
  const reqId = useRef(0);

  // Signed in: use the profile saved on the account (and keep this device's one if the account has none yet).
  useEffect(() => {
    if (!auth?.user) return;
    api.profile.get().then(({ profile: p }) => {
      if (p && hasProfile(p)) { setProfile({ ...EMPTY_PROFILE, ...p }); profileStore.set(p); setEditing(false); setView((v) => ({ ...v, kind: p.kind || v.kind })); }
      else if (hasProfile(profileStore.get())) api.profile.save(profileStore.get()).catch(() => {});
    }).catch(() => {});
  }, [auth?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (p, v) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const r = await api.match({ skills: p.skills, roles: p.roles, kind: v.kind, backed: v.backed, loc: v.loc, limit: 60 });
      if (id === reqId.current) setRes(r);
    } catch (e) {
      if (id === reqId.current) setRes({ error: e.message, matches: [], total: 0 });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { if (hasProfile(profile) && !editing) run(profile, view); }, [profile, view, editing, version, run]);
  useEffect(() => { try { localStorage.setItem('ih.selected', JSON.stringify([...selected])); } catch { /* private mode */ } }, [selected]);

  function saveProfile(p) {
    setProfile(p);
    profileStore.set(p);
    setEditing(false);
    if (auth?.user) api.profile.save(p).catch(() => toast('Couldn’t save your profile to your account'));
  }
  function removeAll() {
    profileStore.clear();
    setProfile(EMPTY_PROFILE);
    setRes(null);
    setSelected(new Set());
    setEditing(true);
    if (auth?.user) api.profile.remove().catch(() => {});
    toast('Your profile was deleted');
  }
  const toggleSelect = (job) => setSelected((s) => { const n = new Set(s); n.has(job.id) ? n.delete(job.id) : n.add(job.id); return n; });
  const picked = (res?.matches || []).filter((j) => selected.has(j.id));
  async function saveSelected() {
    if (!auth?.user) return auth?.requestSignIn('Sign in to save the roles you picked to your tracker.');
    let n = 0;
    for (const j of picked) if (!j.status) { await onTrack(j, 'saved'); n++; }
    toast(n ? `Saved ${n} role${n === 1 ? '' : 's'} to your pipeline` : 'They’re all saved already');
  }
  async function writeEmails() {
    if (!auth?.user) return auth?.requestSignIn('Sign in so the emails can use your profile. You review every one before it’s sent.');
    setWriting(true);
    try {
      const r = await api.drafts.batch(picked.slice(0, 10).map((j) => j.id));
      setSelected(new Set());
      toast(`${r.drafts.length} email${r.drafts.length === 1 ? '' : 's'} ready to review`, { description: r.errors.length ? `${r.errors.length} couldn’t be written` : 'Nothing is sent until you approve each one.' });
      go(r.drafts[0] ? `drafts/${r.drafts[0].id}` : 'drafts');
    } catch (e) {
      toast(e.message);
    } finally {
      setWriting(false);
    }
  }

  const profiled = hasProfile(profile) && !editing;
  const matches = res?.matches || [];

  return (
    <div ref={ref}>
      <section className="hero photo">
        <div className="hero-photo" aria-hidden="true"><img src="/hero-sky.jpg" alt="" /></div>
        <span className="eyebrow"><i className="dot" /> {profiled ? 'Matched to your skills' : 'Takes about a minute'}</span>
        <h1 style={{ maxWidth: 860 }}><Words text="Curated for you, from your own work" mark="you," /></h1>
        <p className="lead">Share your resume, GitHub or portfolio once. We rank every open role against it, say why each one fits, and write the email to the founder for the ones you pick.</p>
      </section>

      <div className="fy">
        <aside className={cx('card side rv', profiled && 'sticky')}>
          {profiled ? (
            <>
              <div className="prof-head">
                <span className="avatar lg">{initialsOf(profile)}</span>
                <div style={{ minWidth: 0 }}>
                  <h3>{auth?.user?.name || 'Your profile'}</h3>
                  <p className="sub" style={{ marginTop: 2 }}>{profile.skills.length} skills · {profile.roles.map((r) => r).join(', ') || 'any role'}</p>
                </div>
              </div>
              {profile.summary && <p style={{ fontSize: 14, color: 'var(--ink2)' }}>{profile.summary}</p>}
              <Proofs proofs={profile.proofs || []} onChange={(proofs) => saveProfile({ ...profile, proofs })} />
              <div className="skills">
                {profile.skills.slice(0, 18).map((s) => <span key={s} className="skill" style={{ paddingRight: 12 }}>{s}</span>)}
                {profile.skills.length > 18 && <span className="tag">+{profile.skills.length - 18}</span>}
              </div>
              {(profile.github || profile.portfolio || profile.linkedin) && (
                <div className="prof-links">
                  {profile.github && <a href={`https://github.com/${profile.github}`} target="_blank" rel="noopener noreferrer"><GitBranch /> {profile.github}</a>}
                  {profile.portfolio && <a href={profile.portfolio} target="_blank" rel="noopener noreferrer"><Link2 /> Portfolio</a>}
                  {profile.linkedin && <a href={profile.linkedin} target="_blank" rel="noopener noreferrer"><Link2 /> LinkedIn</a>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn light" onClick={() => setEditing(true)}><RotateCcw /> Update</button>
                <button className="btn ghost" onClick={removeAll}><Trash2 /> Delete my data</button>
              </div>
              <p className="privacy-note"><ShieldCheck aria-hidden="true" />{auth?.user ? 'Saved to your account.' : 'Saved on this device only. Sign in to keep it everywhere.'}</p>
            </>
          ) : (
            <>
              <div>
                <h3>Build your profile</h3>
                <p className="sub">Use any of these. The more real detail, the better your emails.</p>
              </div>
              <Builder profile={profile} onDone={saveProfile} busy={busy} setBusy={setBusy} />
              {hasProfile(profile) && <button className="linkbtn" onClick={() => setEditing(false)}>Cancel</button>}
            </>
          )}
        </aside>

        <section className="rv" style={{ '--d': 1, minWidth: 0 }}>
          {!profiled ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '28px 28px 8px' }}>
                <h2 style={{ fontSize: 24 }}>What you’ll get</h2>
                <p style={{ marginTop: 6, color: 'var(--muted)', fontSize: 15 }}>An example of a match, with the reason it fits. Yours appear here once your profile is ready.</p>
              </div>
              <div style={{ padding: 14, opacity: 0.92 }} aria-hidden="true">
                <div className="job card" style={{ boxShadow: 'none' }}>
                  <div className="job-head"><span className="avatar" style={{ background: 'var(--t-peach)' }}>LL</span><div className="co"><b>Lumen Labs</b><span>Example · Company careers page</span></div></div>
                  <div className="job-body"><div className="main">
                    <h3>Machine Learning Intern</h3>
                    <div className="facts"><span>Remote · worldwide</span><span>2d ago</span></div>
                    <div className="fit"><b>94%</b> match <span>· python, pytorch, machine learning</span></div>
                    <div className="tags"><span className="tag yc"><i className="y">Y</i>YC W24</span><span className="tag blue">Internship</span></div>
                  </div></div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="res-head">
                <div>
                  <h2>Your matches</h2>
                  <p>{loading && !res ? 'Matching…' : res?.error ? 'Couldn’t match right now.' : `${(res?.total ?? 0).toLocaleString('en-IN')} roles fit your skills, best first.`}</p>
                </div>
              </div>
              <div className="card deck" style={{ marginTop: 0, marginBottom: 18 }}>
                <KindToggle value={view.kind} onChange={(kind) => setView((v) => ({ ...v, kind }))} counts={facets?.byKind} />
                <BackedChips value={view.backed} onChange={(backed) => setView((v) => ({ ...v, backed }))} facets={facets} />
                <RegionChips loc={view.loc} onChange={(loc) => setView((v) => ({ ...v, loc }))} />
              </div>
              {loading && !res ? (
                <div className="card"><RowsSkeleton n={4} /></div>
              ) : res?.error ? (
                <Empty icon={Sparkles} title="Couldn’t reach the server">{res.error}</Empty>
              ) : matches.length === 0 ? (
                <Empty icon={Sparkles} title="No matches with these filters" action={<button className="btn dark" onClick={() => setView({ kind: '', backed: '', loc: [] })}>Clear filters</button>}>Try widening where, or add more skills to your profile.</Empty>
              ) : (
                <div className="list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
                  {matches.map((job, i) => (
                    <JobCard key={job.id} i={i} job={job} match={{ fit: job.fit, why: job.why }} selected={selected.has(job.id)} onSelect={toggleSelect} onOpen={onOpen} onTrack={onTrack} onReport={onReport} onApply={onApply} onDraft={onDraft} drafting={drafting} />
                  ))}
                </div>
              )}
              {picked.length > 0 && (
                <div className="tray" role="region" aria-label="Selected roles">
                  <div className="tx"><b>{picked.length} role{picked.length === 1 ? '' : 's'} selected</b><span>{picked.slice(0, 3).map((j) => j.company).join(', ')}{picked.length > 3 ? ` +${picked.length - 3}` : ''}</span></div>
                  <button className="btn light" onClick={() => setSelected(new Set())}>Clear</button>
                  <button className="btn light" onClick={saveSelected}><Bookmark /> Save</button>
                  <button className="btn mint" onClick={writeEmails} disabled={writing}>{writing ? <Loader2 className="spin" /> : <Mail />} {writing ? 'Writing…' : `Write ${Math.min(picked.length, 10)} email${picked.length === 1 ? '' : 's'}`}</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
