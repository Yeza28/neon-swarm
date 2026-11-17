// Neon Swarm — staged scenes for the entry's screenshots. Loading the game with
// ?shot=start|play|boss|end&seed=N builds one deterministic scene with the same
// simulation the real game runs: a scripted bot plays the run, then the frame is
// frozen for the screenshot. shots.json names the four scenes and their files.

import { createWorld, startRun, stepWorld, addScoreText, GameState } from './world.js';
import { ARENA, PLAYER } from './config.js';

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
    // Boss-wave moments are the boss scene's job, never this one's: a ring
    // burst would win the density score and steal the Dreadnought's shot.
    if (step % 20 === 0 && !probe.enemies.some((e) => e.kind === 'boss')) {
      const kinds = new Set(probe.enemies.map((e) => e.kind)).size;
      const density =
        probe.enemies.length * 3 +
        probe.bullets.length +
        probe.enemyBullets.length * 2 +
        Math.min(24, probe.particles.length) / 2 +
        kinds * 4;
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

// The foe stats the staged scenes place by hand, mirroring world.js's own
// table, so a hand-placed foe is exactly the foe the simulation would spawn.
const STAGED_STATS = {
  chaser: { hp: 3, speed: 118, radius: 15, score: 50 },
  weaver: { hp: 2, speed: 148, radius: 13, score: 70 },
  splitter: { hp: 5, speed: 82, radius: 19, score: 90 },
  mini: { hp: 1, speed: 168, radius: 9, score: 25 },
  stinger: { hp: 1, speed: 205, radius: 10, score: 40 },
};

function clampToArena(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function stagedFoe(world, kind, x, y, vx, vy) {
  const st = STAGED_STATS[kind];
  return {
    kind,
    x,
    y,
    vx,
    vy,
    radius: st.radius,
    hp: st.hp,
    maxHp: st.hp,
    speed: st.speed,
    score: st.score,
    t: world.rng.range(0, Math.PI * 2),
    flash: 0,
    ambient: false,
    attackTimer: 1.5,
  };
}

// Press extra foes in around the player until the frame holds targetCount of
// them: mixed kinds on a ring, far enough to read as a swarm closing in,
// never stacked on another foe or on the ship.
function stageReinforcements(world, targetCount) {
  const p = world.player;
  const kinds = ['weaver', 'splitter', 'stinger', 'chaser', 'mini', 'weaver', 'stinger', 'splitter'];
  let placed = 0;
  let guard = 0;
  while (world.enemies.length < targetCount && guard < 48) {
    guard += 1;
    const kind = kinds[placed % kinds.length];
    const st = STAGED_STATS[kind];
    const ang = (placed / targetCount) * Math.PI * 2 + world.rng.range(-0.3, 0.3);
    const ring = world.rng.range(200, 330);
    placed += 1;
    const x = clampToArena(p.x + Math.cos(ang) * ring, ARENA.wall + st.radius + 6, ARENA.width - ARENA.wall - st.radius - 6);
    const y = clampToArena(p.y + Math.sin(ang) * ring, ARENA.wall + st.radius + 6, ARENA.height - ARENA.wall - st.radius - 6);
    if (Math.hypot(x - p.x, y - p.y) < 130) continue;
    if (world.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 74)) continue;
    const toward = Math.atan2(p.y - y, p.x - x);
    world.enemies.push(stagedFoe(world, kind, x, y, Math.cos(toward) * st.speed * 0.6, Math.sin(toward) * st.speed * 0.6));
  }
}

// Top the boss's escorts up to three, placed around the hull the way its own
// summon move releases them.
function stageEscorts(world, boss) {
  const kinds = ['mini', 'stinger', 'mini'];
  const spots = [
    { dx: 96, dy: -52 },
    { dx: -88, dy: 62 },
    { dx: 24, dy: 104 },
  ];
  let have = world.enemies.filter((e) => e.kind !== 'boss').length;
  for (let i = 0; have < 3 && i < spots.length; i++, have++) {
    const st = STAGED_STATS[kinds[i % kinds.length]];
    const x = clampToArena(boss.x + spots[i].dx, ARENA.wall + st.radius + 4, ARENA.width - ARENA.wall - st.radius - 4);
    const y = clampToArena(boss.y + spots[i].dy, ARENA.wall + st.radius + 4, ARENA.height - ARENA.wall - st.radius - 4);
    world.enemies.push(stagedFoe(world, kinds[i % kinds.length], x, y, 0, 0));
  }
}

// A stream of the player's own shots already on their way to the target, laid
// along the line the ship is aiming down.
function stageBulletStream(world, target) {
  const p = world.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  const ux = dx / d;
  const uy = dy / d;
  for (const f of [0.3, 0.48, 0.66, 0.84]) {
    world.bullets.push({
      x: p.x + dx * f,
      y: p.y + dy * f,
      vx: ux * PLAYER.bulletSpeed,
      vy: uy * PLAYER.bulletSpeed,
      life: PLAYER.bulletLife,
      radius: 3.4,
    });
  }
}

function stagePlay(seed) {
  const world = busiestMoment(seed, 40) ?? busiestMoment(seed + 1000, 40);
  if (!world || world.state !== GameState.PLAYING) return stagePlay(seed + 31);
  // The frame should read as a rampage in full swing: a levelled spread cannon
  // in hand and the swarm pressed in from every side.
  world.weapon = { kind: 'spread', level: 2, timeLeft: 12 };
  stageReinforcements(world, 9);
  // Let the simulation itself fire the spread fan and carry the new foes a few
  // steps in, so every tracer and drift in the frozen frame is the game's own.
  for (let i = 0; i < 9; i++) stepWorld(world, botInput(world), 1 / 60);
  if (world.state !== GameState.PLAYING) return stagePlay(seed + 31);
  // Dress the frame: foes blowing up near the action, floating scores, a live
  // ×4 combo, the shield ring up, and a power-up waiting on the field.
  const p = world.player;
  const byRange = world.enemies
    .filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 340)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const foe = byRange[0] ?? world.enemies[0];
  if (foe) {
    stageExplosion(world, foe.x, foe.y, '#ffb84d');
    addScoreText(world, foe.x, foe.y - 22, '+140', '#dfe9ff', 15);
  }
  const second = byRange[1];
  if (second) addScoreText(world, second.x, second.y - 20, '+70', '#dfe9ff', 13);
  world.combo = Math.max(world.combo, 22);
  world.comboTimer = 2.2;
  world.mult = Math.max(world.mult, 4);
  world.shield = true;
  world.pickups.push({
    x: clampToArena(p.x + 96, ARENA.wall + 16, ARENA.width - ARENA.wall - 16),
    y: clampToArena(p.y - 56, ARENA.wall + 16, ARENA.height - ARENA.wall - 16),
    kind: 'rapid',
    radius: 10,
    life: 9,
    t: 1,
  });
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
  // Frame the duel mid-arena, every time: the boss whole in the upper right,
  // the ship below-left facing it, and the fight already joined — the hull
  // worn to just over half, escorts out, and a stream of the ship's shots
  // already on their way.
  boss.x = 618;
  boss.y = 268;
  boss.hp = Math.round(boss.maxHp * 0.55);
  world.player.x = 356;
  world.player.y = 392;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.aimAngle = Math.atan2(boss.y - world.player.y, boss.x - world.player.x);
  stageEscorts(world, boss);
  stageBulletStream(world, boss);
  // Freeze mid-burst: trigger one more ring around the framed boss and give
  // it a few steps to expand into the air, then let the boss's hit-flash
  // settle so its red hull reads in the shot.
  boss.attackTimer = 0;
  for (let i = 0; i < 7; i++) stepWorld(world, botInput(world), 1 / 60);
  boss.flash = 0.1;
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
