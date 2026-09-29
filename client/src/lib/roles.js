import { Brain, Bug, ChartColumn, Cloud, CodeXml, LayoutTemplate, Layers, Lock, Palette, Server, Smartphone } from 'lucide-react';

// Role categories (same keys as the server's classifier), with an icon and a quiet tint each.
export const ROLES = [
  { id: 'software', label: 'Software (SDE)', short: 'SDE', icon: CodeXml, tint: 'text-sky-600 bg-sky-500/10 dark:text-sky-300' },
  { id: 'backend', label: 'Backend', short: 'Backend', icon: Server, tint: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-300' },
  { id: 'frontend', label: 'Frontend', short: 'Frontend', icon: LayoutTemplate, tint: 'text-violet-600 bg-violet-500/10 dark:text-violet-300' },
  { id: 'fullstack', label: 'Full-stack / Web', short: 'Full-stack', icon: Layers, tint: 'text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-300' },
  { id: 'mobile', label: 'Mobile (Android / iOS)', short: 'Mobile', icon: Smartphone, tint: 'text-pink-600 bg-pink-500/10 dark:text-pink-300' },
  { id: 'data', label: 'Data science / Analytics', short: 'Data', icon: ChartColumn, tint: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
  { id: 'ml', label: 'AI / Machine learning', short: 'AI / ML', icon: Brain, tint: 'text-teal-600 bg-teal-500/10 dark:text-teal-300' },
  { id: 'devops', label: 'DevOps / Cloud', short: 'DevOps', icon: Cloud, tint: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-300' },
  { id: 'qa', label: 'QA / Testing', short: 'QA', icon: Bug, tint: 'text-amber-600 bg-amber-500/10 dark:text-amber-300' },
  { id: 'security', label: 'Cybersecurity', short: 'Security', icon: Lock, tint: 'text-orange-600 bg-orange-500/10 dark:text-orange-300' },
  { id: 'design', label: 'UI/UX & Web design', short: 'Design', icon: Palette, tint: 'text-rose-600 bg-rose-500/10 dark:text-rose-300' },
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
