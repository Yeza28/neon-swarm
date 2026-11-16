// Neon Swarm — entrypoint for the make.fun best-game-01 competition (Node 22, standard
// library only). The game itself is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html plus its ES modules under game/src/, no
// library, no network request). This program validates the entry against the scorer's
// caps, copies game/ and screenshots/ from beside this file to the output directory, and
// writes dossier.json there — the summary the judge reads — with the vendored make.fun
// library (vendor/makefun-game.ts, left untouched).
//
// The validation below is deliberately strict and runs before anything is copied: an
// entry the scorer would refuse (no game/index.html, the wrong number of screenshots,
// an oversized screenshot, too many game files, too many game bytes, an over-long game
// path) fails here first, with every violation named, instead of being handed in broken.
// After the dossier is written, a one-line manifest of what was handed in is printed.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json). Only text_max_bytes shapes the dossier
// bytes; the rest are refusal limits, mirrored here so validateEntry can reject an
// entry the scorer would reject, for the same reasons and before any output is made.
const CAPS = {
  text_max_bytes: 163840, // 160 KiB of source text in the dossier
  screenshots_min: 3,
  screenshots_max: 4,
  screenshot_max_bytes: 262144, // 256 KiB each
  game_max_files: 993,
  game_max_bytes: 50331648, // 48 MiB of game files in all
  game_path_max_bytes: 1000, // any single path under game/
};

// Recursively list every regular file under root as { full, rel, bytes }, where rel is
// the path relative to root (the form the game/ path cap is measured on).
function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ full, rel: relative(root, full), bytes: statSync(full).size });
    }
  };
  walk(root);
  return files;
}

// Check the entry beside this file against CAPS. Returns the measured stats on success;
// throws one Error naming every violation found, so a broken entry is fixed in one pass.
function validateEntry() {
  const problems = [];
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');

  if (!existsSync(join(gameDir, 'index.html'))) {
    problems.push('game/index.html is missing — it is the page the browser (and the judge) loads');
  }

  const gameFiles = existsSync(gameDir) ? listFiles(gameDir) : [];
  const gameBytes = gameFiles.reduce((sum, f) => sum + f.bytes, 0);
  if (gameFiles.length > CAPS.game_max_files) {
    problems.push(`game/ holds ${gameFiles.length} files, over the cap of ${CAPS.game_max_files}`);
  }
  if (gameBytes > CAPS.game_max_bytes) {
    problems.push(`game/ totals ${gameBytes} bytes, over the cap of ${CAPS.game_max_bytes} (48 MiB)`);
  }
  for (const f of gameFiles) {
    if (Buffer.byteLength(f.rel) > CAPS.game_path_max_bytes) {
      problems.push(`game path "${f.rel}" is over the cap of ${CAPS.game_path_max_bytes} bytes`);
    }
  }

  const isImage = (name) => /\.(png|jpe?g)$/i.test(name);
  const shots = existsSync(shotsDir) ? listFiles(shotsDir).filter((f) => isImage(f.rel)) : [];
  if (shots.length < CAPS.screenshots_min || shots.length > CAPS.screenshots_max) {
    problems.push(
      `screenshots/ must hold ${CAPS.screenshots_min} to ${CAPS.screenshots_max} images, found ${shots.length}`,
    );
  }
  for (const s of shots) {
    if (s.bytes > CAPS.screenshot_max_bytes) {
      problems.push(`screenshot ${s.rel} is ${s.bytes} bytes, over the cap of ${CAPS.screenshot_max_bytes} (256 KiB)`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Neon Swarm entry validation failed:\n - ${problems.join('\n - ')}`);
  }
  return { gameFiles: gameFiles.length, gameBytes, screenshots: shots.length };
}

const stats = validateEntry();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: CAPS.text_max_bytes,
    screenshots: { max: CAPS.screenshots_max, max_bytes: CAPS.screenshot_max_bytes },
    game_max_files: CAPS.game_max_files,
    game_max_bytes: CAPS.game_max_bytes,
    game_path_max_bytes: CAPS.game_path_max_bytes,
  }),
);

console.log(
  `Neon Swarm handed in: ${stats.gameFiles} game files (${stats.gameBytes} bytes), ` +
    `${stats.screenshots} screenshots, dossier ${statSync(dossierPath).size} bytes -> ${dossierPath}`,
);
