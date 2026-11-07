import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeMerge } from '../src/merge-audio.js';

test('every playable merge produces finite, unclipped audio with clean boundaries', () => {
  for (let level = 1; level <= 6; level++) {
    for (const rate of [44100, 48000]) {
      const samples = synthesizeMerge(level, rate);
      assert.ok(samples.length >= rate * .2);
      assert.equal(samples[0], 0);
      assert.ok(Math.abs(samples.at(-1)) < .001);
      let peak = 0;
      for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); }
      assert.ok(peak >= .39 && peak <= .75);
    }
  }
});

test('small merges stay smooth after a large merge has been rendered', () => {
  const small = synthesizeMerge(1);
  synthesizeMerge(6);
  assert.deepEqual(synthesizeMerge(1), small);
});
