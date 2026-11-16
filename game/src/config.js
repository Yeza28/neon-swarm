// Neon Swarm — tuning constants. Everything the game balances on lives here so the
// world, the renderer and the staged screenshot scenes all agree on the numbers.

export const ARENA = {
  width: 960,
  height: 640,
  wall: 26, // inner margin the player and enemies bounce inside
};

export const PLAYER = {
  radius: 11,
  speed: 268,
  accel: 2400,
  damping: 7.5,
  fireRate: 7, // shots per second with the base blaster
  bulletSpeed: 580,
  bulletLife: 0.85,
  dashSpeed: 940,
  dashTime: 0.16,
  dashCooldown: 1.5,
  hitInvulnTime: 1.4,
  startLives: 3,
  maxLives: 5,
};

export const COMBO = {
  window: 2.6, // seconds to land the next kill before the combo cools off
  killsPerTier: 7, // kills per multiplier tier
  maxMult: 9,
};

export const WAVES = {
  intermission: 2.4, // calm seconds between waves
  baseBudget: 7, // spawn points in wave 1
  budgetPerWave: 3,
  spawnInterval: 0.55,
  spawnGroupMax: 3,
  clearBonusPerWave: 40,
};

export const BOSS = {
  every: 5, // a boss anchors every 5th wave
  radius: 46,
  baseHp: 260,
  hpPerBoss: 90, // extra hp for each later boss
  contactDamage: 1,
};

export const PICKUP = {
  weaponChance: 0.11,
  shieldChance: 0.055,
  heartChance: 0.03,
  life: 11, // seconds before a pickup fades
  magnetRange: 92,
  radius: 10,
};

export const COLORS = {
  bg: '#05060f',
  grid: 'rgba(64, 84, 178, 0.16)',
  player: '#57f7ff',
  playerCore: '#eaffff',
  bullet: '#aefcff',
  enemyBullet: '#ff5d7a',
  heart: '#ff5d7a',
  shield: '#7ab8ff',
  combo: '#ffd257',
  text: '#dfe9ff',
  dimText: '#8fa3cc',
  chaser: '#ff5d7a',
  weaver: '#ffb84d',
  splitter: '#c792ff',
  mini: '#e3b8ff',
  stinger: '#7dff6a',
  boss: '#ff3d5e',
};
