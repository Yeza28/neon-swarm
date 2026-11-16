// Neon Swarm — keyboard and mouse input. Tracks held keys and the pointer, and
// translates them into the plain input struct the simulation consumes each
// step: a movement vector, an aim point in world coordinates, firing, and an
// edge-triggered dash. One-shot actions (start, pause, mute) are exposed as
// consume-once latches so the game loop can poll them once per frame.

import { ARENA } from './config.js';

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: ARENA.width / 2, y: ARENA.height / 2 - 80, down: false };
  let dashLatch = false;
  let startLatch = false;
  let pauseLatch = false;
  let muteLatch = false;

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * ARENA.width,
      y: ((event.clientY - rect.top) / rect.height) * ARENA.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') startLatch = true;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') dashLatch = true;
    if (event.code === 'KeyP' || event.code === 'Escape') pauseLatch = true;
    if (event.code === 'KeyM') muteLatch = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (event) => {
    const p = toWorld(event);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toWorld(event);
    mouse.x = p.x;
    mouse.y = p.y;
    if (event.button === 2) dashLatch = true;
    else {
      mouse.down = true;
      startLatch = true;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function current(player) {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    // Aim at the mouse; with no mouse input yet, aim where the ship is heading.
    const aimX = mouse.x;
    const aimY = mouse.y;
    return {
      mx,
      my,
      aimX: aimX === player.x && aimY === player.y ? player.x + 1 : aimX,
      aimY,
      firing: mouse.down || keys.has('Space'),
      dash: dashLatch,
    };
  }

  function consumeDash() {
    const was = dashLatch;
    dashLatch = false;
    return was;
  }

  function take(action) {
    if (action === 'start') {
      const was = startLatch;
      startLatch = false;
      return was;
    }
    if (action === 'pause') {
      const was = pauseLatch;
      pauseLatch = false;
      return was;
    }
    if (action === 'mute') {
      const was = muteLatch;
      muteLatch = false;
      return was;
    }
    return false;
  }

  return { current, consumeDash, take };
}
