// Neon Swarm — the canvas renderer. Draws the world the simulation hands it:
// a deep-space arena with a parallax starfield and grid, neon-glow ships and
// foes, particles, the HUD, wave banners, and the title / pause / game-over
// screens. Pure presentation: it reads world state and never changes it.

import { ARENA, PLAYER, COLORS } from './config.js';
import { GameState, colorOf } from './world.js';
import { makeRng } from './random.js';

const W = ARENA.width;
const H = ARENA.height;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();
  const vignette = makeVignette(ctx);

  function draw(world, opts = {}) {
    ctx.save();
    if (world.shake > 0.1) {
      const s = world.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawArena(ctx, stars, world.time);
    drawPickups(ctx, world);
    for (const e of world.enemies) drawEnemy(ctx, e, world.time);
    if (world.state !== GameState.TITLE) drawPlayer(ctx, world);
    drawBullets(ctx, world);
    drawParticles(ctx, world);
    drawTexts(ctx, world);
    ctx.restore();

    ctx.drawImage(vignette, 0, 0);
    if (world.flash > 0) {
      ctx.fillStyle = `rgba(255, 45, 70, ${world.flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (world.state === GameState.PLAYING && world.lives === 1) {
      // Last hull point: the arena frame itself pulses a warning.
      const a = 0.25 + 0.2 * Math.sin(world.time * 6);
      ctx.strokeStyle = `rgba(255, 61, 94, ${a.toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(ARENA.wall - 12, ARENA.wall - 12, W - (ARENA.wall - 12) * 2, H - (ARENA.wall - 12) * 2);
    }
    if (world.state === GameState.PLAYING) drawHud(ctx, world);
    if (world.banner && world.state === GameState.PLAYING) drawBanner(ctx, world);
    if (world.state === GameState.TITLE) drawTitle(ctx, world);
    if (world.state === GameState.OVER) drawGameOver(ctx, world);
    if (opts.paused && world.state === GameState.PLAYING) drawPaused(ctx);
  }

  return { draw };
}

function makeStars() {
  const rng = makeRng(20261);
  const stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({ x: rng.range(0, W), y: rng.range(0, H), r: rng.range(0.5, 1.7), depth: rng.range(0.15, 1), tw: rng.range(0, 6) });
  }
  return stars;
}

function makeVignette(ctx) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(2,3,10,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

function drawArena(ctx, stars, time) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070818');
  bg.addColorStop(0.55, COLORS.bg);
  bg.addColorStop(1, '#0a0618');
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  for (const s of stars) {
    const a = 0.35 + 0.3 * Math.sin(time * 1.4 + s.tw) * s.depth;
    ctx.fillStyle = `rgba(190, 210, 255, ${a.toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ARENA.wall; x <= W - ARENA.wall; x += 48) {
    ctx.moveTo(x, ARENA.wall);
    ctx.lineTo(x, H - ARENA.wall);
  }
  for (let y = ARENA.wall; y <= H - ARENA.wall; y += 48) {
    ctx.moveTo(ARENA.wall, y);
    ctx.lineTo(W - ARENA.wall, y);
  }
  ctx.stroke();

  // The arena wall: a bright double frame the action reads against.
  ctx.strokeStyle = 'rgba(87, 247, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.wall - 6, ARENA.wall - 6, W - (ARENA.wall - 6) * 2, H - (ARENA.wall - 6) * 2);
  ctx.strokeStyle = 'rgba(87, 247, 255, 0.14)';
  ctx.lineWidth = 7;
  ctx.strokeRect(ARENA.wall - 6, ARENA.wall - 6, W - (ARENA.wall - 6) * 2, H - (ARENA.wall - 6) * 2);
}

function polygon(ctx, x, y, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawEnemy(ctx, e, time) {
  const color = colorOf(e.kind);
  const flash = e.flash > 0.4;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? '#ffffff' : color;
  ctx.fillStyle = flash ? 'rgba(255,255,255,0.85)' : hexToRgba(color, 0.24);

  const spin = e.t * (e.kind === 'splitter' ? 0.7 : 1.6);
  if (e.kind === 'chaser') {
    const a = Math.atan2(e.vy, e.vx);
    polygon(ctx, 0, 0, e.radius, 3, a);
  } else if (e.kind === 'weaver') {
    polygon(ctx, 0, 0, e.radius, 4, spin * 0.6);
  } else if (e.kind === 'splitter' || e.kind === 'mini') {
    polygon(ctx, 0, 0, e.radius, 5, spin);
  } else if (e.kind === 'stinger') {
    const a = Math.atan2(e.vy, e.vx);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(e.radius * 1.25, 0);
    ctx.lineTo(-e.radius * 0.8, e.radius * 0.62);
    ctx.lineTo(-e.radius * 0.35, 0);
    ctx.lineTo(-e.radius * 0.8, -e.radius * 0.62);
    ctx.closePath();
  } else if (e.kind === 'boss') {
    polygon(ctx, 0, 0, e.radius, 6, spin * 0.35);
    ctx.stroke();
    ctx.fill();
    polygon(ctx, 0, 0, e.radius * 0.62, 6, -spin * 0.55);
    ctx.strokeStyle = flash ? '#ffffff' : '#ffb3c0';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.26 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#ffffff' : '#ff3d5e';
    ctx.shadowBlur = 22;
    ctx.fill();
  }
  if (e.kind !== 'boss') {
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // A slim health bar over anything tougher than a one-hit foe.
  if (e.kind !== 'boss' && e.maxHp > 1 && e.hp < e.maxHp) {
    const w = e.radius * 1.7;
    ctx.fillStyle = 'rgba(10, 12, 30, 0.8)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w, 3.5);
    ctx.fillStyle = color;
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, (w * e.hp) / e.maxHp, 3.5);
  }
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.invulnTime > 0 && world.state === GameState.PLAYING && Math.floor(world.time * 14) % 2 === 0 && p.dashTime <= 0) {
    // Blink while invulnerable after a hit (but stay solid mid-dash).
    ctx.globalAlpha = 0.35;
  }
  ctx.save();
  ctx.translate(p.x, p.y);

  if (world.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 8 + Math.sin(world.time * 4) * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(122, 184, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.shield;
    ctx.shadowBlur = 12;
    ctx.stroke();
  }

  ctx.rotate(p.aimAngle);
  // Engine flame.
  if (p.thrust > 0.05) {
    const len = (10 + Math.random() * 7) * p.thrust;
    ctx.beginPath();
    ctx.moveTo(-p.radius - 1, 4.4);
    ctx.lineTo(-p.radius - len, 0);
    ctx.lineTo(-p.radius - 1, -4.4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 176, 66, 0.85)';
    ctx.shadowColor = '#ffb042';
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  // Hull: a sleek arrow with a bright core.
  ctx.beginPath();
  ctx.moveTo(p.radius + 5, 0);
  ctx.lineTo(-p.radius + 2, p.radius - 1);
  ctx.lineTo(-p.radius + 6, 0);
  ctx.lineTo(-p.radius + 2, -p.radius + 1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(87, 247, 255, 0.28)';
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1, 0, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.playerCore;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBullets(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of world.bullets) {
    ctx.strokeStyle = COLORS.bullet;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const b of world.enemyBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.enemyBullet;
    ctx.shadowColor = COLORS.enemyBullet;
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of world.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTexts(ctx, world) {
  ctx.save();
  ctx.textAlign = 'center';
  for (const t of world.texts) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = a;
    ctx.font = `700 ${t.size}px ui-monospace, monospace`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    const bob = Math.sin(pk.t) * 2.5;
    const blink = pk.life < 2.5 && Math.floor(pk.life * 8) % 2 === 0;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.globalAlpha = blink ? 0.3 : 1;
    const style = {
      spread: { color: '#ffd257', label: 'S', sides: 3 },
      rapid: { color: '#7dff6a', label: 'R', sides: 4 },
      shield: { color: COLORS.shield, label: 'O', sides: 20 },
      heart: { color: COLORS.heart, label: '+', sides: 5 },
    }[pk.kind];
    ctx.strokeStyle = style.color;
    ctx.fillStyle = hexToRgba(style.color === COLORS.shield ? '#7ab8ff' : style.color, 0.2);
    ctx.lineWidth = 2;
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 12;
    if (pk.kind === 'shield') {
      ctx.beginPath();
      ctx.arc(0, 0, pk.radius, 0, Math.PI * 2);
    } else {
      polygon(ctx, 0, 0, pk.radius + 2, style.sides, pk.t * 0.4);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = style.color;
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.label, 0, 0.5);
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
}

function drawHud(ctx, world) {
  ctx.save();
  ctx.textBaseline = 'top';
  // Score, top-left.
  ctx.textAlign = 'left';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillStyle = COLORS.dimText;
  ctx.fillText('SCORE', 40, 36);
  ctx.font = '700 27px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(String(world.score).padStart(7, '0'), 40, 50);
  if (world.best > 0) {
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`BEST ${world.best}`, 40, 82);
  }
  // Combo multiplier, under the score.
  if (world.mult > 1) {
    ctx.font = '800 19px ui-monospace, monospace';
    ctx.fillStyle = COLORS.combo;
    ctx.shadowColor = COLORS.combo;
    ctx.shadowBlur = 10;
    ctx.fillText(`×${world.mult} COMBO`, 40, 100);
    ctx.shadowBlur = 0;
    const frac = Math.max(0, world.comboTimer / 2.6);
    ctx.fillStyle = 'rgba(255, 210, 87, 0.25)';
    ctx.fillRect(40, 124, 110, 4);
    ctx.fillStyle = COLORS.combo;
    ctx.fillRect(40, 124, 110 * frac, 4);
  }
  // Wave, top-centre.
  ctx.textAlign = 'center';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillStyle = COLORS.dimText;
  ctx.fillText('WAVE', W / 2, 36);
  ctx.font = '700 24px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(String(world.wave), W / 2, 49);
  const boss = world.enemies.find((e) => e.kind === 'boss');
  if (boss) {
    const bw = 300;
    ctx.fillStyle = 'rgba(10, 12, 30, 0.85)';
    ctx.fillRect(W / 2 - bw / 2, 82, bw, 9);
    ctx.fillStyle = COLORS.boss;
    ctx.fillRect(W / 2 - bw / 2, 82, (bw * Math.max(0, boss.hp)) / boss.maxHp, 9);
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillStyle = '#ffb3c0';
    ctx.fillText('DREADNOUGHT', W / 2, 95);
  }
  // Hull lives, top-right.
  ctx.textAlign = 'right';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillStyle = COLORS.dimText;
  ctx.fillText('HULL', W - 40, 36);
  for (let i = 0; i < PLAYER.maxLives; i++) {
    const x = W - 52 - i * 24;
    ctx.beginPath();
    ctx.moveTo(x, 66);
    ctx.lineTo(x - 8, 55);
    ctx.lineTo(x - 8, 75);
    ctx.closePath();
    if (i < world.lives) {
      ctx.fillStyle = COLORS.player;
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = 'rgba(120, 140, 190, 0.22)';
      ctx.shadowBlur = 0;
    }
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Weapon + dash, bottom corners.
  ctx.textAlign = 'left';
  ctx.font = '700 14px ui-monospace, monospace';
  const w = world.weapon;
  if (w.kind === 'pulse') {
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('PULSE BLASTER', 40, H - 56);
  } else {
    ctx.fillStyle = COLORS.combo;
    ctx.fillText(`${w.kind.toUpperCase()} LV${w.level}`, 40, H - 56);
    ctx.fillStyle = 'rgba(255, 210, 87, 0.25)';
    ctx.fillRect(40, H - 36, 110, 4);
    ctx.fillStyle = COLORS.combo;
    ctx.fillRect(40, H - 36, 110 * Math.max(0, w.timeLeft / 18), 4);
  }
  ctx.textAlign = 'right';
  ctx.font = '700 12px ui-monospace, monospace';
  const dashReady = world.player.dashCooldown <= 0;
  ctx.fillStyle = dashReady ? COLORS.player : COLORS.dimText;
  ctx.fillText(dashReady ? 'DASH READY' : 'DASH …', W - 40, H - 56);
  ctx.restore();
}

function drawBanner(ctx, world) {
  const b = world.banner;
  const a = Math.min(1, b.timer / 0.5, (2.2 - b.timer) * 3 + 0.4);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.textAlign = 'center';
  ctx.font = '800 44px ui-monospace, monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 24;
  ctx.fillText(b.text, W / 2, H / 2 - 66);
  ctx.shadowBlur = 0;
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillStyle = b.sub.includes('DREADNOUGHT') ? '#ff8fa5' : COLORS.dimText;
  ctx.fillText(b.sub, W / 2, H / 2 - 34);
  ctx.restore();
}

function drawTitle(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(3, 4, 12, 0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  const pulse = 0.85 + 0.15 * Math.sin(world.time * 2.2);
  ctx.font = '900 84px ui-monospace, monospace';
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 34 * pulse;
  ctx.fillStyle = '#eaffff';
  ctx.fillText('NEON', W / 2, 196);
  ctx.shadowColor = '#ff3d5e';
  ctx.fillStyle = '#ffd7de';
  ctx.fillText('SWARM', W / 2, 282);
  ctx.shadowBlur = 0;

  ctx.font = '600 16px ui-monospace, monospace';
  ctx.fillStyle = COLORS.combo;
  ctx.fillText('A R E N A   S U R V I V A L', W / 2, 322);

  ctx.font = '500 15px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  const lines = [
    'WASD / arrows — fly        mouse — aim        hold click / space — fire',
    'SHIFT / right-click — dash through danger        P — pause        M — mute',
    'Chain kills to raise the ×9 combo. Grab S / R power-ups. Drop the Dreadnought.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 386 + i * 25));

  ctx.font = '800 21px ui-monospace, monospace';
  ctx.fillStyle = `rgba(87, 247, 255, ${0.65 + 0.35 * Math.sin(world.time * 4)})`;
  ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', W / 2, 500);

  if (world.best > 0) {
    ctx.font = '600 14px ui-monospace, monospace';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`BEST SCORE ${world.best}`, W / 2, 540);
  }
  ctx.restore();
}

function drawGameOver(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(3, 4, 12, 0.62)';
  ctx.fillRect(0, 0, W, H);
  const panelW = 430;
  const panelH = 330;
  const x = W / 2 - panelW / 2;
  const y = H / 2 - panelH / 2;
  ctx.fillStyle = 'rgba(9, 11, 28, 0.92)';
  ctx.strokeStyle = 'rgba(255, 61, 94, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, panelH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '900 40px ui-monospace, monospace';
  ctx.fillStyle = '#ffd7de';
  ctx.shadowColor = '#ff3d5e';
  ctx.shadowBlur = 18;
  ctx.fillText('SIGNAL LOST', W / 2, y + 58);
  ctx.shadowBlur = 0;

  ctx.font = '700 34px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(String(world.score), W / 2, y + 108);
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillStyle = COLORS.dimText;
  ctx.fillText(world.score >= world.best && world.score > 0 ? '★ NEW BEST ★' : `BEST ${world.best}`, W / 2, y + 128);

  const acc = world.stats.shotsFired > 0 ? Math.round((100 * world.stats.shotsHit) / world.stats.shotsFired) : 0;
  const rows = [
    ['WAVE REACHED', String(world.wave)],
    ['FOES DOWN', String(world.stats.kills)],
    ['ACCURACY', `${acc}%`],
    ['DREADNOUGHTS DOWN', String(world.stats.bossesDown)],
  ];
  ctx.font = '600 14px ui-monospace, monospace';
  rows.forEach(([label, value], i) => {
    const ry = y + 168 + i * 27;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(label, x + 56, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(value, x + panelW - 56, ry);
  });

  ctx.textAlign = 'center';
  ctx.font = '800 16px ui-monospace, monospace';
  ctx.fillStyle = `rgba(87, 247, 255, ${0.65 + 0.35 * Math.sin(world.time * 4)})`;
  ctx.fillText('CLICK OR PRESS ENTER TO FLY AGAIN', W / 2, y + panelH - 24);
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(3, 4, 12, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '800 34px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = '600 14px ui-monospace, monospace';
  ctx.fillStyle = COLORS.dimText;
  ctx.fillText('P or Esc to resume', W / 2, H / 2 + 22);
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
