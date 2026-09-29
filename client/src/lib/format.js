// Small display helpers shared by the screens.
export function initials(name = '') {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words[1]?.[0] || '')).toUpperCase();
}

// Deterministic grayscale shade (0–5) per company so avatars vary without adding colour.
export function shadeIndex(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function daysUntil(date) {
  return Math.ceil((Date.parse(`${date}T23:59:59+05:30`) - Date.now()) / 86400000);
}

export function shortDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function istDay(iso) {
  return new Date(Date.parse(iso) + 5.5 * 3600000).toISOString().slice(0, 10);
}

export function compact(n) {
  return new Intl.NumberFormat('en-IN', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n || 0);
}
