/**
 * SQL for the diet document stored in Turso.
 * One row per day keeps the JSON the page already reads, and a day upsert
 * is a single INSERT ... ON CONFLICT the Turso write tool can run.
 */

export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function statementsFromSqlFile(text) {
  return String(text)
    .split(/^\s*--\s*statement\s*$/m)
    .map((part) => part
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim())
    .filter((part) => /^(CREATE|INSERT|UPDATE|ALTER|DROP)\b/i.test(part))
    .map((part) => part.replace(/;\s*$/, ''));
}

export function rulesUpsertSql(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new Error('diet rules must be an object');
  }
  return `INSERT INTO diet_rules (id, payload) VALUES (1, ${sqlString(JSON.stringify(rules))}) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`;
}

export function dayUpsertSql(day) {
  const date = day?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('diet day needs a YYYY-MM-DD date');
  }
  const document = JSON.stringify({ ...day, date });
  return `INSERT INTO diet_days (date, document) VALUES (${sqlString(date)}, ${sqlString(document)}) ON CONFLICT(date) DO UPDATE SET document = excluded.document`;
}

export function publishStatement() {
  return 'INSERT INTO diet_meta (id, ready) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET ready = excluded.ready';
}

export function unpublishStatement() {
  return 'UPDATE diet_meta SET ready = 0 WHERE id = 1';
}

/** Rules row, then one statement per day. Does not publish. */
export function migrationStatements(diet) {
  if (!diet || !Array.isArray(diet.days)) throw new Error('diet.days missing');
  return [
    rulesUpsertSql(diet.rules),
    ...diet.days.map((day) => dayUpsertSql(day)),
  ];
}
