import { CATS, clamp } from './rules.js';

export function soundProfile(level) {
  const tier = clamp(level, 0, CATS.length - 1);
  return {
    frequency: 320 * Math.pow(.77, tier),
    duration: .16 + tier * .055,
    subWeight: .08 + tier * .055,
    playbackRate: 1 - tier * .037,
    bassGain: tier * 1.35,
  };
}

// Only approaching motion counts: sliding sideways or separating is not a hit.
export function impactSpeed(a, b) {
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  return distance ? Math.max(0, ((a.velocity.x - b.velocity.x) * dx + (a.velocity.y - b.velocity.y) * dy) / distance) : 0;
}

export class CollisionRewards {
  constructor() { this.pairs = new Map(); this.cats = new Map(); }
  clear() { this.pairs.clear(); this.cats.clear(); }
  forget(id) {
    this.cats.delete(id);
    for (const [key, pair] of this.pairs) if (pair.ids.includes(id)) this.pairs.delete(key);
  }
  award(a, b, now) {
    if (a === b || a.catLevel == null || b.catLevel == null || a.removed || b.removed) return 0;
    const speed = impactSpeed(a, b);
    if (speed < 1.8) return 0;
    const key = [a.id, b.id].sort((x, y) => x - y).join(':');
    if (now - (this.pairs.get(key)?.time ?? -Infinity) < 2400) return 0;
    if ([a, b].some(cat => now - (this.cats.get(cat.id) ?? -Infinity) < 650)) return 0;
    this.pairs.set(key, { ids: [a.id, b.id], time: now });
    this.cats.set(a.id, now); this.cats.set(b.id, now);
    return 2 + Math.floor((a.catLevel + b.catLevel) / 2) * 2 + clamp(Math.floor(speed / 3), 0, 3);
  }
}
