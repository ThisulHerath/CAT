import './style.css';
import Matter from 'matter-js';
import { CATS, DROP_INTERVAL, MAX_CATS, OVERFLOW_TIME, clamp, canMerge, chooseNext, readSaved } from './rules.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: true });
const engine = Engine.create({ enableSleeping: true, positionIterations: 7, velocityIterations: 5 });
engine.gravity.y = 1.05;
const WIDTH = 600, HEIGHT = 680, CX = 300, CY = 395, RADIUS = 255;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let saved;
try { saved = readSaved(localStorage); } catch { saved = { best: 0, muted: false }; }
let { best, muted } = saved;
let mode = 'ready', score = 0, next = 0, aim = 300, lastDrop = -Infinity;
let cats = new Map(), mergeQueue = [], particles = [], effects = [], unlocked = new Set([0]);
let overflow = 0, held = false, holdSince = 0, lastTime = 0, accumulator = 0, renderWidth = 0;
let musicFailed = false, audioContext, soundAttempt = 0;
const soundtrack = new Audio('/assets/soundtrack.mp3');
soundtrack.loop = true;
soundtrack.volume = 0.48;
soundtrack.preload = 'none';
const images = CATS.map(cat => { const image = new Image(); image.src = `/assets/${cat.key}.webp`; return image; });
const icons = {
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
$('restart-button').innerHTML = svg('restart');
$('pause-button').innerHTML = svg('pause');
$('evolution-list').innerHTML = CATS.map((cat, index) => `<div class="evolution-item ${index === 0 ? 'unlocked' : ''}" data-level="${index}"><span class="evolution-icon"><img src="/assets/${cat.key}.webp" alt="" /></span><strong>${cat.name}</strong><span>${String(index + 1).padStart(2, '0')}</span></div>`).join('');

function persist(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Game works with storage disabled. */ } }
function updateSoundButton() {
  $('sound-button').innerHTML = svg(muted ? 'muted' : 'sound');
  $('sound-button').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
  $('sound-button').setAttribute('aria-pressed', String(!muted));
  document.body.classList.toggle('music-playing', !muted && mode === 'playing' && !musicFailed);
}
function syncSound() {
  const attempt = ++soundAttempt;
  if (muted || mode !== 'playing') soundtrack.pause();
  else soundtrack.play().then(() => {
    if (attempt !== soundAttempt) return;
    if (musicFailed) $('game-status').textContent = 'Click or tap to drop. Hold for cat rain.';
    musicFailed = false; updateSoundButton();
  }).catch(() => {
    if (attempt !== soundAttempt || muted || mode !== 'playing') return;
    musicFailed = true;
    $('game-status').textContent = 'Tap sound to enable the soundtrack.';
    updateSoundButton();
  });
  updateSoundButton();
}
function toggleSound() {
  muted = !muted;
  persist('cat-cascade-muted', muted);
  syncSound();
}
function mergeSound(level) {
  if (muted || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(220 + level * 65, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(600 + level * 85, audioContext.currentTime + .08);
  gain.gain.setValueAtTime(.055, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .14);
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + .15);
}

// The collision shell is made once. Its gap and neck match the reference bowl.
const walls = [];
const START = -78 * Math.PI / 180, END = 258 * Math.PI / 180, SEGMENTS = 84;
for (let i = 0; i < SEGMENTS; i++) {
  const a = START + (END - START) * i / SEGMENTS;
  const b = START + (END - START) * (i + 1) / SEGMENTS;
  const x1 = CX + Math.cos(a) * RADIUS, y1 = CY + Math.sin(a) * RADIUS;
  const x2 = CX + Math.cos(b) * RADIUS, y2 = CY + Math.sin(b) * RADIUS;
  walls.push(Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) + 3, 13, { isStatic: true, angle: Math.atan2(y2 - y1, x2 - x1), friction: .15, label: 'bowl' }));
}
walls.push(Bodies.rectangle(247, 77, 12, 145, { isStatic: true }), Bodies.rectangle(353, 77, 12, 145, { isStatic: true }));
Composite.add(engine.world, walls);

function addCat(level, x, y, velocity = null) {
  const cat = CATS[level];
  const body = Bodies.circle(x, y, cat.radius, { restitution: .22, friction: .22, frictionStatic: .45, frictionAir: .005, density: .0016, sleepThreshold: 100 });
  body.catLevel = level;
  body.bornAt = performance.now();
  Body.setAngle(body, (Math.random() - .5) * .4);
  if (velocity) Body.setVelocity(body, velocity);
  cats.set(body.id, body); Composite.add(engine.world, body);
  return body;
}
function clearCats() {
  for (const cat of cats.values()) Composite.remove(engine.world, cat);
  cats.clear(); mergeQueue = []; particles = []; effects = [];
  Engine.clear(engine);
}
function updateScore() {
  $('score').textContent = String(score).padStart(4, '0');
  if (score > best) { best = score; persist('cat-cascade-best', best); }
  $('best').textContent = String(best).padStart(4, '0');
}
function updateNext() {
  $('next-image').src = images[next].src;
  $('next-image').alt = `Next cat: ${CATS[next].name}`;
  $('next-name').textContent = CATS[next].name;
  $('next-level').textContent = `LEVEL ${String(next + 1).padStart(2, '0')}`;
}
function updateCollection(level) {
  if (unlocked.has(level)) return;
  unlocked.add(level);
  document.querySelector(`[data-level="${level}"]`).classList.add('unlocked');
  $('announcement').textContent = `${CATS[level].name} unlocked!`;
  $('game-status').textContent = `${CATS[level].name} just entered the chat.`;
  if (level >= 3) {
    $('merge-callout').textContent = level === 6 ? 'ABSOLUTE UNIT ✦' : `${CATS[level].name.toUpperCase()}!`;
    $('merge-callout').classList.remove('pop');
    void $('merge-callout').offsetWidth;
    $('merge-callout').classList.add('pop');
  }
}
function updateCount() { $('cat-count').textContent = `${cats.size} ${cats.size === 1 ? 'cat' : 'cats'} in the bowl`; }

function startGame() {
  clearCats(); mode = 'playing'; score = 0; overflow = 0; lastDrop = -Infinity; held = false; aim = 300;
  unlocked = new Set([0]);
  document.querySelectorAll('.evolution-item').forEach((element, i) => element.classList.toggle('unlocked', i === 0));
  next = chooseNext(); updateNext(); updateScore(); updateCount();
  $('overlay').classList.add('hidden');
  $('pause-button').disabled = false;
  $('pause-button').innerHTML = svg('pause');
  $('pause-button').setAttribute('aria-label', 'Pause game');
  $('game-status').textContent = 'Click or tap to drop. Hold for cat rain.';
  soundtrack.currentTime = 0;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(() => {}); } catch { /* Soundtrack still works without synthesized effects. */ }
  syncSound(); canvas.focus({ preventScroll: true });
  lastTime = performance.now(); accumulator = 0;
}
function showOverlay(title, copy, button, kicker) {
  $('overlay-title').textContent = title;
  $('overlay-copy').textContent = copy;
  $('start-label').textContent = button;
  $('overlay-kicker').textContent = kicker;
  $('start-hint').textContent = mode === 'paused' ? 'Take your time. The cats can wait.' : `Personal best: ${best.toLocaleString()} points`;
  $('overlay').classList.remove('hidden');
}
function pauseGame() {
  if (mode !== 'playing' && mode !== 'paused') return;
  held = false;
  if (mode === 'playing') {
    mode = 'paused'; showOverlay('A little cat nap.', 'Your chaos is right where you left it.', 'Keep playing', 'PAWS FOR A MOMENT');
    $('pause-button').innerHTML = svg('play'); $('pause-button').setAttribute('aria-label', 'Resume game');
  } else {
    mode = 'playing'; $('overlay').classList.add('hidden');
    $('pause-button').innerHTML = svg('pause'); $('pause-button').setAttribute('aria-label', 'Pause game');
    lastTime = performance.now(); accumulator = 0; canvas.focus({ preventScroll: true });
  }
  syncSound();
}
function gameOver() {
  mode = 'over'; held = false;
  updateScore();
  showOverlay('Too much cat energy.', `You collected ${score.toLocaleString()} points. Room for one more try?`, 'One more round', 'THE BOWL HAS SPOKEN');
  $('pause-button').disabled = true;
  $('game-status').textContent = 'Full bowl. Full heart.';
  $('announcement').textContent = `Game over. Final score ${score}.`;
  syncSound();
}
function dropCat() {
  const now = performance.now();
  if (mode !== 'playing' || now - lastDrop < DROP_INTERVAL) return;
  if (cats.size >= MAX_CATS) { gameOver(); return; }
  const x = 300 + (aim - 300) * .11;
  // Prevent spawning inside a cat that has not yet cleared the neck.
  if ([...cats.values()].some(body => Math.hypot(body.position.x - x, body.position.y - 62) < body.circleRadius + CATS[next].radius + 2)) return;
  addCat(next, x, 62, { x: (aim - 300) / 48, y: .5 });
  updateCollection(next);
  next = chooseNext(); updateNext(); updateCount(); lastDrop = now;
}

Events.on(engine, 'collisionStart', ({ pairs }) => {
  for (const { bodyA, bodyB } of pairs) if (canMerge(bodyA, bodyB)) mergeQueue.push([bodyA.id, bodyB.id]);
});
function resolveMerges() {
  const pending = mergeQueue; mergeQueue = [];
  for (const [idA, idB] of pending) {
    const a = cats.get(idA), b = cats.get(idB);
    if (!a || !b || !canMerge(a, b)) continue;
    const level = a.catLevel + 1;
    const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
    const velocity = { x: clamp((a.velocity.x + b.velocity.x) / 2, -4, 4), y: -1.6 };
    a.removed = true; b.removed = true;
    Composite.remove(engine.world, [a, b]); cats.delete(idA); cats.delete(idB);
    // Keep a newly enlarged body within the inner wall instead of embedding it.
    const distance = Math.hypot(x - CX, y - CY), limit = RADIUS - CATS[level].radius - 9;
    const factor = distance > limit ? limit / distance : 1;
    addCat(level, CX + (x - CX) * factor, CY + (y - CY) * factor, velocity);
    if (mode === 'playing') {
      score += CATS[level].points; updateScore(); updateCollection(level); mergeSound(level);
      effects.push({ x, y, text: `+${CATS[level].points}`, life: 1, color: CATS[level].color });
      if (!reducedMotion) for (let i = 0; i < 10 && particles.length < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({ x, y, vx: Math.cos(angle) * (1 + Math.random() * 3), vy: Math.sin(angle) * 3, life: 1, color: CATS[level].color });
      }
      updateCount();
    }
  }
}

function drawCat(body, alpha = 1) {
  const level = body.catLevel, { radius, color } = CATS[level];
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle); ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(0, 0, radius * .2, 0, 0, radius);
  glow.addColorStop(0, color + '19'); glow.addColorStop(1, color + '03');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color + '33'; ctx.lineWidth = 1; ctx.stroke();
  const image = images[level];
  if (image.complete && image.naturalWidth) {
    const scale = radius * 1.78 / Math.max(image.naturalWidth, image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}
function drawBowl(time) {
  const hue = reducedMotion ? 70 : (time / 70) % 360;
  const rainbow = ctx.createConicGradient(hue * Math.PI / 180, CX, CY);
  for (let i = 0; i <= 6; i++) rainbow.addColorStop(i / 6, `hsl(${i * 60 + 70} 80% 74%)`);
  ctx.save();
  ctx.beginPath(); ctx.arc(CX, CY, RADIUS, START, END);
  ctx.strokeStyle = rainbow; ctx.lineWidth = 2.5; ctx.shadowBlur = reducedMotion ? 0 : 12; ctx.shadowColor = '#b0f79b'; ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = '#dae7d7';
  ctx.beginPath(); ctx.moveTo(247, 14); ctx.lineTo(247, 146); ctx.moveTo(353, 14); ctx.lineTo(353, 146); ctx.stroke();
  ctx.strokeStyle = '#333a36'; ctx.setLineDash([3, 6]);
  ctx.beginPath(); ctx.moveTo(260, 162); ctx.lineTo(340, 162); ctx.stroke(); ctx.setLineDash([]);
  if (overflow > 200) {
    ctx.fillStyle = `rgba(255,120,110,${.15 + overflow / OVERFLOW_TIME * .45})`;
    ctx.fillRect(254, 154, 92, 4);
    ctx.fillStyle = '#ffa49a'; ctx.font = '11px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TOO MUCH CAT!', CX, 194);
  }
  if (mode === 'playing') {
    const previewX = 300 + (aim - 300) * .11;
    ctx.save(); ctx.globalAlpha = .25; ctx.setLineDash([3, 7]); ctx.strokeStyle = '#d4fb70'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(previewX, 90); ctx.quadraticCurveTo(300 + (aim - 300) * .3, 195, aim, 330); ctx.stroke(); ctx.restore();
    drawCat({ catLevel: next, position: { x: previewX, y: 62 }, angle: 0 }, .65);
    ctx.fillStyle = '#727b78'; ctx.font = '8px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DROP HERE', CX, 28);
  }
  ctx.restore();
}
function render(time, dt) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#768576'; ctx.globalAlpha = .17;
  for (let x = 60; x < WIDTH; x += 30) for (let y = 175; y < 650; y += 30) {
    if (Math.hypot(x - CX, y - CY) < RADIUS - 14) ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
  drawBowl(time);
  for (const cat of cats.values()) drawCat(cat, mode === 'ready' ? .7 : 1);
  for (const p of particles) {
    if (mode === 'playing') { p.life -= dt / 520; p.x += p.vx * dt / 16.67; p.y += p.vy * dt / 16.67; p.vy += .07; }
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3);
  }
  particles = particles.filter(p => p.life > 0);
  for (const effect of effects) {
    if (mode === 'playing') { effect.life -= dt / 850; effect.y -= dt * .035; }
    ctx.globalAlpha = Math.max(0, effect.life); ctx.fillStyle = effect.color;
    ctx.font = '600 19px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(effect.text, effect.x, effect.y);
  }
  effects = effects.filter(e => e.life > 0); ctx.globalAlpha = 1;
}
function frame(time) {
  const dt = Math.min(time - lastTime || 16.67, 50); lastTime = time;
  if (mode === 'playing') {
    accumulator += dt;
    while (accumulator >= 1000 / 60) {
      Engine.update(engine, 1000 / 60); resolveMerges(); accumulator -= 1000 / 60;
    }
    if (held && time - holdSince > 300) dropCat();
    let crowded = cats.size >= MAX_CATS;
    for (const cat of cats.values()) {
      if (time - cat.bornAt > 1800 && cat.position.y - cat.circleRadius < 159 && cat.speed < 1.5) crowded = true;
      // Recover any body displaced through the segmented shell by a large merge.
      if (cat.position.y > HEIGHT + 50 || cat.position.x < -60 || cat.position.x > WIDTH + 60) {
        Body.setPosition(cat, { x: CX, y: CY - 100 }); Body.setVelocity(cat, { x: 0, y: 0 });
      }
    }
    overflow = crowded ? overflow + dt : Math.max(0, overflow - dt * 2);
    if (overflow > OVERFLOW_TIME) gameOver();
  }
  render(time, dt);
  requestAnimationFrame(frame);
}
function resize() {
  const width = canvas.getBoundingClientRect().width;
  if (!width || renderWidth === width) return;
  renderWidth = width;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(width * HEIGHT / WIDTH * dpr);
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
}
new ResizeObserver(resize).observe(canvas);
function pointerAim(event) {
  const rect = canvas.getBoundingClientRect();
  aim = clamp((event.clientX - rect.left) / rect.width * WIDTH, 88, 512);
}
canvas.addEventListener('pointermove', pointerAim);
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || event.button > 0) return;
  event.preventDefault(); pointerAim(event); held = true; holdSince = performance.now();
  canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); dropCat();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, () => { held = false; });
$('start-button').addEventListener('click', () => mode === 'paused' ? pauseGame() : startGame());
$('pause-button').addEventListener('click', pauseGame);
$('restart-button').addEventListener('click', startGame);
$('sound-button').addEventListener('click', toggleSound);
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) pauseGame();
  if (mode !== 'playing') return;
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'ArrowLeft') aim = clamp(aim - 30, 88, 512);
  if (event.code === 'ArrowRight') aim = clamp(aim + 30, 88, 512);
  if (event.code === 'Space') dropCat();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseGame(); });
window.addEventListener('blur', () => { held = false; });

// An intentionally still attract screen: no physics work before the first play.
addCat(5, 189, 553); Body.setAngle([...cats.values()].at(-1), -.3);
addCat(4, 322, 582); addCat(3, 421, 558); addCat(1, 115, 476); addCat(2, 392, 463);
updateScore(); updateNext(); updateSoundButton(); resize(); requestAnimationFrame(frame);
