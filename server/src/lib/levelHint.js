// Map the seniority labels different sources use onto our three buckets.
export function levelHintFrom(...labels) {
  const s = labels.flat().filter(Boolean).join(' ').toLowerCase();
  if (!s) return null;
  if (/\b(intern|internship|student|trainee|working student|werkstudent|apprentice)\b/.test(s)) return 'intern';
  if (/\b(entry|entry[\s_-]?level|junior|graduate|new[\s_-]?grad|fresher|associate|lt-1|0-1|1-2)\b/.test(s)) return 'entry';
  if (/\b(mid|midweight|mid[\s_-]?level|senior|lead|manager|management|director|executive|principal|experienced|2-5|5-7|7-10|gt-10|mid_senior)\b/.test(s))
    return 'senior';
  return null;
}
