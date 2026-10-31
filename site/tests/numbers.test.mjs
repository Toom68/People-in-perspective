import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, formatCount, formatZoom, meetingTime } from '../dist/numbers.js';

test('normalizes user counts, separators, people suffix and exact abbreviations', () => {
  for (const [input, expected] of [['0',0],['1 person',1],['100,000 people',100000],['1_000',1000],['100k',100000],['1.5 million',1500000],['8 billion',8000000000],['9,007,199,254,740,991',Number.MAX_SAFE_INTEGER],['0.000001m',1],['1.00',1]]) assert.equal(parseCount(input), expected, input);
});
test('rejects fractions of people and counts that cannot be represented exactly', () => {
  for (const input of ['', '-1','1.5','NaN','Infinity','people','9,007,199,254,740,992','0.1k people people']) assert.throws(() => parseCount(input), undefined, input);
});
test('large-number formatting and meeting-time arithmetic remain exact', () => {
  assert.equal(formatCount(100000), '100,000');
  assert.equal(meetingTime(1), '1 second');
  assert.equal(meetingTime(1000), '16 minutes, 40 seconds');
  assert.equal(meetingTime(100000), '1 day, 3 hours');
  assert.equal(meetingTime(0), 'no time at all');
  assert.match(meetingTime(Number.MAX_SAFE_INTEGER), /^285,616,414 years/);
});

test('zoom readouts fit narrow screens even for quadrillion-person crowds', () => {
  assert.equal(formatZoom(1), '100%');
  assert.equal(formatZoom(1.6), '160%');
  assert.equal(formatZoom(1000), '100K%');
  assert.ok(formatZoom(3000000000).length <= 7);
});
