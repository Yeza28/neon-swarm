// Neon Swarm — staged scenes for the entry's screenshots. Loading the game with
// ?shot=start|play|boss|end&seed=N builds one deterministic scene with the same
// simulation the real game runs: a scripted bot plays the run, then the frame is
// frozen for the screenshot. shots.json names the four scenes and their files.

import { createWorld, startRun, stepWorld, addScoreText, GameState } from './world.js';

// A simple autopilot: keep range from the nearest foe, circle it, keep firing.
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
  const aim = target ?? { x: p.x + 60, y: p.y - 60 };
  const a = Math.atan2(p.y - aim.y, p.x - aim.x);
  const flee = best < 140 ? 1 : -0.25;
  return {
    mx: Math.cos(a) * flee + Math.cos(a + Math.PI / 2) * 0.8,
    my: Math.sin(a) * flee + Math.sin(a + Math.PI / 2) * 0.8,
    aimX: aim.x,
    aimY: aim.y,
    firing: true,
    dash: best < 64,
  };
}

function simBot(world, seconds) {
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i++) stepWorld(world, botInput(world), 1 / 60);
}

function simIdle(world, seconds) {
  const idle = { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, dash: false };
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i++) stepWorld(world, idle, 1 / 60);
}

export function stageShotScene(name, seed) {
  if (name === 'play') return stagePlay(seed);
  if (name === 'boss') return stageBoss(seed);
  if (name === 'end') return stageEnd(seed);
  // 'start' and anything unknown: the title screen over its ambient drift.
  const world = createWorld(seed);
  simIdle(world, 2.5);
  return world;
}

// Replay a run twice: the first pass finds the busiest on-screen moment, the
// second replays the same seed to exactly that step. The simulation is fully
// seeded, so the replay lands on the identical frame.
function busiestMoment(seed, seconds) {
  const probe = createWorld(seed);
  startRun(probe);
  let bestStep = 0;
  let bestScore = -1;
  let step = 0;
  const total = Math.floor(seconds * 60);
  while (step < total && probe.state === GameState.PLAYING) {
    stepWorld(probe, botInput(probe), 1 / 60);
    step += 1;
    if (step % 20 === 0) {
      const density =
        probe.enemies.length * 3 + probe.bullets.length + probe.enemyBullets.length * 2 + Math.min(24, probe.particles.length) / 2;
      if (density > bestScore) {
        bestScore = density;
        bestStep = step;
      }
    }
  }
  if (bestStep < 240) return null;
  const world = createWorld(seed);
  startRun(world);
  for (let i = 0; i < bestStep; i++) stepWorld(world, botInput(world), 1 / 60);
  return world;
}

// An explosion already mid-bloom, placed particle by particle so the frozen
// frame shows the ring rather than a single bright point.
function stageExplosion(world, x, y, color) {
  for (let i = 0; i < 34; i++) {
    const ang = (i / 34) * Math.PI * 2 + world.rng.range(-0.12, 0.12);
    const d = world.rng.range(8, 62);
    world.particles.push({
      x: x + Math.cos(ang) * d,
      y: y + Math.sin(ang) * d,
      vx: Math.cos(ang) * 130,
      vy: Math.sin(ang) * 130,
      life: world.rng.range(0.3, 0.75),
      maxLife: 0.75,
      color: i % 5 === 0 ? '#ffffff' : color,
      size: world.rng.range(2, 4.2),
    });
  }
}

function stagePlay(seed) {
  const world = busiestMoment(seed, 18) ?? busiestMoment(seed + 1000, 18);
  if (!world || world.state !== GameState.PLAYING) return stagePlay(seed + 31);
  // Dress the frame: a foe blowing up near the action, a floating score, a live
  // combo, the shield ring up, and a power-up waiting on the field.
  const p = world.player;
  const near = world.enemies
    .filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 340)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const foe = near ?? world.enemies[0];
  if (foe) {
    stageExplosion(world, foe.x, foe.y, '#ffb84d');
    addScoreText(world, foe.x, foe.y - 22, '+140', '#dfe9ff', 15);
  }
  world.combo = Math.max(world.combo, 12);
  world.comboTimer = 2.2;
  world.mult = Math.max(world.mult, 2);
  world.shield = true;
  world.pickups.push({ x: p.x + 96, y: p.y - 56, kind: 'spread', radius: 10, life: 9, t: 1 });
  world.banner = null;
  world.shake = 0;
  world.flash = 0;
  return world;
}

function stageBoss(seed) {
  const world = createWorld(seed);
  startRun(world);
  world.wave = 4;
  world.enemies = [];
  world.spawnQueue = [];
  stepWorld(world, botInput(world), 1 / 60); // closes wave 4, starts the intermission
  simBot(world, 2.6); // intermission runs out, wave 5 (the boss wave) begins
  for (let i = 0; i < 240 && !world.enemies.some((e) => e.kind === 'boss'); i++) {
    stepWorld(world, botInput(world), 1 / 60);
  }
  simBot(world, 6.5);
  const boss = world.enemies.find((e) => e.kind === 'boss');
  if (!boss || world.state !== GameState.PLAYING) return stageBoss(seed + 77);
  // Freeze mid-burst: trigger one more ring so the frame is full of danger,
  // then let the boss's hit-flash settle so its red hull reads in the shot.
  boss.attackTimer = 0;
  stepWorld(world, botInput(world), 1 / 60);
  stepWorld(world, botInput(world), 1 / 60);
  boss.flash = 0.1;
  // If the duel drifted into a corner, restage it mid-arena for the shot: the
  // boss framed whole, the ship facing it, its bullet ring still in the air.
  if (boss.x < 210 || boss.x > 750 || boss.y < 180 || boss.y > 470) {
    boss.x = 618;
    boss.y = 268;
    world.player.x = 356;
    world.player.y = 392;
    world.player.aimAngle = Math.atan2(boss.y - world.player.y, boss.x - world.player.x);
  }
  world.banner = null;
  world.shake = 0;
  world.flash = 0;
  return world;
}

function stageEnd(seed) {
  const world = createWorld(seed);
  startRun(world);
  for (let i = 0; i < 60 * 45 && world.state === GameState.PLAYING; i++) {
    stepWorld(world, botInput(world), 1 / 60);
  }
  if (world.state !== GameState.OVER) {
    // The bot survived its 45 seconds; finish the story the honest way — a foe
    // reaches the ship with the hull already spent.
    world.lives = 1;
    world.shield = false;
    world.player.invulnTime = 0;
    world.enemies.push({
      kind: 'chaser', x: world.player.x, y: world.player.y, vx: 0, vy: 0, radius: 15,
      hp: 3, maxHp: 3, speed: 0, score: 50, t: 0, flash: 0, ambient: false, attackTimer: 9,
    });
    stepWorld(world, { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, dash: false }, 1 / 60);
  }
  world.shake = 0;
  world.flash = 0;
  return world;
}
