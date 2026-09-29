// Finding application deadlines written in free text (job descriptions, official program pages).

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_RES = [
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(?:of\\s+)?${MON}\\.?,?[\\s-]+(\\d{4})\\b`, 'gi'), f: (m) => [m[3], m[2], m[1]] },
  { re: new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'), f: (m) => [m[3], m[1], m[2]] },
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, f: (m) => [m[3], Number(m[2]), m[1]] }, // dd/mm/yyyy (Indian format)
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, f: (m) => [m[1], Number(m[2]), m[3]] }, // ISO
];
const DEADLINE_WORDS = /(last date|deadline|apply by|apply before|closes? on|closing date|applications? close|till|until|due date|registration (ends|closes)|last day)/i;

function toDate([y, mon, d]) {
  const month = typeof mon === 'number' ? mon - 1 : MONTHS.indexOf(String(mon).slice(0, 3).toLowerCase());
  const date = new Date(Date.UTC(Number(y), month, Number(d)));
  return month >= 0 && month < 12 && date.getUTCDate() === Number(d) ? date : null;
}

/** Nearest future date that appears right after a deadline phrase, as YYYY-MM-DD, or null. */
export function extractDeadline(text = '', now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best = null;
  const lower = text;
  let m;
  const kw = new RegExp(DEADLINE_WORDS.source, 'gi');
  while ((m = kw.exec(lower)) !== null) {
    const windowText = lower.slice(m.index, m.index + 120);
    for (const { re, f } of DATE_RES) {
      re.lastIndex = 0;
      let d;
      while ((d = re.exec(windowText)) !== null) {
        const date = toDate(f(d));
        if (date && date.getTime() >= today && date.getTime() - today < 400 * 86400000 && (!best || date < best)) best = date;
      }
    }
  }
  return best ? best.toISOString().slice(0, 10) : null;
}
