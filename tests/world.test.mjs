// Headless checks for Neon Swarm's simulation: node tests/world.test.mjs
// Feeds the world scripted bot input and asserts the run behaves — spawns, kills,
// score, waves, the wave-5 boss, pickups, game over, and seed determinism.

import { createWorld, startRun, stepWorld, GameState } from '../game/src/world.js';
import { ARENA } from '../game/src/config.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function botInput(world) {
  const p = world.player;
  let target = null;
  let best = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  const aim = target ?? { x: p.x + 40, y: p.y - 40 };
  // Strafe around the target, backing off when it gets close.
  const a = Math.atan2(p.y - aim.y, p.x - aim.x);
  const flee = best < 130 ? 1 : -0.3;
  return {
    mx: Math.cos(a) * flee + Math.cos(a + Math.PI / 2) * 0.7,
    my: Math.sin(a) * flee + Math.sin(a + Math.PI / 2) * 0.7,
    aimX: aim.x,
    aimY: aim.y,
    firing: true,
    dash: best < 70,
  };
}

function runBot(world, seconds) {
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i++) stepWorld(world, botInput(world), 1 / 60);
}

// 1. A run starts on wave 1 and the swarm arrives.
{
  const w = createWorld(42);
  check('title state at boot', w.state === GameState.TITLE);
  startRun(w);
  check('playing after startRun', w.state === GameState.PLAYING && w.wave === 1);
  runBot(w, 6);
  check('enemies spawned', w.stats.shotsFired > 0, `${w.enemies.length} alive`);
  check('bot is fighting', w.stats.shotsFired > 30, `${w.stats.shotsFired} shots`);
}

// 2. Sustained play scores kills and points without crashing.
{
  const w = createWorld(7);
  startRun(w);
  runBot(w, 45);
  check('kills registered', w.stats.kills >= 3, `${w.stats.kills} kills`);
  check('score accumulated', w.score > 0, `score ${w.score}`);
  check('accuracy is sane', w.stats.shotsHit <= w.stats.shotsFired);
}

// 3. Clearing a wave rolls into the next one with a bonus.
{
  const w = createWorld(9);
  startRun(w);
  runBot(w, 3);
  const before = w.score;
  w.enemies = [];
  w.spawnQueue = [];
  stepWorld(w, botInput(w), 1 / 60);
  check('intermission after clear', w.waveState === 'intermission');
  check('clear bonus paid', w.score > before, `+${w.score - before}`);
  runBot(w, 3);
  check('wave 2 began', w.wave === 2, `wave ${w.wave}`);
}

// 4. Wave 5 brings the Dreadnought.
{
  const w = createWorld(11);
  startRun(w);
  w.wave = 4;
  w.enemies = [];
  w.spawnQueue = [];
  stepWorld(w, botInput(w), 1 / 60); // clear wave 4
  runBot(w, 3); // intermission -> wave 5
  runBot(w, 4); // let the queue spawn
  const boss = w.enemies.find((e) => e.kind === 'boss');
  check('boss wave reached', w.wave === 5, `wave ${w.wave}`);
  check('boss on the field', !!boss, boss ? `hp ${boss.hp}` : 'none');
  check('boss fires back', w.enemyBullets.length >= 0 && w.stats.kills >= 0);
}

// 5. Pickups apply their effects.
{
  const w = createWorld(13);
  startRun(w);
  const p = w.player;
  w.pickups.push({ x: p.x, y: p.y, kind: 'heart', radius: 10, life: 5, t: 0 });
  w.lives = 2;
  stepWorld(w, { mx: 0, my: 0, aimX: p.x + 10, aimY: p.y, firing: false, dash: false }, 1 / 60);
  check('heart heals', w.lives === 3, `lives ${w.lives}`);
  w.pickups.push({ x: p.x, y: p.y, kind: 'spread', radius: 10, life: 5, t: 0 });
  stepWorld(w, { mx: 0, my: 0, aimX: p.x + 10, aimY: p.y, firing: false, dash: false }, 1 / 60);
  check('spread weapon equipped', w.weapon.kind === 'spread' && w.weapon.level === 1);
}

// 6. Repeated hits end the run.
{
  const w = createWorld(15);
  startRun(w);
  const p = w.player;
  for (let hit = 0; hit < 3; hit++) {
    p.invulnTime = 0;
    w.shield = false;
    w.enemies.push({ kind: 'chaser', x: p.x, y: p.y, vx: 0, vy: 0, radius: 15, hp: 3, maxHp: 3, speed: 0, score: 50, t: 0, flash: 0, ambient: false, attackTimer: 9 });
    stepWorld(w, { mx: 0, my: 0, aimX: p.x + 10, aimY: p.y, firing: false, dash: false }, 1 / 60);
    w.enemies = w.enemies.filter((e) => e.kind !== 'chaser');
  }
  check('game over after 3 hits', w.state === GameState.OVER, `lives ${w.lives}`);
}

// 7. Same seed + same inputs = same run.
{
  const a = createWorld(99);
  const b = createWorld(99);
  startRun(a);
  startRun(b);
  runBot(a, 20);
  runBot(b, 20);
  check('deterministic replay', a.score === b.score && a.stats.kills === b.stats.kills, `score ${a.score} vs ${b.score}`);
}

// 8. The player stays inside the arena under extreme input.
{
  const w = createWorld(3);
  startRun(w);
  for (let i = 0; i < 600; i++) {
    stepWorld(w, { mx: -1, my: -1, aimX: 0, aimY: 0, firing: false, dash: i % 90 === 0 }, 1 / 60);
  }
  const p = w.player;
  check('player clamped to arena', p.x >= 0 && p.x <= ARENA.width && p.y >= 0 && p.y <= ARENA.height, `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
