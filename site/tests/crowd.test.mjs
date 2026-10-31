import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_WIDTH, CELL_HEIGHT, getLayout, personAt, validateCount } from '../dist/crowd.js';

const viewports = [[1200, 400], [320, 420], [1, 1], [100, 1], [1, 100]];
const counts = [0, 1, 2, 17, 999, 1000, 100000, 1000000000, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER];

test('every supported boundary count reconstructs exactly from full and partial rows', () => {
  for (const count of counts) for (const [width, height] of viewports) {
    const layout = getLayout(count, width, height);
    assert.equal(BigInt(layout.fullRows) * BigInt(layout.columns) + BigInt(layout.remainder), BigInt(count), `Exact count ${count} at ${width}×${height}`);
    assert.equal(layout.rows, layout.fullRows + (layout.remainder ? 1 : 0));
    assert.equal(layout.worldWidth, layout.columns * CELL_WIDTH);
    assert.equal(layout.worldHeight, layout.rows * CELL_HEIGHT);
    assert.ok(Number.isSafeInteger(layout.columns));
    assert.ok(Number.isSafeInteger(layout.rows));
    if (count) {
      assert.ok(layout.columns >= 1 && layout.columns <= count);
      assert.ok(layout.remainder >= 0 && layout.remainder < layout.columns);
      const lastIndex = BigInt(count) - 1n;
      assert.equal(personAt(layout, count, Number(lastIndex % BigInt(layout.columns)), Number(lastIndex / BigInt(layout.columns))), count);
      assert.equal(personAt(layout, count, 0, 0), 1);
    } else assert.deepEqual(layout, { columns: 0, rows: 0, fullRows: 0, remainder: 0, worldWidth: 0, worldHeight: 0 });
  }
});

test('no phantom people occupy the unfinished row', () => {
  for (const count of counts.filter(value => value > 0)) {
    const layout = getLayout(count, 1200, 400);
    if (layout.remainder) {
      assert.equal(personAt(layout, count, layout.remainder - 1, layout.fullRows), count);
      assert.equal(personAt(layout, count, layout.remainder, layout.fullRows), null);
    }
    assert.equal(personAt(layout, count, -1, 0), null);
    assert.equal(personAt(layout, count, layout.columns, 0), null);
    assert.equal(personAt(layout, count, 0, layout.rows), null);
    assert.equal(personAt(layout, count, 0.5, 0), null);
  }
});

test('100,000 people have exactly 100,000 individually addressable cells', () => {
  const count = 100000;
  const layout = getLayout(count, 1100, 400);
  let seen = 0;
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    const index = personAt(layout, count, column, row);
    if (index !== null) assert.equal(index, ++seen);
  }
  assert.equal(seen, count);
});

test('integer-boundary division remains exact near the safe integer limit', () => {
  for (let offset = 0; offset < 1000; offset++) {
    const count = Number.MAX_SAFE_INTEGER - offset;
    const layout = getLayout(count, 1120, 427);
    assert.equal(BigInt(layout.fullRows) * BigInt(layout.columns) + BigInt(layout.remainder), BigInt(count));
    const last = BigInt(count) - 1n;
    assert.equal(personAt(layout, count, Number(last % BigInt(layout.columns)), Number(last / BigInt(layout.columns))), count);
  }
});

test('invalid or inexact population values are rejected', () => {
  for (const count of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1000', 1n, null, undefined]) {
    assert.throws(() => validateCount(count), RangeError);
    assert.throws(() => getLayout(count, 100, 100), RangeError);
  }
});

test('invalid viewport dimensions are rejected', () => {
  for (const [width, height] of [[0, 1], [1, 0], [-1, 100], [100, -1], [Infinity, 10], [10, NaN]]) assert.throws(() => getLayout(10, width, height), RangeError);
});

test('layout storage stays constant for billion-person crowds', () => {
  const small = getLayout(10, 1200, 400);
  const huge = getLayout(1000000000, 1200, 400);
  assert.deepEqual(Object.keys(huge), Object.keys(small));
  assert.ok(Object.values(huge).every(value => typeof value === 'number'));
  assert.ok(huge.columns < 100000);
  assert.ok(huge.rows < 100000);
});
