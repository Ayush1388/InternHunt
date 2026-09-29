import { Brain, Bug, ChartColumn, Cloud, CodeXml, LayoutTemplate, Layers, Lock, Palette, Server, Smartphone } from 'lucide-react';

// Role categories (same keys as the server's classifier). The icon tells roles apart; colour stays
// neutral so the list reads calm and red/green keep their meaning.
const TINT = 'text-foreground/75 bg-muted';
export const ROLES = [
  { id: 'software', label: 'Software (SDE)', short: 'SDE', icon: CodeXml, tint: TINT },
  { id: 'backend', label: 'Backend', short: 'Backend', icon: Server, tint: TINT },
  { id: 'frontend', label: 'Frontend', short: 'Frontend', icon: LayoutTemplate, tint: TINT },
  { id: 'fullstack', label: 'Full-stack / Web', short: 'Full-stack', icon: Layers, tint: TINT },
  { id: 'mobile', label: 'Mobile (Android / iOS)', short: 'Mobile', icon: Smartphone, tint: TINT },
  { id: 'data', label: 'Data science / Analytics', short: 'Data', icon: ChartColumn, tint: TINT },
  { id: 'ml', label: 'AI / Machine learning', short: 'AI / ML', icon: Brain, tint: TINT },
  { id: 'devops', label: 'DevOps / Cloud', short: 'DevOps', icon: Cloud, tint: TINT },
  { id: 'qa', label: 'QA / Testing', short: 'QA', icon: Bug, tint: TINT },
  { id: 'security', label: 'Cybersecurity', short: 'Security', icon: Lock, tint: TINT },
  { id: 'design', label: 'UI/UX & Web design', short: 'Design', icon: Palette, tint: TINT },
];
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]));

export const EXPERIENCE = [
  { id: '0', label: 'No experience', hint: 'Freshers, or the posting asks for none' },
  { id: '1', label: '1+ years' },
  { id: '3', label: '3+ years' },
  { id: '5', label: '5+ years' },
];

export const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C/C++', 'C#/.NET', 'Go', 'Rust', 'Kotlin', 'Swift', 'Dart', 'PHP', 'Ruby', 'SQL', 'Scala', 'R'];

export const DEADLINES = [
  { id: '', label: 'Open now' },
  { id: 'week', label: 'Closing this week', urgent: true },
  { id: 'month', label: 'Closing this month' },
  { id: 'has', label: 'Has a last date' },
  { id: 'ended', label: 'Ended' },
];
