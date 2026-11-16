// Neon Swarm — the browser shell. Owns the canvas, the fixed-step game loop,
// the input and audio wiring, the saved best score, and the ?shot= mode the
// entry's screenshots are taken in. All rules live in world.js; this file only
// connects them to the page.

import { ARENA } from './config.js';
import { createWorld, startRun, stepWorld, GameState } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShotScene } from './shots.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

const BEST_KEY = 'neon-swarm-best';
function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // A sandboxed frame may deny storage; the game plays on without it.
  }
}

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = ARENA.width * dpr;
  canvas.height = ARENA.height * dpr;
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// Any first gesture unlocks the audio context, as browsers require.
const unlock = () => audio.ensure();
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

const shotName = params.get('shot');
if (shotName) {
  runShotMode(shotName, Number(params.get('seed') ?? 1));
} else {
  runGame();
}

function runShotMode(name, seed) {
  const world = stageShotScene(name, seed);
  world.best = Math.max(world.best, loadBest());
  const idle = { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, dash: false };
  function frame() {
    // Title and game-over scenes keep their ambient drift; action scenes hold.
    if (world.state !== GameState.PLAYING) stepWorld(world, idle, 1 / 60);
    renderer.draw(world);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function runGame() {
  const seed = Number(params.get('seed') ?? (Date.now() % 2147483646) + 1);
  const world = createWorld(seed);
  world.best = loadBest();
  let paused = false;
  let wasOver = false;
  let last = performance.now();
  let accumulator = 0;
  const STEP = 1 / 60;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    accumulator += dt;

    if (input.take('mute')) audio.toggleMute();
    if (input.take('pause') && world.state === GameState.PLAYING) paused = !paused;
    if (input.take('start')) {
      audio.ensure();
      if (world.state === GameState.TITLE || world.state === GameState.OVER) {
        startRun(world);
        paused = false;
      }
    }

    let firstStep = true;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      if (!paused) {
        const stepInput = input.current(world.player);
        stepInput.dash = firstStep ? input.consumeDash() : false;
        stepWorld(world, stepInput, STEP);
      }
      firstStep = false;
    }

    for (const event of world.events) audio.play(event);
    world.events.length = 0;

    if (world.state === GameState.OVER && !wasOver) saveBest(world.best);
    wasOver = world.state === GameState.OVER;

    renderer.draw(world, { paused });
  }
  requestAnimationFrame(frame);
}
