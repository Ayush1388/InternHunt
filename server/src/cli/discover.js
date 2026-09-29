// Finds companies' job boards automatically.
//
//   npm run discover                          built-in list of ~160 India-hiring companies + YC companies in India
//   npm run discover -- --names "Razorpay, Swiggy, https://careers.example.com"
//   npm run discover -- --file companies.txt  one name, "name; careers-url", or careers URL per line
//   npm run discover -- --yc-all              every active YC company (slow)
//   add --dry-run to only print what it finds
//
// The server also runs the default discovery automatically once a week.
import '../env.js';
import { readFileSync } from 'node:fs';
import { discover, discoverDefault, namesFrom, ycCompanies } from '../discovery.js';

export { candidateTokens } from '../discovery.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

async function main() {
  const dryRun = flag('--dry-run');
  if (value('--names')) return discover(namesFrom(value('--names')), { dryRun });
  if (value('--file')) return discover(namesFrom(readFileSync(value('--file'), 'utf8')), { dryRun });
  if (flag('--yc-all')) return discover(await ycCompanies(true), { dryRun });
  return discoverDefault();
}

if (process.argv[1]?.endsWith('discover.js')) {
  main()
    .then(() => console.log("Done. New boards are fetched on the next refresh (or run: npm run refresh)."))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
