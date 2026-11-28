/**
 * Rebuild the diet.json document from Turso rows.
 * The page keeps reading `{ rules, days }` and does not know about the tables.
 */

export const DEFAULT_RULES = {
  kcal: 'intake between 95% and 105% of target',
  protein: 'intake >= 95% of target',
  carbs: 'intake >= 95% of target',
  fat: 'intake <= 105% of target',
};

export function normalizeRows(result) {
  const rows = result?.rows || [];
  const columns = result?.columns || [];
  return rows.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) return row;
    const obj = {};
    columns.forEach((column, index) => {
      const name = typeof column === 'string' ? column : column?.name;
      if (name) obj[name] = row?.[index];
    });
    if (row && typeof row === 'object') {
      for (const column of columns) {
        const name = typeof column === 'string' ? column : column?.name;
        if (name && row[name] !== undefined) obj[name] = row[name];
      }
    }
    return obj;
  });
}

export function assembleDiet(rulesPayload, dayRows) {
  let rules = DEFAULT_RULES;
  if (rulesPayload != null && rulesPayload !== '') {
    const parsed = typeof rulesPayload === 'string' ? JSON.parse(rulesPayload) : rulesPayload;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('diet rules must be an object');
    }
    rules = parsed;
  }

  const days = (dayRows || []).map((row) => {
    const raw = row?.document ?? row;
    const day = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!day || typeof day !== 'object' || Array.isArray(day) || typeof day.date !== 'string') {
      throw new Error('diet day is missing a date');
    }
    if (row?.date && row.date !== day.date) {
      throw new Error(`diet date mismatch for ${row.date}`);
    }
    return day;
  });

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rules, days };
}

export async function readPublishedDiet(execute) {
  const meta = normalizeRows(await execute('SELECT ready FROM diet_meta WHERE id = 1'));
  if (Number(meta[0]?.ready) !== 1) {
    const err = new Error('diet not published');
    err.code = 'NOT_PUBLISHED';
    throw err;
  }
  const rules = normalizeRows(await execute('SELECT payload FROM diet_rules WHERE id = 1'));
  const days = normalizeRows(await execute(
    'SELECT date, document FROM diet_days ORDER BY date ASC',
  ));
  return assembleDiet(rules[0]?.payload, days);
}

export function dietHttpResult(error) {
  if (error?.code === 'NOT_PUBLISHED') {
    return { status: 503, body: { error: 'diet not published' } };
  }
  if (error?.code === 'NO_TURSO_ENV') {
    return {
      status: 500,
      body: { error: 'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set' },
    };
  }
  return { status: 500, body: { error: 'diet read failed' } };
}
