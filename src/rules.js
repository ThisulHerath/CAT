export const CATS = [
  { key: 'tiny', name: 'Tiny menace', radius: 15, color: '#c8d4b0', points: 2 },
  { key: 'banana', name: 'Banana business', radius: 24, color: '#e5d06b', points: 6 },
  { key: 'smile', name: 'The smiler', radius: 34, color: '#c4f07d', points: 14 },
  { key: 'serious', name: 'Locked in', radius: 45, color: '#a4b1d7', points: 30 },
  { key: 'maxwell', name: 'Big Maxwell', radius: 57, color: '#e2bef2', points: 62 },
  { key: 'orange', name: 'Orange behavior', radius: 70, color: '#ffb36d', points: 126 },
  { key: 'chad', name: 'Absolute unit', radius: 86, color: '#d4fb70', points: 256 },
];

export const DROP_INTERVAL = 430;
export const MAX_CATS = 75;
export const OVERFLOW_TIME = 2400;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function canMerge(a, b) {
  return a !== b && a?.catLevel != null && a.catLevel === b?.catLevel && a.catLevel < CATS.length - 1 && !a.removed && !b.removed;
}
export function chooseNext(random = Math.random) {
  const value = random();
  return value < 0.63 ? 0 : value < 0.92 ? 1 : 2;
}
export function readSaved(storage) {
  try {
    return { best: Math.max(0, Number(storage.getItem('cat-cascade-best')) || 0), muted: storage.getItem('cat-cascade-muted') === 'true' };
  } catch { return { best: 0, muted: false }; }
}
