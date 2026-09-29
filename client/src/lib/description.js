// Turns a plain-text job description into titled sections, and finds the requirements.
const HEADING_WORDS =
  /^(about|the role|role|what you('ll| will)|what we|who you are|you (have|are|will)|your|requirements?|qualifications?|minimum|preferred|basic|nice to have|bonus|skills|responsibilit|key responsibilit|duties|eligibility|when|stipend|benefits|perks|why|our|how to apply|job description|description|overview|summary|good to know|skills needed|must have|what's in it|compensation|location|team)/i;
const REQUIREMENTS = /(requirement|qualification|what you('ll| will)? (need|bring)|who you are|you have|skills|eligib|must[\s-]have|looking for|about you|what we expect|minimum|basic)/i;

function isHeading(line) {
  if (line.length > 70 || line.length < 3) return false;
  if (/[.!?,;]$/.test(line) && !line.endsWith(':')) return false;
  if (line.endsWith(':')) return true;
  return HEADING_WORDS.test(line) && line.split(/\s+/).length <= 8;
}

/** [{ title, lines, isRequirements }] — the first section has no title when the text starts without one. */
export function parseDescription(text = '') {
  const sections = [];
  let cur = { title: '', lines: [] };
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/^[\s•●▪◦\-–*·]+/, '').trim();
    if (!line) continue;
    if (isHeading(line)) {
      if (cur.title || cur.lines.length) sections.push(cur);
      cur = { title: line.replace(/:$/, ''), lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  if (cur.title || cur.lines.length) sections.push(cur);
  return sections.map((s) => ({ ...s, isRequirements: Boolean(s.title) && REQUIREMENTS.test(s.title) }));
}
