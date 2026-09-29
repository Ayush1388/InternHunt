// Small display helpers shared by the screens.
export function initials(name = '') {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words[1]?.[0] || '')).toUpperCase();
}

// Deterministic index per company name so avatars vary but stay stable.
export function shadeIndex(name = '', n = 6) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/** Whole days from today (IST) to a YYYY-MM-DD date: 0 = today, 1 = tomorrow, -1 = yesterday. */
export function daysUntil(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIST()}T00:00:00Z`)) / 86400000);
}

export function shortDate(date, withYear = false) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  const opts = { day: 'numeric', month: 'short' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-IN', opts);
}

/**
 * How a listing's application window reads right now.
 * tone: 'urgent' (closes within 7 days) | 'open' | 'ended' | 'rolling' | 'none'
 */
export function deadlineInfo(job) {
  const estimated = (job.flags || []).includes('deadline_estimated');
  const ended = !job.isActive || (job.deadline && daysUntil(job.deadline) < 0);
  if (ended) {
    const on = job.deadline && daysUntil(job.deadline) < 0 ? job.deadline : job.closedAt;
    if (!on) return { tone: 'ended', label: 'Ended' };
    const d = daysUntil(String(on).slice(0, 10));
    return { tone: 'ended', label: d === 0 ? 'Ended today' : d === -1 ? 'Ended yesterday' : `Ended ${shortDate(on)}`, date: on };
  }
  if (job.deadline) {
    const d = daysUntil(job.deadline);
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : shortDate(job.deadline);
    return {
      tone: d <= 7 ? 'urgent' : 'open',
      label: `${estimated ? 'Usually closes' : 'Closes'} ${when}`,
      short: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : shortDate(job.deadline),
      left: d <= 7 ? (d === 0 ? 'last day' : `${d} day${d === 1 ? '' : 's'} left`) : null,
      date: job.deadline,
      estimated,
    };
  }
  if (job.appStatus === 'rolling') return { tone: 'rolling', label: 'Rolling — apply anytime' };
  return { tone: 'none', label: 'No last date listed' };
}

export function istDay(iso) {
  return new Date(Date.parse(iso) + 5.5 * 3600000).toISOString().slice(0, 10);
}

export function compact(n) {
  return new Intl.NumberFormat('en-IN', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n || 0);
}
