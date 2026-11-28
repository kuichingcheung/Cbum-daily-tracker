import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { dietApiUrls, isDietDocument, loadDiet } from '../js/diet.js';
import { assembleDiet, dietHttpResult, normalizeRows, readPublishedDiet } from '../js/diet-read.js';
import {
  dayUpsertSql,
  migrationStatements,
  publishStatement,
  rulesUpsertSql,
  sqlString,
  statementsFromSqlFile,
  unpublishStatement,
} from '../js/diet-sql.js';

const diet = JSON.parse(readFileSync(new URL('../data/diet.json', import.meta.url), 'utf8'));
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null) },
    json: async () => body,
  };
}

test('schema statements create the three diet tables', () => {
  const statements = statementsFromSqlFile(schema);
  assert.equal(statements.length, 3);
  const db = new DatabaseSync(':memory:');
  for (const statement of statements) db.exec(statement);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    .map((row) => row.name);
  assert.deepEqual(names, ['diet_days', 'diet_meta', 'diet_rules']);
});

test('migration round-trips data/diet.json, including array meal items', () => {
  const db = new DatabaseSync(':memory:');
  for (const statement of statementsFromSqlFile(schema)) db.exec(statement);
  for (const statement of migrationStatements(diet)) db.exec(statement);
  db.exec(publishStatement());

  const rules = db.prepare('SELECT payload FROM diet_rules WHERE id = 1').get();
  const days = db.prepare('SELECT date, document FROM diet_days ORDER BY date ASC').all();
  const assembled = assembleDiet(rules.payload, days);
  assert.deepEqual(assembled.rules, diet.rules);
  assert.equal(assembled.days.length, diet.days.length);
  assert.deepEqual(assembled, diet);

  const arrayDay = assembled.days.find((day) => day.date === '2026-11-27');
  assert.equal(Array.isArray(arrayDay.meals[0].items), true);
  assert.equal(arrayDay.complete, false);
  assert.equal(assembled.days.at(-1).date, '2026-11-27');
});

test('unpublished database is not served, and a later publish is', async () => {
  const db = new DatabaseSync(':memory:');
  for (const statement of statementsFromSqlFile(schema)) db.exec(statement);
  for (const statement of migrationStatements(diet)) db.exec(statement);

  const execute = async (sql) => {
    const rows = db.prepare(sql).all();
    return { columns: rows[0] ? Object.keys(rows[0]) : [], rows };
  };

  await assert.rejects(() => readPublishedDiet(execute), (err) => err.code === 'NOT_PUBLISHED');
  db.exec(publishStatement());
  const published = await readPublishedDiet(execute);
  assert.deepEqual(published, diet);
  db.exec(unpublishStatement());
  await assert.rejects(() => readPublishedDiet(execute), (err) => err.code === 'NOT_PUBLISHED');
});

test('day upsert replaces one day and keeps the others', () => {
  const db = new DatabaseSync(':memory:');
  for (const statement of statementsFromSqlFile(schema)) db.exec(statement);
  for (const statement of migrationStatements(diet)) db.exec(statement);

  const updated = {
    ...diet.days.find((day) => day.date === '2026-11-26'),
    complete: true,
    note: "教練備註 '已結'",
    intake: { kcal: 1900, protein: 130, carbs: 200, fat: 60 },
  };
  db.exec(dayUpsertSql(updated));
  const row = db.prepare("SELECT document FROM diet_days WHERE date = '2026-11-26'").get();
  assert.equal(JSON.parse(row.document).note, "教練備註 '已結'");
  assert.equal(JSON.parse(row.document).complete, true);
  const count = db.prepare('SELECT COUNT(*) AS days FROM diet_days').get();
  assert.equal(Number(count.days), diet.days.length);
});

test('sql strings escape single quotes and rules upsert is valid JSON', () => {
  assert.equal(sqlString("a'b"), "'a''b'");
  const sql = rulesUpsertSql(diet.rules);
  assert.match(sql, /^INSERT INTO diet_rules/);
  const literal = sql.match(/VALUES \(1, '((?:''|[^'])*)'\)/)[1].replace(/''/g, "'");
  assert.deepEqual(JSON.parse(literal), diet.rules);
});

test('normalizeRows accepts object rows and array rows', () => {
  assert.deepEqual(normalizeRows({ rows: [{ ready: 1 }] }), [{ ready: 1 }]);
  assert.deepEqual(
    normalizeRows({ columns: ['document'], rows: [['{"date":"2026-10-03"}']] }),
    [{ document: '{"date":"2026-10-03"}' }],
  );
});

test('http errors stay generic and do not publish an empty document', () => {
  assert.deepEqual(dietHttpResult({ code: 'NOT_PUBLISHED' }), {
    status: 503,
    body: { error: 'diet not published' },
  });
  assert.equal(dietHttpResult(new Error('token leaked in message')).status, 500);
  assert.deepEqual(dietHttpResult(new Error('nope')).body, { error: 'diet read failed' });
});

test('GitHub Pages reads the Vercel diet API, and local preview uses same-origin', () => {
  assert.deepEqual(
    dietApiUrls('https://kuichingcheung.github.io/Cbum-daily-tracker/'),
    ['https://cbum-daily-tracker.vercel.app/api/diet'],
  );
  assert.deepEqual(
    dietApiUrls('http://127.0.0.1:8080/'),
    ['http://127.0.0.1:8080/api/diet'],
  );
  assert.deepEqual(
    dietApiUrls('https://cbum-daily-tracker.vercel.app/'),
    ['https://cbum-daily-tracker.vercel.app/api/diet'],
  );
});

test('loadDiet uses a published API document and does not send a token', async () => {
  const calls = [];
  const apiDiet = {
    rules: diet.rules,
    days: [diet.days[0]],
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, undefined);
    return jsonResponse(apiDiet);
  };
  const result = await loadDiet({
    href: 'https://kuichingcheung.github.io/Cbum-daily-tracker/',
    settings: { token: 'github_pat_secret', owner: 'kuichingcheung', repo: 'Cbum-daily-tracker' },
    fetchImpl,
    now: () => 1,
  });
  assert.equal(result.source, 'api');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://cbum-daily-tracker.vercel.app/api/diet?t=1');
  assert.equal(isDietDocument(result.data), true);
  assert.equal(result.data.days[0].date, '2026-10-03');
});

test('loadDiet falls back to data/diet.json when the API is not published', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('/api/diet')) return jsonResponse({ error: 'diet not published' }, 503);
    const name = String(url).includes('training') ? 'training' : 'diet';
    assert.match(String(url), /data\/diet\.json/);
    return jsonResponse(name === 'diet' ? diet : { days: [] });
  };
  const result = await loadDiet({
    href: 'https://kuichingcheung.github.io/Cbum-daily-tracker/#today',
    settings: { token: '', owner: 'kuichingcheung', repo: 'Cbum-daily-tracker' },
    fetchImpl,
    now: () => 2,
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.data.days.length, diet.days.length);
  assert.equal(calls.length, 2);
});

test('GET without Turso env does not open a database connection', async () => {
  const previousUrl = process.env.TURSO_DATABASE_URL;
  const previousToken = process.env.TURSO_AUTH_TOKEN;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  try {
    const { GET, OPTIONS, POST, PUT, DELETE } = await import('../api/diet.js');
    assert.equal(POST, undefined);
    assert.equal(PUT, undefined);
    assert.equal(DELETE, undefined);
    const response = await GET();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      error: 'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set',
    });
    const options = OPTIONS();
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  } finally {
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = previousToken;
  }
});

test('frontend sources do not embed a Turso token or database URL', () => {
  const files = [
    'index.html',
    'js/app.js',
    'js/config.js',
    'js/diet.js',
    'js/github.js',
    'sw.js',
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /libsql:\/\//);
    assert.doesNotMatch(text, /TURSO_AUTH_TOKEN\s*[:=]\s*['"][^'"]+/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
  }
});
