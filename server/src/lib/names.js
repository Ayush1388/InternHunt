// Company names, domains and people's names, normalised so the same company from two sources meets.

const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|pvt|private|technologies|technology|labs?|hq|ai)\b/g;

/** Stable key for a company name: "Razorpay Software Pvt. Ltd." -> "razorpaysoftware". */
export const companyKey = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, '') || String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** "https://www.Acme.io/about" -> "acme.io". Empty for anything that isn't a web address. */
export function domainOf(website) {
  const w = String(website || '').trim();
  if (!w) return '';
  try {
    const u = new URL(w.includes('//') ? w : `https://${w}`);
    if (!/^https?:$/.test(u.protocol)) return '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : '';
  } catch {
    return '';
  }
}

/** Lowercase ASCII words of a person's name: "José  Núñez-Díaz" -> ["jose", "nunezdiaz"]. */
export function nameParts(full) {
  return String(full || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

export const firstName = (full) => {
  const raw = String(full || '').trim().split(/\s+/)[0] || '';
  return raw ? raw[0].toUpperCase() + raw.slice(1) : '';
};
