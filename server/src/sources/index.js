// Order matters: when the same job appears in two places, the source listed first wins,
// so direct company boards come before job boards.
//
// Trust tiers (shown in the UI):
//   company   – read straight from the company's own careers system (ATS). Can't be posted by a third party.
//   board     – employer-paid or hand-curated job boards with a record of real listings.
//   community – posts by company staff in the HN "Who is hiring?" thread; unverified, so filtered harder.
//
// Removed after a trust review (see README → "Why these sources"):
//   Careerjet, Adzuna – scrape the open web; agency ads, expired links, scam reports
//   Jobicy            – re-aggregates other boards, so the original poster is unclear
//   Himalayas         – free employer posting + automated imports with light vetting
//   Arbeitnow         – Europe-only; produced no India-eligible jobs
import greenhouse from './greenhouse.js';
import lever from './lever.js';
import ashby from './ashby.js';
import workable from './workable.js';
import recruitee from './recruitee.js';
import personio from './personio.js';
import smartrecruiters from './smartrecruiters.js';
import workday from './workday.js';
import amazon from './amazon.js';
import microsoft from './microsoft.js';
import weworkremotely from './weworkremotely.js';
import remotive from './remotive.js';
import remoteok from './remoteok.js';
import workingnomads from './workingnomads.js';
import themuse from './themuse.js';
import hn from './hn.js';

export const SOURCES = [
  greenhouse, lever, ashby, workable, recruitee, personio, smartrecruiters, workday, amazon, microsoft,
  weworkremotely, remotive, remoteok, workingnomads, themuse,
  hn,
];

export const TRUST = {
  greenhouse: 'company', lever: 'company', ashby: 'company', workable: 'company', recruitee: 'company',
  personio: 'company', smartrecruiters: 'company', workday: 'company', amazon: 'company', microsoft: 'company',
  weworkremotely: 'board', remotive: 'board', remoteok: 'board', workingnomads: 'board', themuse: 'board',
  hn: 'community',
};

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// Non-company sources: old listings from these are skipped.
export const AGGREGATORS = new Set(SOURCES.filter((s) => TRUST[s.id] !== 'company').map((s) => s.id));

// Company-board types that can be listed in companies.json / discovered.json.
export const BOARD_TYPES = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'personio', 'smartrecruiters', 'workday'];
