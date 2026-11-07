// Session token from Google sign-in (see auth.jsx). Sent with every request when present.
const SESSION_KEY = 'ih.session';
export const session = {
  get: () => store.get(SESSION_KEY, null),
  set: (token) => (token ? store.set(SESSION_KEY, token) : store.remove(SESSION_KEY)),
};

async function request(path, options = {}) {
  const token = session.get();
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    const err = new Error(body.error || body.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    err.body = body;
    throw err;
  }
  return body;
}
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) });
const del = (path) => request(path, { method: 'DELETE' });

export const api = {
  config: () => request('/config'),
  jobs: (params) => request(`/jobs?${new URLSearchParams(params)}`),
  job: (id) => request(`/jobs/${encodeURIComponent(id)}`),
  facets: (kind = 'all') => request(`/facets?kind=${kind}`),
  meta: () => request('/meta'),
  fresh: (days = 30, limit = 24) => request(`/fresh?days=${days}&limit=${limit}`),
  match: (body) => post('/match', body),
  refresh: () => post('/refresh'),
  add: (url, name) => post('/add', { url, name }),
  report: (id, reason) => post(`/jobs/${encodeURIComponent(id)}/report`, { reason }),
  blocked: () => request('/blocked'),
  unblock: (key) => del(`/blocked/${encodeURIComponent(key)}`),
  track: (id, status, notes = '') => request(`/jobs/${encodeURIComponent(id)}/track`, { method: 'PUT', body: JSON.stringify({ status, notes }) }),
  untrack: (id) => del(`/jobs/${encodeURIComponent(id)}/track`),
  company: (key) => request(`/companies/${encodeURIComponent(key)}`),
  findContacts: (key, verify = false) => post(`/companies/${encodeURIComponent(key)}/contacts`, { verify }),
  profile: {
    get: () => request('/profile'),
    save: (profile) => request('/profile', { method: 'PUT', body: JSON.stringify({ profile }) }),
    remove: () => del('/profile'),
  },
  drafts: {
    list: (status = '') => request(`/drafts${status ? `?status=${status}` : ''}`),
    get: (id) => request(`/drafts/${id}`),
    create: (body) => post('/drafts', body),
    batch: (jobIds) => post('/drafts/batch', { jobIds }),
    edit: (id, body) => patch(`/drafts/${id}`, body),
    approve: (id, mode = 'send') => post(`/drafts/${id}/approve`, { mode }),
    skip: (id) => post(`/drafts/${id}/skip`),
    replied: (id) => post(`/drafts/${id}/replied`),
  },
  pipeline: () => request('/pipeline'),
  me: {
    get: () => request('/me'),
    update: (body) => patch('/me', body),
    remove: () => del('/me'),
    exportUrl: '/api/me/export',
  },
  gmail: { connect: () => request('/gmail/connect'), scan: () => post('/gmail/scan'), disconnect: () => del('/gmail') },
  telegram: { link: () => post('/telegram/link'), unlink: () => del('/telegram/link') },
  waitlist: (email, kind = 'pro') => post('/waitlist', { email, kind }),
  auth: {
    config: () => request('/auth/config'),
    me: () => request('/auth/me'),
    google: (credential) => post('/auth/google', { credential }),
    logout: () => post('/auth/logout'),
  },
};

/** Download my data as a JSON file (needs the session header, so it goes through fetch). */
export async function downloadMyData() {
  const res = await fetch(api.me.exportUrl, { headers: { Authorization: `Bearer ${session.get()}` } });
  if (!res.ok) throw new Error('Couldn’t export your data');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: 'doorstep-my-data.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const LABELS = {
  level: { intern: 'Internship', job: 'Job' },
  exp: { 0: 'No experience', 1: '1+ years', 3: '3+ years', 5: '5+ years' },
  loc: {
    india_onsite: 'India · on-site/hybrid', remote_india: 'Remote · India/APAC', remote_worldwide: 'Remote · worldwide',
    remote_region: 'Remote · one region', abroad_onsite: 'Outside India · on-site',
  },
  status: {
    saved: 'Saved', drafted: 'Drafted', applied: 'Sent', replied: 'Replied', interview: 'Interviewing', offer: 'Offer',
    rejected: 'Rejected', no_reply: 'No reply',
  },
  trust: {
    company: { label: 'Company’s own hiring page', hint: 'Read directly from the company’s own hiring system' },
  },
  flags: {
    open_long: 'Open 45+ days — may be a ghost job',
    reposted: 'Reposted after closing',
    thin_description: 'Very short description',
    region_locked: 'May need work authorisation in a specific country',
  },
  reportReasons: {
    scam: 'Scam — asks for money or personal details',
    fake: 'Fake — company or job doesn’t exist',
    no_reply: 'Applied, never heard back',
    expired: 'Expired / no longer accepting',
  },
  source: {
    greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', recruitee: 'Recruitee',
    smartrecruiters: 'SmartRecruiters', yc: 'Y Combinator',
  },
  news: { entrackr: 'Entrackr', inc42: 'Inc42', startuptalky: 'StartupTalky', yc: 'YC' },
  email: {
    verified: { label: 'Verified', tone: 'mint' },
    unverified: { label: 'Found, not verified', tone: 'blue' },
    on_site: { label: 'On their website', tone: 'blue' },
    guess: { label: 'Best guess', tone: 'butter' },
    user: { label: 'Added by you', tone: 'mint' },
    none: { label: 'No email yet', tone: 'red' },
  },
  contactSource: { yc_page: 'YC company page', company_site: 'their website', apify: 'email finder', user: 'you' },
};

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 0) return 'soon';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// localStorage can throw (private mode, blocked storage) — never let that break the app.
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
