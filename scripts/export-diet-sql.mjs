/**
 * Print idempotent upserts for the current data/diet.json snapshot.
 * The last statement publishes the read API. Run it only after the day
 * upserts have all succeeded.
 *
 *   node scripts/export-diet-sql.mjs
 */

import { readFileSync } from 'node:fs';

import { migrationStatements, publishStatement } from '../js/diet-sql.js';

const diet = JSON.parse(readFileSync(new URL('../data/diet.json', import.meta.url), 'utf8'));
const statements = migrationStatements(diet);

console.error(`days ${diet.days.length}; publish statement is last and separate`);
for (const statement of statements) {
  console.log(`${statement};`);
  console.log('');
}
console.log('-- statement');
console.log('-- Publish only after SELECT COUNT(*) FROM diet_days equals the day count above.');
console.log(`${publishStatement()};`);
