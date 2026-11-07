import test from 'node:test';
import assert from 'node:assert/strict';
import { canMerge, chooseNext, readSaved, CATS } from '../src/rules.js';

test('only distinct, active matching cats can merge, below the final level', () => {
  const a = { catLevel: 1 }, b = { catLevel: 1 };
  assert.equal(canMerge(a, b), true);
  assert.equal(canMerge(a, a), false);
  assert.equal(canMerge(a, { catLevel: 2 }), false);
  assert.equal(canMerge(a, { isStatic: true }), false);
  assert.equal(canMerge(a, { catLevel: 1, removed: true }), false);
  assert.equal(canMerge({ catLevel: 6 }, { catLevel: 6 }), false);
  assert.equal(canMerge(undefined, b), false);
});
test('random drops stay in the first three tiers with the intended boundaries', () => {
  assert.equal(chooseNext(() => 0), 0);
  assert.equal(chooseNext(() => .629), 0);
  assert.equal(chooseNext(() => .63), 1);
  assert.equal(chooseNext(() => .92), 2);
  assert.equal(chooseNext(() => .999), 2);
});
test('blocked or invalid storage cannot prevent play', () => {
  assert.deepEqual(readSaved({ getItem() { throw new Error('blocked'); } }), { best: 0, muted: false });
  assert.deepEqual(readSaved({ getItem() { return 'corrupt'; } }), { best: 0, muted: false });
  assert.deepEqual(readSaved({ getItem(key) { return key.endsWith('best') ? '126' : 'true'; } }), { best: 126, muted: true });
});
test('each evolution grows and fits through neither floor nor itself', () => {
  for (let i = 1; i < CATS.length; i++) {
    assert.ok(CATS[i].radius > CATS[i - 1].radius);
    assert.ok(CATS[i].points > CATS[i - 1].points);
    assert.ok(CATS[i].radius < 255);
  }
});
