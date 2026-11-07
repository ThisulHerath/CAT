import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionRewards, impactSpeed, soundProfile } from '../src/feedback.js';

const cat = (id, catLevel = 0, x = 0, vx = 4) => ({ id, catLevel, position: { x, y: 0 }, velocity: { x: vx, y: 0 } });

test('merge sounds progress from soft attacks to harder, grittier impacts', () => {
  assert.equal(soundProfile(1).hardness, 0);
  assert.equal(soundProfile(1).transient, 0);
  for (let level = 2; level < 7; level++) {
    const before = soundProfile(level - 1), after = soundProfile(level);
    assert.ok(after.frequency < before.frequency);
    assert.ok(after.duration > before.duration);
    assert.ok(after.subWeight > before.subWeight);
    assert.ok(after.attack < before.attack);
    assert.ok(after.drive > before.drive);
    assert.ok(after.transient > before.transient);
  }
});
test('only approaching impacts count, excluding sliding and separating cats', () => {
  const a = cat(1), b = cat(2, 1, 30, 0);
  assert.equal(impactSpeed(a, b), 4);
  a.velocity = { x: 0, y: 8 }; assert.equal(impactSpeed(a, b), 0);
  a.velocity.x = -4; assert.equal(impactSpeed(a, b), 0);
});
test('stronger impacts and larger cats earn more, with bounded rewards', () => {
  const a = cat(1), b = cat(2, 1, 30, 0);
  const small = new CollisionRewards().award(a, b, 0);
  a.catLevel = 4; b.catLevel = 5;
  const large = new CollisionRewards().award(a, b, 0);
  a.velocity.x = 500;
  const harder = new CollisionRewards().award(a, b, 0);
  assert.ok(large > small); assert.ok(harder > large); assert.ok(harder <= 17);
  assert.equal(new CollisionRewards().award(cat(3, 0, 0, .5), b, 0), 0);
  assert.equal(new CollisionRewards().award(a, { catLevel: undefined }, 0), 0);
});
test('pair and per-cat cooldowns prevent repeated contact scoring', () => {
  const rewards = new CollisionRewards(), a = cat(1), b = cat(2, 1, 30, 0), c = cat(3, 2, 30, 0);
  assert.ok(rewards.award(a, b, 0) > 0);
  assert.equal(rewards.award(b, a, 100), 0);
  assert.equal(rewards.award(a, c, 500), 0);
  assert.ok(rewards.award(a, c, 700) > 0);
  assert.equal(rewards.award(a, b, 2000), 0);
  assert.ok(rewards.award(a, b, 2400) > 0);
  rewards.forget(a.id); assert.equal(rewards.pairs.size, 0);
  rewards.clear(); assert.equal(rewards.cats.size, 0);
});
