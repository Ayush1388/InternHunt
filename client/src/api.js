async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    const err = new Error(body.error || body.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  jobs: (params) => request(`/jobs?${new URLSearchParams(params)}`),
  job: (id) => request(`/jobs/${encodeURIComponent(id)}`),
  meta: () => request('/meta'),
  refresh: () => request('/refresh', { method: 'POST' }),
  report: (id, reason) => request(`/jobs/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),
  blocked: () => request('/blocked'),
  programs: () => request('/programs'),
  add: (url, name) => request('/add', { method: 'POST', body: JSON.stringify({ url, name }) }),
  removeProgram: (id) => request(`/programs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  checkPrograms: () => request('/programs/check', { method: 'POST' }),
  unblock: (key) => request(`/blocked/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  track: (id, status, notes = '') =>
    request(`/jobs/${encodeURIComponent(id)}/track`, { method: 'PUT', body: JSON.stringify({ status, notes }) }),
  untrack: (id) => request(`/jobs/${encodeURIComponent(id)}/track`, { method: 'DELETE' }),
};

export const LABELS = {
  category: { sde: 'SDE / Software', web: 'Web / Full-stack', data: 'Data / ML' },
  level: { intern: 'Internship', entry: 'Entry-level', unspecified: 'Level not stated' },
  loc: { india_onsite: 'India · on-site/hybrid', remote_india: 'Remote · India/APAC', remote_worldwide: 'Remote · worldwide' },
  status: { saved: 'Saved', applied: 'Applied', interview: 'Interviewing', offer: 'Offer', rejected: 'Rejected', no_reply: 'No reply' },
  trust: {
    company: { label: 'Company careers page', hint: 'Read directly from the company’s own hiring system' },
    board: { label: 'Job board', hint: 'Posted on a paid or curated job board — check the company before applying' },
    community: { label: 'HN community post', hint: 'Posted by someone at the company on Hacker News — unverified' },
  },
  flags: {
    open_long: 'Open 45+ days — may be a ghost job',
    reposted: 'Reposted after closing',
    thin_description: 'Very short description',
  },
  reportReasons: {
    scam: 'Scam — asks for money or personal details',
    fake: 'Fake — company or job doesn’t exist',
    no_reply: 'Applied, never heard back',
    expired: 'Expired / no longer accepting',
  },
  source: {
    greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', recruitee: 'Recruitee',
    personio: 'Personio', smartrecruiters: 'SmartRecruiters', workday: 'Workday', amazon: 'amazon.jobs',
    microsoft: 'Microsoft Careers', hn: 'HN Who is Hiring',
    weworkremotely: 'We Work Remotely', remotive: 'Remotive', remoteok: 'Remote OK',
    workingnomads: 'Working Nomads', themuse: 'The Muse',
  },
};

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
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
};
