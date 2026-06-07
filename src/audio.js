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
