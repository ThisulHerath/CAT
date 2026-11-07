import { soundProfile } from './feedback.js';

// Render once per tier, then reuse an AudioBuffer. The smallest merge is a
// smooth sine pop; larger merges add a faster strike, grit, and a bass tail.
export function synthesizeMerge(level, sampleRate = 44100) {
  const profile = soundProfile(level);
  const { frequency, duration, hardness, attack, drive, transient, subWeight } = profile;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let phase = 0, previousNoise = 0, seed = 7919 + level, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const pitch = frequency * (.9 - hardness * .3 + (.2 + hardness * 1.25) * Math.exp(-t / .026));
    phase += 2 * Math.PI * pitch / sampleRate;
    const fundamental = Math.sin(phase);
    const grit = hardness * .2 * (Math.sin(phase * 2) + .5 * Math.sin(phase * 3));
    const body = hardness === 0 ? fundamental : Math.tanh((fundamental + grit) * drive) / Math.tanh(drive);
    const envelope = (1 - Math.exp(-t / attack)) * Math.exp(-t / (.055 + hardness * .045));
    const sub = Math.sin(phase * .5) * subWeight * (1 - Math.exp(-t / .006)) * Math.exp(-t / .14);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const strike = (noise - previousNoise) * .5 * transient * (1 - Math.exp(-t / .0007)) * Math.exp(-t / (.009 + hardness * .025));
    previousNoise = noise;
    const fade = Math.min(1, (duration - t) / .025);
    const value = (body * envelope + sub + strike) * fade;
    samples[i] = value; peak = Math.max(peak, Math.abs(value));
  }
  const gain = (.4 + hardness * .34) / Math.max(peak, .001);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}
