// Neon Swarm — the whole game simulation. No DOM, no canvas: this module owns the
// player, the enemies, the boss, bullets, particles, pickups, waves, combo and
// score, and advances them one fixed step at a time. The browser shell feeds it
// input and draws what it holds; the headless tests feed it scripted input and
// check the state it reaches. Every random draw comes from the world's seeded
// generator, so a seed plus an input script always replays the same run.

import { ARENA, PLAYER, COMBO, WAVES, BOSS, PICKUP } from './config.js';
import { makeRng } from './random.js';

export const GameState = { TITLE: 'title', PLAYING: 'playing', OVER: 'over' };

const ENEMY_STATS = {
  chaser: { hp: 3, speed: 118, radius: 15, score: 50, cost: 2 },
  weaver: { hp: 2, speed: 148, radius: 13, score: 70, cost: 3 },
  splitter: { hp: 5, speed: 82, radius: 19, score: 90, cost: 4 },
  mini: { hp: 1, speed: 168, radius: 9, score: 25, cost: 0 },
  stinger: { hp: 1, speed: 205, radius: 10, score: 40, cost: 1 },
  boss: { hp: BOSS.baseHp, speed: 46, radius: BOSS.radius, score: 1500, cost: 0 },
};

export function createWorld(seed) {
  const world = {
    rng: makeRng(seed),
    state: GameState.TITLE,
    time: 0,
    wave: 0,
    waveState: 'idle', // idle | active | intermission
    interTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    mult: 1,
    lives: PLAYER.startLives,
    shield: false,
    weapon: { kind: 'pulse', level: 1, timeLeft: 0 },
    player: freshPlayer(),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    texts: [],
    pickups: [],
    shake: 0,
    flash: 0,
    fireCooldown: 0,
    events: [],
    stats: { kills: 0, shotsFired: 0, shotsHit: 0, bossesDown: 0 },
    banner: null, // { text, sub, timer } centre-screen announcements
  };
  seedAmbient(world);
  return world;
}

function freshPlayer() {
  return {
    x: ARENA.width / 2,
    y: ARENA.height / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    aimAngle: -Math.PI / 2,
    dashTime: 0,
    dashCooldown: 0,
    invulnTime: 0,
    thrust: 0, // 0..1 engine flare for the renderer
  };
}

export function startRun(world) {
  world.state = GameState.PLAYING;
  world.time = 0;
  world.score = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.mult = 1;
  world.lives = PLAYER.startLives;
  world.shield = false;
  world.weapon = { kind: 'pulse', level: 1, timeLeft: 0 };
  world.player = freshPlayer();
  world.bullets = [];
  world.enemyBullets = [];
  world.enemies = [];
  world.pickups = [];
  world.fireCooldown = 0;
  world.stats = { kills: 0, shotsFired: 0, shotsHit: 0, bossesDown: 0 };
  world.wave = 0;
  beginNextWave(world);
}

function seedAmbient(world) {
  // A few slow drifters behind the title screen, so the menu already feels alive.
  for (let i = 0; i < 7; i++) {
    const kind = world.rng.pick(['chaser', 'weaver', 'stinger', 'splitter']);
    const e = makeEnemy(world, kind, world.rng.range(60, ARENA.width - 60), world.rng.range(60, ARENA.height - 60));
    e.ambient = true;
    world.enemies.push(e);
  }
}

function makeEnemy(world, kind, x, y) {
  const base = ENEMY_STATS[kind];
  const hpScale = kind === 'boss' ? 1 : 1 + Math.max(0, world.wave - 4) * 0.06;
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: base.radius,
    hp: Math.round(base.hp * hpScale),
    maxHp: Math.round(base.hp * hpScale),
    speed: base.speed * (1 + world.wave * 0.018),
    score: base.score,
    t: world.rng.range(0, Math.PI * 2), // personal phase for wobble and drift
    flash: 0,
    ambient: false,
    attackTimer: world.rng.range(0.6, 1.6),
    spiralAngle: 0,
  };
}

function beginNextWave(world) {
  world.wave += 1;
  world.waveState = 'active';
  world.spawnTimer = 0.4;
  world.spawnQueue = buildWaveQueue(world);
  const isBoss = world.wave % BOSS.every === 0;
  world.banner = isBoss
    ? { text: `WAVE ${world.wave}`, sub: '⚠ DREADNOUGHT SIGNATURE DETECTED ⚠', timer: 2.2 }
    : { text: `WAVE ${world.wave}`, sub: waveTagline(world), timer: 1.6 };
  world.events.push(isBoss ? 'bosswarn' : 'wave');
}

function waveTagline(world) {
  const lines = [
    'the swarm stirs',
    'hold the line',
    'they keep coming',
    'stay bright, pilot',
    'no retreat',
    'the dark is hungry',
  ];
  return lines[(world.wave - 1) % lines.length];
}

function buildWaveQueue(world) {
  const queue = [];
  if (world.wave % BOSS.every === 0) {
    queue.push('boss');
    const escorts = 4 + world.wave;
    for (let i = 0; i < escorts; i++) queue.push(world.rng.pick(['stinger', 'chaser', 'mini']));
    return queue;
  }
  let budget = WAVES.baseBudget + (world.wave - 1) * WAVES.budgetPerWave;
  const kinds = ['stinger', 'chaser'];
  if (world.wave >= 2) kinds.push('weaver');
  if (world.wave >= 3) kinds.push('splitter');
  while (budget > 0) {
    const kind = world.rng.pick(kinds);
    queue.push(kind);
    budget -= ENEMY_STATS[kind].cost;
  }
  // Shuffle so each wave arrives in a different mix.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(world.rng.next() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function spawnPoint(world) {
  // An edge point at least 240px from the player, so nothing materialises on top of them.
  const p = world.player;
  for (let tries = 0; tries < 12; tries++) {
    const side = world.rng.int(0, 3);
    const x = side === 0 ? 34 : side === 1 ? ARENA.width - 34 : world.rng.range(34, ARENA.width - 34);
    const y = side === 2 ? 34 : side === 3 ? ARENA.height - 34 : world.rng.range(34, ARENA.height - 34);
    if (Math.hypot(x - p.x, y - p.y) > 240 || tries === 11) return { x, y };
  }
  return { x: 34, y: 34 };
}

function spawnFromQueue(world) {
  const group = Math.min(world.spawnQueue.length, world.rng.int(1, WAVES.spawnGroupMax));
  for (let i = 0; i < group; i++) {
    const kind = world.spawnQueue.shift();
    if (kind === 'boss') {
      spawnBoss(world);
    } else {
      const pt = spawnPoint(world);
      world.enemies.push(makeEnemy(world, kind, pt.x, pt.y));
      addParticles(world, pt.x, pt.y, '#8fa3cc', 5, 90, 0.3);
    }
  }
}

function spawnBoss(world) {
  const boss = makeEnemy(world, 'boss', ARENA.width / 2, 92);
  const number = Math.floor(world.wave / BOSS.every);
  boss.hp = boss.maxHp = BOSS.baseHp + (number - 1) * BOSS.hpPerBoss;
  boss.attackTimer = 1.2;
  world.enemies.push(boss);
  world.events.push('boss');
  return boss;
}

export function stepWorld(world, input, dt) {
  world.time += dt;
  if (world.banner) {
    world.banner.timer -= dt;
    if (world.banner.timer <= 0) world.banner = null;
  }
  world.shake = Math.max(0, world.shake - dt * 26);
  world.flash = Math.max(0, world.flash - dt * 2.4);

  if (world.state === GameState.TITLE) {
    stepAmbient(world, dt);
    updateParticles(world, dt);
    updateTexts(world, dt);
    return;
  }
  if (world.state === GameState.OVER) {
    stepAmbient(world, dt);
    updateParticles(world, dt);
    updateTexts(world, dt);
    return;
  }

  updateSpawning(world, dt);
  updatePlayer(world, input, dt);
  updateWeapons(world, dt);
  updateEnemies(world, dt);
  updateBullets(world, dt);
  updateEnemyBullets(world, dt);
  updatePickups(world, dt);
  updateCombo(world, dt);
  updateParticles(world, dt);
  updateTexts(world, dt);
  checkWaveEnd(world);
}

function stepAmbient(world, dt) {
  // Title / game-over backdrop: foes drift in slow circles and never attack.
  for (const e of world.enemies) {
    e.t += dt;
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;
    const orbit = Math.atan2(e.y - cy, e.x - cx) + dt * 0.11;
    const r = Math.hypot(e.x - cx, e.y - cy);
    e.x = cx + Math.cos(orbit) * r;
    e.y = cy + Math.sin(orbit) * r * 0.72;
    e.flash = Math.max(0, e.flash - dt * 6);
  }
}

function updateSpawning(world, dt) {
  if (world.waveState === 'intermission') {
    world.interTimer -= dt;
    if (world.interTimer <= 0) beginNextWave(world);
    return;
  }
  if (world.spawnQueue.length === 0) return;
  world.spawnTimer -= dt;
  if (world.spawnTimer <= 0) {
    world.spawnTimer = WAVES.spawnInterval * world.rng.range(0.7, 1.25);
    spawnFromQueue(world);
  }
}

function checkWaveEnd(world) {
  if (world.waveState !== 'active') return;
  if (world.spawnQueue.length > 0 || world.enemies.length > 0) return;
  const bonus = WAVES.clearBonusPerWave * world.wave;
  world.score += bonus;
  addScoreText(world, ARENA.width / 2, ARENA.height / 2 - 30, `WAVE CLEAR +${bonus}`, '#7dff6a', 22);
  world.events.push('waveclear');
  world.waveState = 'intermission';
  world.interTimer = WAVES.intermission;
}

function updatePlayer(world, input, dt) {
  const p = world.player;
  p.invulnTime = Math.max(0, p.invulnTime - dt);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);

  const mag = Math.hypot(input.mx, input.my);
  const nx = mag > 0.01 ? input.mx / Math.max(1, mag) : 0;
  const ny = mag > 0.01 ? input.my / Math.max(1, mag) : 0;
  p.thrust = mag > 0.01 ? Math.min(1, p.thrust + dt * 8) : Math.max(0, p.thrust - dt * 6);

  if (input.dash && p.dashCooldown <= 0 && p.dashTime <= 0) {
    p.dashTime = PLAYER.dashTime;
    p.dashCooldown = PLAYER.dashCooldown;
    const dx = mag > 0.01 ? nx : Math.cos(p.aimAngle);
    const dy = mag > 0.01 ? ny : Math.sin(p.aimAngle);
    p.vx = dx * PLAYER.dashSpeed;
    p.vy = dy * PLAYER.dashSpeed;
    world.events.push('dash');
  }

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.invulnTime = Math.max(p.invulnTime, p.dashTime + 0.05);
    addParticles(world, p.x, p.y, '#57f7ff', 2, 40, 0.28);
  } else {
    p.vx += nx * PLAYER.accel * dt;
    p.vy += ny * PLAYER.accel * dt;
    const damp = Math.exp(-PLAYER.damping * dt);
    p.vx *= damp;
    p.vy *= damp;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > PLAYER.speed) {
      p.vx = (p.vx / sp) * PLAYER.speed;
      p.vy = (p.vy / sp) * PLAYER.speed;
    }
  }

  p.x = clamp(p.x + p.vx * dt, ARENA.wall + p.radius, ARENA.width - ARENA.wall - p.radius);
  p.y = clamp(p.y + p.vy * dt, ARENA.wall + p.radius, ARENA.height - ARENA.wall - p.radius);
  p.aimAngle = Math.atan2(input.aimY - p.y, input.aimX - p.x);

  // Firing.
  world.fireCooldown -= dt;
  if (input.firing) {
    const rate = fireRateOf(world.weapon);
    while (world.fireCooldown <= 0) {
      fireOnce(world);
      world.fireCooldown += 1 / rate;
    }
  } else if (world.fireCooldown < 0) {
    world.fireCooldown = 0;
  }
}

function fireRateOf(weapon) {
  if (weapon.kind === 'rapid') return 12 + weapon.level * 2.5;
  if (weapon.kind === 'spread') return 5.6;
  return PLAYER.fireRate;
}

function fireOnce(world) {
  const p = world.player;
  const w = world.weapon;
  const shots = [];
  if (w.kind === 'spread') {
    const pellets = 2 + w.level; // 3, 4 or 5
    for (let i = 0; i < pellets; i++) {
      shots.push(p.aimAngle + (i - (pellets - 1) / 2) * 0.115);
    }
  } else {
    shots.push(p.aimAngle + world.rng.range(-0.012, 0.012));
  }
  const speed = w.kind === 'rapid' ? PLAYER.bulletSpeed * 1.18 : PLAYER.bulletSpeed;
  for (const angle of shots) {
    world.bullets.push({
      x: p.x + Math.cos(p.aimAngle) * (p.radius + 6),
      y: p.y + Math.sin(p.aimAngle) * (p.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: PLAYER.bulletLife,
      radius: 3.4,
    });
    world.stats.shotsFired += 1;
  }
  addParticles(world, p.x + Math.cos(p.aimAngle) * 20, p.y + Math.sin(p.aimAngle) * 20, '#aefcff', 1, 60, 0.12);
  world.events.push('shoot');
}

function updateWeapons(world, dt) {
  const w = world.weapon;
  if (w.kind !== 'pulse') {
    w.timeLeft -= dt;
    if (w.timeLeft <= 0) {
      world.weapon = { kind: 'pulse', level: 1, timeLeft: 0 };
      addScoreText(world, world.player.x, world.player.y - 26, 'WEAPON SPENT', '#8fa3cc', 13);
    }
  }
}

function updateEnemies(world, dt) {
  const p = world.player;
  for (const e of world.enemies) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 7);
    if (e.kind === 'boss') updateBoss(world, e, dt);
    else if (e.kind === 'weaver') weaveToward(e, p, dt);
    else if (e.kind === 'stinger') stingToward(world, e, p, dt);
    else chasePlayer(e, p, dt);
    e.x = clamp(e.x + e.vx * dt, ARENA.wall + e.radius * 0.75, ARENA.width - ARENA.wall - e.radius * 0.75);
    e.y = clamp(e.y + e.vy * dt, ARENA.wall + e.radius * 0.75, ARENA.height - ARENA.wall - e.radius * 0.75);
  }
  separateEnemies(world);
  // Contact with the player.
  for (const e of world.enemies) {
    if (dist(e, p) < e.radius + p.radius - 2) {
      hurtPlayer(world);
      const push = Math.atan2(e.y - p.y, e.x - p.x);
      e.vx += Math.cos(push) * 260;
      e.vy += Math.sin(push) * 260;
    }
  }
}

function chasePlayer(e, p, dt) {
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  steer(e, a, e.speed, dt, 3.2);
}

function weaveToward(e, p, dt) {
  const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 5.2) * 0.75;
  steer(e, a, e.speed, dt, 4.2);
}

function stingToward(world, e, p, dt) {
  // Stingers circle at range, then telegraph and lunge.
  const d = dist(e, p);
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.lungeTime > 0) {
    e.lungeTime -= dt;
    return; // velocity already set by the lunge
  }
  if (d < 190 && e.attackTimer <= 0) {
    e.lungeTime = 0.42;
    e.attackTimer = world.rng.range(1.1, 1.9);
    e.vx = Math.cos(a) * e.speed * 2.5;
    e.vy = Math.sin(a) * e.speed * 2.5;
    return;
  }
  e.attackTimer -= dt;
  const orbitA = a + Math.PI / 2;
  steer(e, d > 210 ? a : orbitA, e.speed * 0.8, dt, 3.6);
}

function steer(e, angle, speed, dt, agility) {
  const tx = Math.cos(angle) * speed;
  const ty = Math.sin(angle) * speed;
  const k = Math.min(1, agility * dt);
  e.vx += (tx - e.vx) * k;
  e.vy += (ty - e.vy) * k;
}

function separateEnemies(world) {
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.radius + b.radius) * 0.82;
      if (d > 0.01 && d < min) {
        const push = ((min - d) / min) * 26;
        const ux = dx / d;
        const uy = dy / d;
        a.vx -= ux * push;
        a.vy -= uy * push;
        b.vx += ux * push;
        b.vy += uy * push;
      }
    }
  }
}

function updateBoss(world, boss, dt) {
  const p = world.player;
  // The Dreadnought holds a menacing range and strafes slowly around the player.
  const d = dist(boss, p);
  const a = Math.atan2(p.y - boss.y, p.x - boss.x);
  const want = d > 300 ? a : d < 190 ? a + Math.PI : a + Math.PI / 2;
  steer(boss, want, boss.speed, dt, 1.4);

  const enraged = boss.hp < boss.maxHp * 0.35;
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    const phase = boss.hp > boss.maxHp * 0.7 ? 0 : boss.hp > boss.maxHp * 0.35 ? 1 : 2;
    const move = world.rng.int(0, phase === 0 ? 1 : 2);
    if (move === 0) bossRingBurst(world, boss, enraged ? 18 : 14);
    else if (move === 1) bossAimedSpread(world, boss);
    else bossSummonMinions(world, boss);
    boss.attackTimer = enraged ? world.rng.range(0.9, 1.3) : world.rng.range(1.3, 1.9);
    world.events.push('bossshot');
  }
  // A slow spiral between the big attacks keeps pressure on.
  boss.spiralTimer = (boss.spiralTimer ?? 0) - dt;
  if (boss.spiralTimer <= 0 && boss.hp < boss.maxHp * 0.7) {
    boss.spiralTimer = 0.16;
    boss.spiralAngle += 0.42;
    for (const off of [0, Math.PI]) {
      const ang = boss.spiralAngle + off;
      world.enemyBullets.push({
        x: boss.x + Math.cos(ang) * boss.radius,
        y: boss.y + Math.sin(ang) * boss.radius,
        vx: Math.cos(ang) * 148,
        vy: Math.sin(ang) * 148,
        life: 3.4,
        radius: 4,
      });
    }
  }
}

function bossRingBurst(world, boss, count) {
  const base = world.rng.angle();
  for (let i = 0; i < count; i++) {
    const ang = base + (i / count) * Math.PI * 2;
    world.enemyBullets.push({
      x: boss.x + Math.cos(ang) * boss.radius,
      y: boss.y + Math.sin(ang) * boss.radius,
      vx: Math.cos(ang) * 168,
      vy: Math.sin(ang) * 168,
      life: 3.6,
      radius: 4,
    });
  }
  addParticles(world, boss.x, boss.y, '#ff3d5e', 14, 160, 0.4);
}

function bossAimedSpread(world, boss) {
  const p = world.player;
  const base = Math.atan2(p.y - boss.y, p.x - boss.x);
  for (let i = -2; i <= 2; i++) {
    const ang = base + i * 0.16;
    world.enemyBullets.push({
      x: boss.x + Math.cos(ang) * boss.radius,
      y: boss.y + Math.sin(ang) * boss.radius,
      vx: Math.cos(ang) * 235,
      vy: Math.sin(ang) * 235,
      life: 2.6,
      radius: 4,
    });
  }
}

function bossSummonMinions(world, boss) {
  for (let i = 0; i < 3; i++) {
    const ang = world.rng.angle();
    const m = makeEnemy(world, world.rng.pick(['mini', 'stinger']), boss.x + Math.cos(ang) * 70, boss.y + Math.sin(ang) * 70);
    world.enemies.push(m);
  }
  addParticles(world, boss.x, boss.y, '#c792ff', 12, 130, 0.35);
}

function updateBullets(world, dt) {
  const kept = [];
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 4 || b.x > ARENA.width - 4 || b.y < 4 || b.y > ARENA.height - 4) continue;
    let consumed = false;
    for (const e of world.enemies) {
      if (dist(b, e) < e.radius + b.radius) {
        damageEnemy(world, e, 1);
        world.stats.shotsHit += 1;
        consumed = true;
        break;
      }
    }
    if (!consumed) kept.push(b);
  }
  world.bullets = kept;
  world.enemies = world.enemies.filter((e) => e.hp > 0);
}

function updateEnemyBullets(world, dt) {
  const p = world.player;
  const kept = [];
  for (const b of world.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 2 || b.x > ARENA.width - 2 || b.y < 2 || b.y > ARENA.height - 2) continue;
    if (dist(b, p) < p.radius + b.radius - 1) {
      hurtPlayer(world);
      continue;
    }
    kept.push(b);
  }
  world.enemyBullets = kept;
}

function damageEnemy(world, e, dmg) {
  e.hp -= dmg;
  e.flash = 1;
  addParticles(world, e.x, e.y, '#ffffff', 3, 130, 0.2);
  if (e.hp <= 0) killEnemy(world, e);
}

function killEnemy(world, e) {
  world.stats.kills += 1;
  world.combo += 1;
  world.comboTimer = COMBO.window;
  const prevMult = world.mult;
  world.mult = Math.min(COMBO.maxMult, 1 + Math.floor(world.combo / COMBO.killsPerTier));
  if (world.mult > prevMult && world.mult >= 3) {
    // A new multiplier tier is a moment: announce it mid-arena and sting it.
    addScoreText(world, ARENA.width / 2, 132, `×${world.mult} RAMPAGE`, '#ffd257', 25);
    world.events.push('tier');
  }
  const gained = e.score * world.mult;
  world.score += gained;
  addScoreText(world, e.x, e.y - e.radius, `+${gained}`, e.kind === 'boss' ? '#ffd257' : '#dfe9ff', e.kind === 'boss' ? 26 : 14);
  addExplosion(world, e.x, e.y, colorOf(e.kind), e.kind === 'boss' ? 46 : 12 + e.radius);
  world.shake = Math.min(9, world.shake + (e.kind === 'boss' ? 9 : 2.2));
  world.events.push(e.kind === 'boss' ? 'bossdown' : 'explosion');
  if (e.kind === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const ang = world.rng.angle();
      const m = makeEnemy(world, 'mini', e.x + Math.cos(ang) * 12, e.y + Math.sin(ang) * 12);
      m.vx = Math.cos(ang) * 190;
      m.vy = Math.sin(ang) * 190;
      world.enemies.push(m);
    }
  }
  if (e.kind === 'boss') {
    world.stats.bossesDown += 1;
    world.enemyBullets = [];
    dropPickup(world, e.x - 22, e.y, 'shield', true);
    dropPickup(world, e.x + 22, e.y, world.rng.pick(['spread', 'rapid']), true);
    if (world.lives < PLAYER.maxLives) dropPickup(world, e.x, e.y + 24, 'heart', true);
  } else {
    maybeDropPickup(world, e.x, e.y);
  }
}

function hurtPlayer(world) {
  const p = world.player;
  if (p.invulnTime > 0 || world.state !== GameState.PLAYING) return;
  if (world.shield) {
    world.shield = false;
    p.invulnTime = 1;
    world.events.push('shieldbreak');
    addParticles(world, p.x, p.y, '#7ab8ff', 16, 170, 0.4);
    addScoreText(world, p.x, p.y - 24, 'SHIELD DOWN', '#7ab8ff', 14);
    return;
  }
  world.lives -= 1;
  world.combo = 0;
  world.mult = 1;
  world.comboTimer = 0;
  p.invulnTime = PLAYER.hitInvulnTime;
  world.shake = Math.min(12, world.shake + 7);
  world.flash = 1;
  world.events.push('hit');
  addExplosion(world, p.x, p.y, '#57f7ff', 18);
  if (world.lives <= 0) {
    world.state = GameState.OVER;
    world.best = Math.max(world.best, world.score);
    addExplosion(world, p.x, p.y, '#ffd257', 60);
    world.shake = 14;
    world.events.push('gameover');
  }
}

function maybeDropPickup(world, x, y) {
  const roll = world.rng.next();
  if (roll < PICKUP.weaponChance) dropPickup(world, x, y, world.rng.pick(['spread', 'rapid']));
  else if (roll < PICKUP.weaponChance + PICKUP.shieldChance && !world.shield) dropPickup(world, x, y, 'shield');
  else if (roll < PICKUP.weaponChance + PICKUP.shieldChance + PICKUP.heartChance && world.lives < PLAYER.maxLives) {
    dropPickup(world, x, y, 'heart');
  }
}

function dropPickup(world, x, y, kind, guaranteed = false) {
  world.pickups.push({
    x,
    y,
    kind,
    radius: PICKUP.radius,
    life: guaranteed ? PICKUP.life * 1.6 : PICKUP.life,
    t: world.rng.range(0, Math.PI * 2),
  });
}

function updatePickups(world, dt) {
  const p = world.player;
  const kept = [];
  for (const pk of world.pickups) {
    pk.t += dt * 3;
    pk.life -= dt;
    if (pk.life <= 0) continue;
    const d = dist(pk, p);
    if (d < PICKUP.magnetRange) {
      const a = Math.atan2(p.y - pk.y, p.x - pk.x);
      const pull = (1 - d / PICKUP.magnetRange) * 340;
      pk.x += Math.cos(a) * pull * dt;
      pk.y += Math.sin(a) * pull * dt;
    }
    if (d < p.radius + pk.radius + 4) {
      collectPickup(world, pk);
      continue;
    }
    kept.push(pk);
  }
  world.pickups = kept;
}

function collectPickup(world, pk) {
  const p = world.player;
  world.events.push('pickup');
  if (pk.kind === 'heart') {
    world.lives = Math.min(PLAYER.maxLives, world.lives + 1);
    addScoreText(world, p.x, p.y - 24, '+1 HULL', '#ff5d7a', 15);
  } else if (pk.kind === 'shield') {
    world.shield = true;
    addScoreText(world, p.x, p.y - 24, 'SHIELD UP', '#7ab8ff', 15);
  } else {
    const w = world.weapon;
    if (w.kind === pk.kind) w.level = Math.min(3, w.level + 1);
    else world.weapon = { kind: pk.kind, level: 1, timeLeft: 18 };
    if (world.weapon.kind === pk.kind) world.weapon.timeLeft = 18;
    addScoreText(world, p.x, p.y - 24, `${pk.kind.toUpperCase()} LV${world.weapon.level}`, '#ffd257', 15);
  }
  addParticles(world, p.x, p.y, '#ffd257', 10, 120, 0.3);
}

function updateCombo(world, dt) {
  if (world.comboTimer > 0) {
    world.comboTimer -= dt;
    if (world.comboTimer <= 0) {
      world.combo = 0;
      world.mult = 1;
    }
  }
}

export function addParticles(world, x, y, color, count, speed, life) {
  for (let i = 0; i < count; i++) {
    const ang = world.rng.angle();
    const sp = world.rng.range(speed * 0.25, speed);
    world.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: world.rng.range(life * 0.5, life),
      maxLife: life,
      color,
      size: world.rng.range(1.4, 3.2),
    });
  }
}

function addExplosion(world, x, y, color, count) {
  addParticles(world, x, y, color, count, 240, 0.55);
  addParticles(world, x, y, '#ffffff', Math.floor(count / 3), 150, 0.3);
}

function updateParticles(world, dt) {
  const kept = [];
  for (const pt of world.particles) {
    pt.life -= dt;
    if (pt.life <= 0) continue;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.exp(-2.4 * dt);
    pt.vy *= Math.exp(-2.4 * dt);
    kept.push(pt);
  }
  world.particles = kept;
}

export function addScoreText(world, x, y, text, color, size) {
  world.texts.push({ x, y, text, color, size, life: 0.95, maxLife: 0.95 });
}

function updateTexts(world, dt) {
  const kept = [];
  for (const t of world.texts) {
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life > 0) kept.push(t);
  }
  world.texts = kept;
}

export function colorOf(kind) {
  return {
    chaser: '#ff5d7a',
    weaver: '#ffb84d',
    splitter: '#c792ff',
    mini: '#e3b8ff',
    stinger: '#7dff6a',
    boss: '#ff3d5e',
  }[kind] ?? '#ffffff';
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
