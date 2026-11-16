// Neon Swarm — synthesised sound. Every effect and the bass-driven music loop
// are generated with the Web Audio API: no audio files, nothing to download, so
// the game stays fully offline. The context is created lazily on the player's
// first gesture, as browsers require, and every call is a no-op before that.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  const lastPlayed = new Map();

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startMusic();
    return true;
  }

  function throttle(name, ms) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? 0) < ms) return true;
    lastPlayed.set(name, now);
    return false;
  }

  function tone(freq, dur, type = 'square', vol = 0.16, slideTo = null, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.2, freq = 900, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(90, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  // The world's event stream, turned into sound.
  function play(name) {
    if (!ctx || muted) return;
    switch (name) {
      case 'shoot':
        if (!throttle('shoot', 50)) tone(840 + Math.random() * 120, 0.07, 'square', 0.045, 240);
        break;
      case 'explosion':
        if (!throttle('explosion', 55)) noise(0.22, 0.16, 1100);
        break;
      case 'hit':
        tone(160, 0.25, 'sawtooth', 0.22, 50);
        noise(0.3, 0.2, 700);
        break;
      case 'shieldbreak':
        tone(1250, 0.18, 'triangle', 0.2, 300);
        noise(0.12, 0.1, 2600);
        break;
      case 'dash':
        if (!throttle('dash', 90)) tone(220, 0.14, 'sine', 0.14, 660);
        break;
      case 'pickup':
        tone(660, 0.08, 'triangle', 0.14);
        tone(990, 0.12, 'triangle', 0.14, null, 0.07);
        break;
      case 'wave':
        tone(440, 0.1, 'triangle', 0.1);
        tone(440, 0.1, 'triangle', 0.1, null, 0.14);
        break;
      case 'waveclear':
        [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, null, i * 0.08));
        break;
      case 'tier':
        [587, 880].forEach((f, i) => tone(f, 0.1, 'square', 0.07, null, i * 0.06));
        break;
      case 'bosswarn':
        tone(98, 0.34, 'sawtooth', 0.2);
        tone(98, 0.34, 'sawtooth', 0.2, null, 0.42);
        break;
      case 'boss':
        tone(65, 0.5, 'sawtooth', 0.24, 40);
        noise(0.5, 0.14, 300);
        break;
      case 'bossshot':
        if (!throttle('bossshot', 120)) tone(300, 0.09, 'square', 0.05, 140);
        break;
      case 'bossdown':
        noise(0.8, 0.3, 1400);
        tone(392, 0.16, 'triangle', 0.16, null, 0.1);
        tone(523, 0.16, 'triangle', 0.16, null, 0.22);
        tone(659, 0.16, 'triangle', 0.16, null, 0.34);
        tone(784, 0.3, 'triangle', 0.18, null, 0.46);
        break;
      case 'gameover':
        [440, 349, 262, 196].forEach((f, i) => tone(f, 0.24, 'sawtooth', 0.12, null, i * 0.17));
        break;
    }
  }

  // A minimal step-sequenced synthwave loop: a driving bass line in A minor
  // with a soft hat on the off-beats, scheduled a little ahead of the clock.
  const BASS = [55, 0, 55, 55, 0, 55, 0, 65.4, 55, 0, 55, 55, 0, 82.4, 0, 73.4];
  function startMusic() {
    if (musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.06;
    step = 0;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      const stepDur = 60 / 132 / 2; // 132 bpm, eighth notes
      while (nextNoteTime < ctx.currentTime + 0.14) {
        const delay = Math.max(0, nextNoteTime - ctx.currentTime);
        const f = BASS[step % BASS.length];
        if (f) tone(f, stepDur * 0.95, 'sawtooth', 0.055, null, delay);
        if (step % 2 === 1) noise(0.03, 0.016, 6000, delay);
        if (step % 16 === 0) tone(220, 0.4, 'sine', 0.035, null, delay);
        nextNoteTime += stepDur;
        step += 1;
      }
    }, 40);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { ensure, play, toggleMute, isMuted: () => muted };
}
