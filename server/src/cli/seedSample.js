// Loads fictional sample postings so you can try the UI without internet: npm run seed:sample
// Remove them later with: npm run seed:sample -- --remove
import '../env.js';
import { db } from '../db.js';
import { selectRelevant, storeTargetJobs } from '../ingest.js';
import { SOURCE_BY_ID } from '../sources/index.js';
import { SAMPLE } from '../sample/sampleData.js';
import { SHOWCASE } from '../sample/showcase.js';
import { syncProgramListings } from '../programs.js';

if (process.argv.includes('--remove')) {
  const { changes } = db.prepare("DELETE FROM jobs WHERE target_key LIKE 'sample:%'").run();
  console.log(`Removed ${changes} sample jobs.`);
  process.exit(0);
}

let total = 0;
const ALL = [...Object.entries(SAMPLE), ['greenhouse', SHOWCASE]];
for (const [sourceId, { target, raw }] of ALL) {
  const parsed = SOURCE_BY_ID[sourceId].parse(raw, target);
  const blocked = {};
  const relevant = selectRelevant(parsed, { blocked });
  const { stored, duplicates } = storeTargetJobs(target, relevant);
  total += stored;
  const b = Object.entries(blocked).map(([r, n]) => `${n} blocked (${r})`).join(', ');
  console.log(`${target.label}: ${parsed.length} postings → ${stored} kept${duplicates ? `, ${duplicates} duplicate` : ''}${b ? `, ${b}` : ''}`);
}
console.log(`Seeded ${total} sample jobs and ${syncProgramListings().stored} program listings. Start the server and open the app.`);
