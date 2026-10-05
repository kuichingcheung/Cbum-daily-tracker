import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  computeWindowStats,
  decodeBase64Utf8,
  deltaText,
  encodeBase64Utf8,
  evaluateDay,
  macroBadgeLabel,
  macroPasses,
  mergeTrainingDay,
  monthCells,
  statusLabel,
  stringifyTraining,
  toggleBodyPart,
  toggleTrained,
} from '../js/logic.js';

const diet = JSON.parse(readFileSync(new URL('../data/diet.json', import.meta.url), 'utf8'));
const training = JSON.parse(readFileSync(new URL('../data/training.json', import.meta.url), 'utf8'));

function day(date) {
  return diet.days.find((item) => item.date === date);
}

test('2026-10-03 intake versus target matches the seed day', () => {
  const evaluation = evaluateDay(day('2026-10-03'));
  assert.equal(evaluation.macros.kcal.intake, 2537);
  assert.equal(evaluation.macros.kcal.target, 2600);
  assert.equal(macroBadgeLabel(evaluation, 'kcal'), '達標');
  assert.equal(deltaText(evaluation.macros.kcal.delta), '差 63');
  assert.equal(evaluation.macros.protein.intake, 154.5);
  assert.equal(evaluation.macros.protein.target, 140);
  assert.equal(macroBadgeLabel(evaluation, 'protein'), '達標');
  assert.equal(deltaText(evaluation.macros.protein.delta), '超 14.5');
  assert.equal(evaluation.passed, 2);
  assert.equal(evaluation.macros.carbs.intake, 265);
  assert.equal(evaluation.macros.carbs.target, 340);
  assert.equal(macroBadgeLabel(evaluation, 'carbs'), '未達標');
  assert.equal(deltaText(evaluation.macros.carbs.delta), '差 75');
  assert.equal(evaluation.macros.fat.intake, 98);
  assert.equal(evaluation.macros.fat.target, 72);
  assert.equal(macroBadgeLabel(evaluation, 'fat'), '未達標');
  assert.equal(deltaText(evaluation.macros.fat.delta), '超 26');
  assert.equal(statusLabel(evaluation.status), '未達標');
});

test('2026-10-05 is in progress and is not judged', () => {
  const evaluation = evaluateDay(day('2026-10-05'));
  assert.equal(evaluation.complete, false);
  assert.equal(statusLabel(evaluation.status), '進行中');
  assert.equal(macroBadgeLabel(evaluation, 'kcal'), '進行中');
  assert.equal(macroBadgeLabel(evaluation, 'protein'), '進行中');
  assert.equal(deltaText(evaluation.macros.kcal.delta), '差 776');
  assert.equal(deltaText(evaluation.macros.fat.delta), '差 22.5');
});

test('each macro uses its own threshold', () => {
  assert.equal(macroPasses('kcal', 95, 100), true);
  assert.equal(macroPasses('kcal', 105, 100), true);
  assert.equal(macroPasses('kcal', 94.9, 100), false);
  assert.equal(macroPasses('kcal', 105.1, 100), false);

  assert.equal(macroPasses('protein', 95, 100), true);
  assert.equal(macroPasses('protein', 250, 100), true);
  assert.equal(macroPasses('protein', 94.9, 100), false);
  assert.equal(macroPasses('carbs', 95, 100), true);
  assert.equal(macroPasses('carbs', 250, 100), true);
  assert.equal(macroPasses('carbs', 94.9, 100), false);

  assert.equal(macroPasses('fat', 105, 100), true);
  assert.equal(macroPasses('fat', 0, 100), true);
  assert.equal(macroPasses('fat', 105.1, 100), false);
});

test('a complete day passes when at least 3 macros pass', () => {
  const target = { kcal: 100, protein: 100, carbs: 100, fat: 100 };
  const passing = evaluateDay({
    date: '2026-10-01',
    complete: true,
    target,
    intake: { kcal: 100, protein: 200, carbs: 200, fat: 50 },
  });
  assert.equal(passing.passed, 4);
  assert.equal(statusLabel(passing.status), '達標');

  const twoOfFour = evaluateDay({
    date: '2026-10-01',
    complete: true,
    target,
    intake: { kcal: 100, protein: 200, carbs: 50, fat: 200 },
  });
  assert.equal(twoOfFour.passed, 2);
  assert.equal(statusLabel(twoOfFour.status), '未達標');

  const inProgress = evaluateDay({
    date: '2026-10-01',
    complete: false,
    target,
    intake: { kcal: 100, protein: 100, carbs: 100, fat: 100 },
  });
  assert.equal(statusLabel(inProgress.status), '進行中');
});

test('2026-10-04 passes protein only', () => {
  const evaluation = evaluateDay(day('2026-10-04'));
  assert.equal(evaluation.macros.kcal.pass, false);
  assert.equal(evaluation.macros.protein.pass, true);
  assert.equal(evaluation.macros.carbs.pass, false);
  assert.equal(evaluation.macros.fat.pass, false);
  assert.equal(evaluation.passed, 1);
  assert.equal(statusLabel(evaluation.status), '未達標');
});

test('October 2026 calendar starts on Sunday', () => {
  const cells = monthCells('2026-10');
  assert.equal(cells[0], null);
  assert.equal(cells[3], null);
  assert.equal(cells[4], '2026-10-01');
  assert.equal(cells[7], '2026-10-04');
  assert.equal(cells[8], '2026-10-05');
});

test('merge replaces a day, appends a new one, and keeps date order', () => {
  const merged = mergeTrainingDay(training, {
    date: '2026-10-05',
    trained: true,
    parts: ['腿', '胸', '休息'],
    note: ' 腿日 ',
  });
  assert.deepEqual(merged.days.map((item) => item.date), ['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepEqual(merged.days[2], {
    date: '2026-10-05',
    trained: true,
    parts: ['胸', '腿'],
    note: '腿日',
  });

  const replaced = mergeTrainingDay(merged, {
    date: '2026-10-03',
    trained: false,
    parts: ['休息'],
    note: '',
  });
  assert.equal(replaced.days[0].trained, false);
  assert.deepEqual(replaced.days[0].parts, ['休息']);
  assert.equal(replaced.days[0].note, undefined);
  assert.equal(replaced.days[1].note, '斜坡行 30 分鐘');
});

test('base64 round-trips Traditional Chinese', () => {
  const text = stringifyTraining({
    days: [{ date: '2026-10-03', trained: true, parts: ['胸', '三頭'], note: '推日' }],
  });
  const encoded = encodeBase64Utf8(text);
  assert.equal(encoded.includes('胸'), false);
  const wrapped = encoded.replace(/(.{60})/g, '$1\n');
  assert.equal(decodeBase64Utf8(wrapped), text);
  assert.match(decodeBase64Utf8(wrapped), /胸/);
  assert.match(decodeBase64Utf8(wrapped), /三頭/);
});

test('body-part toggle treats 休息 as an off day', () => {
  const on = toggleBodyPart({ date: '2026-10-05', trained: false, parts: [], note: '' }, '胸');
  assert.equal(on.trained, true);
  assert.deepEqual(on.parts, ['胸']);
  const rest = toggleBodyPart(on, '休息');
  assert.equal(rest.trained, false);
  assert.deepEqual(rest.parts, ['休息']);
  const cleared = toggleTrained({ ...on, trained: true });
  assert.equal(cleared.trained, false);
  assert.deepEqual(cleared.parts, []);
});

test('last 7 days ending 2026-10-05 summarise the seed data', () => {
  const stats = computeWindowStats(diet.days, training.days, '2026-10-05', 7);
  assert.equal(stats.completeCount, 2);
  assert.equal(stats.progressCount, 1);
  assert.deepEqual(stats.hits, { kcal: 1, protein: 2, carbs: 0, fat: 0, overall: 0 });
  assert.equal(stats.trainingCount, 2);
  assert.equal(stats.partCounts['胸'], 1);
  assert.equal(stats.partCounts['三頭'], 1);
  assert.equal(stats.partCounts['帶氧'], 1);
  assert.ok(Math.abs(stats.avgIntake.kcal - 2564) < 0.001);
  assert.ok(Math.abs(stats.avgIntake.protein - 155.05) < 0.001);
  assert.ok(Math.abs(stats.avgTarget.carbs - 370) < 0.001);
});
