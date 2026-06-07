let _audioCtx = null;

export function setAudioCtx(ctx) {
  _audioCtx = ctx;
}

export function playAccessGranted() {
  if (!_audioCtx) return;
  const ac = _audioCtx;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, ac.currentTime);
  osc.frequency.setValueAtTime(659, ac.currentTime + 0.12);
  osc.frequency.setValueAtTime(784, ac.currentTime + 0.24);
  gain.gain.setValueAtTime(0.25, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.6);
}

export function playDoorUnlock1() {
  if (!_audioCtx) return;
  const ac = _audioCtx;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.15);
  gain.gain.setValueAtTime(0.08, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.2);
}

export function playDoorUnlock2() {
  if (!_audioCtx) return;
  const ac = _audioCtx;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.3);
  gain.gain.setValueAtTime(0.06, ac.currentTime);
  gain.gain.setValueAtTime(0.04, ac.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.4);
}

export function playSpaceOpen() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const clunk = ac.createOscillator();
  const cg = ac.createGain();
  clunk.type = 'square';
  clunk.frequency.setValueAtTime(90, ac.currentTime);
  clunk.frequency.exponentialRampToValueAtTime(20, ac.currentTime + 0.12);
  cg.gain.setValueAtTime(0.1, ac.currentTime);
  cg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
  clunk.connect(cg); cg.connect(ac.destination);
  clunk.start(); clunk.stop(ac.currentTime + 0.15);

  const rumble = ac.createOscillator();
  const rg = ac.createGain();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(40, ac.currentTime + 0.1);
  rumble.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 2.5);
  rg.gain.setValueAtTime(0.001, ac.currentTime);
  rg.gain.exponentialRampToValueAtTime(0.07, ac.currentTime + 0.3);
  rg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 3.5);
  rumble.connect(rg); rg.connect(ac.destination);
  rumble.start(); rumble.stop(ac.currentTime + 3.5);

  const tone = ac.createOscillator();
  const tg = ac.createGain();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(220, ac.currentTime + 0.25);
  tone.frequency.setValueAtTime(440, ac.currentTime + 1.5);
  tone.frequency.exponentialRampToValueAtTime(110, ac.currentTime + 3.0);
  tg.gain.setValueAtTime(0.001, ac.currentTime);
  tg.gain.exponentialRampToValueAtTime(0.04, ac.currentTime + 0.5);
  tg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 3.5);
  tone.connect(tg); tg.connect(ac.destination);
  tone.start(); tone.stop(ac.currentTime + 3.5);

  const ghost = ac.createOscillator();
  const ghg = ac.createGain();
  ghost.type = 'sine';
  ghost.frequency.setValueAtTime(880, ac.currentTime + 0.3);
  ghost.frequency.exponentialRampToValueAtTime(1760, ac.currentTime + 1.0);
  ghost.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 2.5);
  ghg.gain.setValueAtTime(0.001, ac.currentTime);
  ghg.gain.exponentialRampToValueAtTime(0.02, ac.currentTime + 0.4);
  ghg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 3.0);
  ghost.connect(ghg); ghg.connect(ac.destination);
  ghost.start(); ghost.stop(ac.currentTime + 3.0);
}

export function playMonitorGlitch() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, ac.currentTime);
  osc.frequency.setValueAtTime(200, ac.currentTime + 0.04);
  osc.frequency.setValueAtTime(1500, ac.currentTime + 0.06);
  osc.frequency.setValueAtTime(100, ac.currentTime + 0.08);
  osc.frequency.setValueAtTime(600, ac.currentTime + 0.1);
  gain.gain.setValueAtTime(0.06, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.2);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(1300, ac.currentTime);
  osc2.frequency.setValueAtTime(400, ac.currentTime + 0.05);
  osc2.frequency.setValueAtTime(900, ac.currentTime + 0.08);
  gain2.gain.setValueAtTime(0.04, ac.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc2.connect(gain2); gain2.connect(ac.destination);
  osc2.start(); osc2.stop(ac.currentTime + 0.2);
}

export function playItemPickup() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ac.currentTime);
  osc.frequency.setValueAtTime(220, ac.currentTime + 0.15);
  osc.frequency.setValueAtTime(500, ac.currentTime + 0.3);
  gain.gain.setValueAtTime(0.07, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.5);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(500, ac.currentTime);
  osc2.frequency.setValueAtTime(350, ac.currentTime + 0.2);
  osc2.frequency.setValueAtTime(800, ac.currentTime + 0.35);
  gain2.gain.setValueAtTime(0.04, ac.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
  osc2.connect(gain2); gain2.connect(ac.destination);
  osc2.start(); osc2.stop(ac.currentTime + 0.5);
}

export function playEyeBuzz() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const osc = ac.createOscillator();
  const lfo = ac.createOscillator();
  const gain = ac.createGain();
  const lfoGain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 45;
  lfo.type = 'sine';
  lfo.frequency.value = 8;
  lfoGain.gain.value = 25;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  gain.gain.setValueAtTime(0.05, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 5.0);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 5.0);
  lfo.start(); lfo.stop(ac.currentTime + 5.0);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 47;
  gain2.gain.setValueAtTime(0.02, ac.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 5.0);
  osc2.connect(gain2); gain2.connect(ac.destination);
  osc2.start(); osc2.stop(ac.currentTime + 5.0);
}

export function playGameOver() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 1.5);
  gain.gain.setValueAtTime(0.12, ac.currentTime);
  gain.gain.setValueAtTime(0.08, ac.currentTime + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.0);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 2.0);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(280, ac.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 1.5);
  gain2.gain.setValueAtTime(0.06, ac.currentTime);
  gain2.gain.setValueAtTime(0.04, ac.currentTime + 0.3);
  gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.0);
  osc2.connect(gain2); gain2.connect(ac.destination);
  osc2.start(); osc2.stop(ac.currentTime + 2.0);

  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 4;
  lfoGain.gain.setValueAtTime(15, ac.currentTime);
  lfoGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.5);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start(); lfo.stop(ac.currentTime + 2.0);
}

export function playDoorOpen() {
  if (!_audioCtx) return;
  const ac = _audioCtx;

  const heavy = ac.createOscillator();
  const hg = ac.createGain();
  heavy.type = 'sawtooth';
  heavy.frequency.setValueAtTime(120, ac.currentTime);
  heavy.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 1.0);
  hg.gain.setValueAtTime(0.08, ac.currentTime);
  hg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.5);
  heavy.connect(hg); hg.connect(ac.destination);
  heavy.start(); heavy.stop(ac.currentTime + 1.5);

  const creak = ac.createOscillator();
  const cg = ac.createGain();
  creak.type = 'triangle';
  creak.frequency.setValueAtTime(600, ac.currentTime);
  creak.frequency.setValueAtTime(800, ac.currentTime + 0.1);
  creak.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.8);
  cg.gain.setValueAtTime(0.04, ac.currentTime);
  cg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
  creak.connect(cg); cg.connect(ac.destination);
  creak.start(); creak.stop(ac.currentTime + 1.2);

  const thud = ac.createOscillator();
  const tg = ac.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(50, ac.currentTime);
  thud.frequency.exponentialRampToValueAtTime(20, ac.currentTime + 0.3);
  tg.gain.setValueAtTime(0.1, ac.currentTime);
  tg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  thud.connect(tg); tg.connect(ac.destination);
  thud.start(); thud.stop(ac.currentTime + 0.4);
}
