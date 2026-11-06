// npm run refresh [-- --steps funding,yc,boards,discover,embed]
import { refreshAll } from '../pipeline/refresh.js';
import { closeDb } from '../db/index.js';

const i = process.argv.indexOf('--steps');
const steps = i > 0 ? process.argv[i + 1].split(',') : undefined;
const summary = await refreshAll(steps ? { steps } : {});
console.log(JSON.stringify(summary, null, 2));
await closeDb();
