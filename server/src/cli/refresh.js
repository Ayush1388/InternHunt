// One-off refresh from the terminal: npm run refresh
import '../env.js';
import { refreshAll } from '../ingest.js';
import { checkPrograms } from '../programs.js';

const summary = await refreshAll();
console.log(summary);
await checkPrograms({ force: true });
