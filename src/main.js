import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Timer } from './timer.js';
import { TIMER_START_SECONDS, PLAYER_SPEED } from './constants.js';
import { initScene, hallwayFlickerLights, hallwayScreenMats, hallwayScreenMeshes, ceilingFlickerLights, roomScreenMats, roomScreenMeshes, getCurrentPreset, spawnEye, clearEye, updateAllEyes, eyeInstances, profBlinkLight, gameState, telonRef, createExtraInteractables, beamRef } from './scene.js';
import { setupPlayer, clampPlayer } from './player.js';
import { setupControls, input, requestLock, isLocked } from './controls.js';
import { createInteractables } from './interactables.js';
import { checkInteraction, interact } from './interaction.js';
import {
  showStartOverlay, hideStartOverlay, showEndOverlay,
  updateTimerDisplay, initComboUI,
} from './ui.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

document.getElementById('game-container').appendChild(renderer.domElement);

showStartOverlay();
document.getElementById('start-overlay').addEventListener('click', () => {
  requestLock();
});

initComboUI();

const scene = initScene(renderer);
const camera = setupPlayer();
const controls = setupControls(camera, document.body, onLockChange);
const { interactableMeshes: _interactables, interactableData: _data } = createInteractables(scene);
const { meshes: _extraMeshes, data: _extraData } = createExtraInteractables(scene);
_interactables.push(..._extraMeshes);
_extraData.forEach((v, k) => _data.set(k, v));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7, 0.8, 0.4
);
composer.addPass(bloomPass);

function startAudio() {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const audioCtx = listener.context;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.value = 60;
  filter.type = 'lowpass';
  filter.frequency.value = 120;
  filter.Q.value = 0.5;
  gain.gain.value = 0.03;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  return { osc, gain };
}

let audioNodes = null;

const timer = new Timer(TIMER_START_SECONDS);
timer.onTick((remaining) => {
  updateTimerDisplay(timer.formatted);
});
timer.onEnd(() => {
  gameOver = true;
  showEndOverlay();
});

const clock = new THREE.Clock();

let gameStarted = false;
let gameOver = false;
let _eyeLastSpawnR = 0;
let _eyeLastSpawnH = 0;
let _idleTime = 0;

let _telonCtx = null;
let _telonCanvas = null;
let _telonTex = null;
let _telonPassword = null;
let _telonFrameCount = 0;
let _telonGlitchType = 0;
let _telonGlitchTimer = 0;
let _telonStareTimer = 0;

function updateTelon(t, camera) {
  if (!telonRef) return;
  if (!_telonCtx) {
    _telonCanvas = document.createElement('canvas');
    _telonCanvas.width = 280;
    _telonCanvas.height = 210;
    _telonCtx = _telonCanvas.getContext('2d');
    if (!_telonCtx) return;
    _telonPassword = String(Math.floor(Math.random() * 10));
  }
  if (!gameState.projectorOn) {
    if (telonRef.material && telonRef.material.map) {
      telonRef.material.map = null;
      telonRef.material.emissiveMap = null;
      telonRef.material.emissiveIntensity = 0;
      telonRef.material.color.set(0xd8d8d8);
      telonRef.material.needsUpdate = true;
    }
    return;
  }

  const ctx = _telonCtx;
  const w = 280, h = 210;
  const fc = _telonFrameCount++;
  ctx.clearRect(0, 0, w, h);

  if (!gameState.powerConnected) {
    ctx.fillStyle = '#0000aa';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Sin Señal', w / 2, h / 2);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 - 4, cy = h / 2 + 6;
    const rx = w * 0.38, ry = h * 0.28;
    const telonWorld = new THREE.Vector3(0, 2.5, -7.5);
    const camPos = camera.position;

    if (_telonStareTimer > 0) {
      _telonStareTimer--;
    } else if (Math.random() < 0.005) {
      _telonStareTimer = 10 + Math.floor(Math.random() * 20);
    }

    let dirX, dirY;
    if (_telonStareTimer > 0) {
      dirX = (camPos.x - telonWorld.x) * 0.04;
      dirY = (camPos.y - telonWorld.y) * 0.04;
    } else {
      dirX = (camPos.x - telonWorld.x) * 0.02;
      dirY = (camPos.y - telonWorld.y) * 0.02;
    }
    const dlen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= dlen; dirY /= dlen;
    const gazeX = (_telonStareTimer > 0 ? 40 : 16) * dirX;
    const gazeY = (_telonStareTimer > 0 ? -30 : -12) * dirY;
    const ex = cx + gazeX + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 1 : 2);
    const ey = cy + gazeY + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 1 : 2);
    const jitX = Math.sin(fc * 0.11) * 2 + Math.sin(fc * 0.37) * 1;
    const jitY = Math.cos(fc * 0.13) * 1.8 + Math.cos(fc * 0.41) * 0.8;
    const spx = ex + jitX + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 0 : 3);
    const spy = ey + jitY + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 0 : 3);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const scleraR = rx * 1.3;
    const scleraGrad = ctx.createRadialGradient(ex, ey, scleraR * 0.05, ex, ey, scleraR);
    scleraGrad.addColorStop(0, '#fafafa');
    scleraGrad.addColorStop(0.4, '#e8e8e8');
    scleraGrad.addColorStop(0.7, '#b0b0b0');
    scleraGrad.addColorStop(0.9, '#666666');
    scleraGrad.addColorStop(1, '#444444');
    ctx.fillStyle = scleraGrad;
    ctx.fillRect(ex - scleraR, ey - scleraR, scleraR * 2, scleraR * 2);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let v = 0; v < 10; v++) {
      const vx = ex + (Math.random() - 0.5) * rx * 1.4;
      const vy = ey + (Math.random() - 0.5) * ry * 1.4;
      ctx.strokeStyle = `rgba(180,${20+Math.random()*30},${20+Math.random()*30},${0.12+Math.random()*0.18})`;
      ctx.lineWidth = 0.4 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      for (let s = 0; s < 4; s++) {
        ctx.lineTo(vx + (Math.random() - 0.5) * 18, vy + (Math.random() - 0.5) * 10);
      }
      ctx.stroke();
    }
    ctx.restore();

    const sphereShadow = ctx.createRadialGradient(ex - 6, ey - 4, rx * 0.15, ex, ey, rx * 1.2);
    sphereShadow.addColorStop(0, 'rgba(255,255,255,0.10)');
    sphereShadow.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    sphereShadow.addColorStop(0.7, 'rgba(0,0,0,0.08)');
    sphereShadow.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = sphereShadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const irisR = w * 0.21;
    const pupilR = w * 0.095;
    const irisGrad = ctx.createRadialGradient(ex, ey, irisR * 0.1, ex, ey, irisR);
    irisGrad.addColorStop(0, '#111111');
    irisGrad.addColorStop(0.5, '#333333');
    irisGrad.addColorStop(0.85, '#222222');
    irisGrad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR - 2, 0, Math.PI * 2);
    ctx.stroke();

    const pupilShrink = 0.65 + Math.sin(fc * 0.012) * 0.45;
    const effectivePupilR = pupilR * pupilShrink;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(spx, spy, effectivePupilR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.038, 0, Math.PI * 2);
    ctx.fill();
    const hl2Grad = ctx.createRadialGradient(spx - w * 0.025, spy - w * 0.025, 0, spx - w * 0.025, spy - w * 0.025, w * 0.038);
    hl2Grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl2Grad.addColorStop(1, 'rgba(180,200,240,0.0)');
    ctx.fillStyle = hl2Grad;
    ctx.beginPath();
    ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.arc(spx + w * 0.045, spy + w * 0.06, w * 0.012, 0, Math.PI * 2);
    ctx.fill();

    if (_telonStareTimer > 0) {
      const pulse = 0.5 + Math.sin(fc * 0.15) * 0.3;
      const eyeGlow = ctx.createRadialGradient(ex, ey, rx * 0.1, ex, ey, rx * 0.8);
      eyeGlow.addColorStop(0, `rgba(255,0,0,${0.08*pulse})`);
      eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eyeGlow;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const lidGrad = ctx.createLinearGradient(0, cy - ry, 0, cy - ry * 0.7);
    lidGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
    lidGrad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    lidGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lidGrad;
    ctx.fillRect(cx - rx - 4, cy - ry, rx * 2 + 8, ry * 0.7);
    const lowerLidGrad = ctx.createLinearGradient(0, cy + ry * 0.7, 0, cy + ry);
    lowerLidGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lowerLidGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    lowerLidGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lowerLidGrad;
    ctx.fillRect(cx - rx - 4, cy + ry * 0.7, rx * 2 + 8, ry * 0.3);
    ctx.restore();

    for (let l = 0; l < 7; l++) {
      const lx = cx - rx + 6 + l * (rx * 2 - 12) / 6;
      const ly = cy - ry + 2;
      ctx.strokeStyle = 'rgba(200,200,200,0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - 2 + Math.random(), ly - 5 - Math.random() * 4);
      ctx.stroke();
    }

    for (let sy = 0; sy < h; sy += 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, sy, w, 1);
    }
    for (let i = 0; i < 80; i++) {
      const nx = Math.random() * w;
      const ny = Math.random() * h;
      ctx.fillStyle = `rgba(${Math.random()*40},${Math.random()*60},${Math.random()*40},0.10)`;
      ctx.fillRect(nx, ny, 2, 1);
    }

    const vGrad = ctx.createRadialGradient(cx, cy, rx * 0.6, cx, cy, w * 0.8);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,15,0,0.05)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 4, ry + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const snowIntensity = 0.4 + Math.random() * 0.3;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.06*snowIntensity})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 8 + 1, Math.random() * 2 + 1);
    }
    for (let i = 0; i < 6; i++) {
      const bx = Math.random() * w;
      const by = Math.random() * h;
      ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.12})`;
      ctx.fillRect(bx, by, Math.random() * 60 + 10, Math.random() * 3 + 1);
    }
    ctx.fillStyle = `rgba(100,255,130,${Math.random()*0.015})`;
    ctx.fillRect(0, 0, w, h);

    const blinkPhase = fc % 210;
    if (blinkPhase < 14) {
      const bp = blinkPhase / 14;
      const lidH = bp < 0.5 ? bp * 2 * ry * 2.2 : (1 - bp) * 2 * ry * 2.2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, lidH);
      ctx.fillRect(0, h - lidH * 0.6, w, lidH * 0.6);
    }

    if (_telonGlitchTimer > 0) {
      _telonGlitchTimer--;
      const gt = _telonGlitchType;
      if (gt === 1) {
        const bandY = Math.random() * h;
        const bandH = 4 + Math.random() * 20;
        const shift = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 30);
        const imgData = ctx.getImageData(0, bandY, w, bandH);
        ctx.putImageData(imgData, shift, bandY);
      } else if (gt === 2) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        const shift = 8;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const ri = (y * w + Math.max(0, x - shift)) * 4;
            const bi = (y * w + Math.min(w - 1, x + shift)) * 4;
            if (x >= shift) d[i] = d[ri];
            if (x + shift < w) d[i + 2] = d[bi + 2];
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } else if (gt === 3) {
        for (let i = 0; i < 60; i++) {
          const nx = Math.random() * w, ny = Math.random() * h;
          ctx.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},${0.2+Math.random()*0.4})`;
          ctx.fillRect(nx, ny, 2 + Math.random() * 8, 1 + Math.random() * 4);
        }
      } else if (gt === 4) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 80; i++) {
          ctx.fillStyle = `rgba(${80+Math.random()*80},${80+Math.random()*80},${80+Math.random()*80},${Math.random()*0.5})`;
          ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }
      }
    } else if (Math.random() < 0.015) {
      _telonGlitchType = 1 + Math.floor(Math.random() * 4);
      _telonGlitchTimer = 6 + Math.floor(Math.random() * 20);
    }

    if (camera.position.distanceTo(telonWorld) < 3) {
      ctx.fillStyle = '#33ff33';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#33ff33';
      ctx.shadowBlur = 8;
      ctx.fillText(_telonPassword, w / 2, h / 2 + 4);
      ctx.shadowBlur = 0;
    }
  }

  if (!_telonTex) {
    _telonTex = new THREE.CanvasTexture(_telonCanvas);
    _telonTex.minFilter = THREE.LinearFilter;
    _telonTex.magFilter = THREE.LinearFilter;
  }
  _telonTex.needsUpdate = true;
  telonRef.material.map = _telonTex;
  telonRef.material.emissiveMap = _telonTex;
  telonRef.material.emissive.set(0xffffff);
  telonRef.material.emissiveIntensity = 1.5;
  telonRef.material.needsUpdate = true;
}

const _blinkState = [];
function ensureBlinkState(count) {
  while (_blinkState.length < count) {
    _blinkState.push({
      nextT: 2 + Math.random() * 10,
      duration: 0.15 + Math.random() * 0.45,
      blinking: false,
      startT: 0,
      flutter: Math.random() < 0.25,
      flutterCount: 0,
      flutterMax: 2 + Math.floor(Math.random() * 2),
      flutterGap: 0.08 + Math.random() * 0.15,
    });
  }
}


function onLockChange(locked) {
  input.ePressed = false;
  if (gameOver) return;
  if (locked) {
    if (!gameStarted) {
      gameStarted = true;
      timer.start();
      hideStartOverlay();
      audioNodes = startAudio();
    } else {
      timer.resume();
      if (audioNodes) audioNodes.gain.gain.value = 0.03;
    }
  } else {
    timer.pause();
    if (audioNodes) audioNodes.gain.gain.value = 0;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  timer.update(delta);

  const t = clock.elapsedTime;

  hallwayFlickerLights.forEach((item) => {
    if (item.isEmergency) {
      const flicker = Math.sin(t * 8.0 + item.phase) * 0.3 + Math.sin(t * 13.0 + item.phase * 2) * 0.2;
      item.light.intensity = Math.max(0.1, item.baseIntensity + flicker);
    } else {
      const flicker = Math.sin(t * 6.0 + item.phase) * 1.5 + Math.sin(t * 17.0 + item.phase * 3) * 1.0;
      item.light.intensity = Math.max(0.2, item.baseIntensity + flicker);
    }
  });

  ceilingFlickerLights.forEach((item) => {
    if (getCurrentPreset() === 'default') {
      item.light.intensity = item.baseIntensity;
    } else if (item.isDead) {
      const glitch = Math.sin(t * 1.3 + item.phase) * Math.sin(t * 3.1 + item.phase);
      item.light.intensity = glitch > 0.85 ? 0.08 : 0.02;
    } else {
      const flicker = Math.sin(t * 2.7 + item.phase) * 0.08 + Math.sin(t * 5.1 + item.phase * 1.7) * 0.05;
      item.light.intensity = Math.max(0.08, item.baseIntensity + flicker);
    }
  });

  hallwayScreenMats.forEach((mat, i) => {
    const speeds = [0.35, 0.50, 0.30, 0.65];
    const lo = [0.01, 0.01, 0.02, 0.01];
    const hi = [0.18, 0.10, 0.20, 0.08];
    const s = speeds[i];
    const flicker = Math.sin(t * (0.8 + s * 1.3)) * Math.sin(t * (1.5 + s * 2.7)) * Math.sin(t * (2.1 + s * 4.1));
    mat.emissiveIntensity = lo[i] + Math.abs(flicker) * (hi[i] - lo[i]);
  });

  ensureBlinkState(roomScreenMats.length);
  roomScreenMats.forEach((mat, i) => {
    if (mat.map) return;
    const bl = _blinkState[i];
    if (!bl.blinking && t >= bl.nextT) {
      bl.blinking = true;
      bl.startT = t;
    }
    if (bl.blinking) {
      const elapsed = t - bl.startT;
      if (elapsed > bl.duration) {
        bl.blinking = false;
        if (bl.flutter && bl.flutterCount < bl.flutterMax) {
          bl.flutterCount++;
          bl.nextT = t + bl.flutterGap;
          bl.duration = 0.1 + Math.random() * 0.2;
        } else {
          bl.flutterCount = 0;
          bl.nextT = t + 2 + Math.random() * 10;
          bl.duration = 0.15 + Math.random() * 0.45;
        }
      } else {
        const p = elapsed / bl.duration;
        const blinkVal = Math.sin(p * Math.PI);
        mat.emissiveIntensity = blinkVal * 0.06;
        return;
      }
    }
    const flicker = Math.sin(t * (1.0 + i * 0.2)) * Math.sin(t * (2.0 + i * 0.5)) * Math.sin(t * (3.5 + i * 0.7));
    mat.emissiveIntensity = Math.abs(flicker) * 0.09;
  });

  updateAllEyes(camera);

  const roomEyes = eyeInstances.filter(e => e.type === 'room');
  if (roomEyes.length < 4 && t - _eyeLastSpawnR > 8 && roomScreenMeshes.length > 0) {
    spawnEye(roomScreenMeshes, roomScreenMats, 'room');
    _eyeLastSpawnR = t;
  }

  const hwEyes = eyeInstances.filter(e => e.type === 'hallway');
  if (hwEyes.length < 1 && t - _eyeLastSpawnH > 25 && hallwayScreenMeshes.length > 0) {
    spawnEye(hallwayScreenMeshes, hallwayScreenMats, 'hallway');
    _eyeLastSpawnH = t;
  }

  for (let i = eyeInstances.length - 1; i >= 0; i--) {
    if (eyeInstances[i].frameCount > 1200) {
      clearEye(eyeInstances[i]);
    }
  }

  if (profBlinkLight) {
    const flicker = Math.sin(t * 5.0 + profBlinkLight.phase) * 0.5 + Math.sin(t * 11.0 + profBlinkLight.phase * 2) * 0.3;
    if (!gameState.powerConnected) {
      profBlinkLight.light.material.emissiveIntensity = Math.max(0.2, profBlinkLight.baseIntensity + flicker);
    }
  }

  if (telonRef) {
    updateTelon(t, camera);
  }

  if (beamRef) {
    beamRef.visible = gameState.projectorOn;
  }

  if (isLocked() && !gameOver) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    let dx = 0, dz = 0;

    if (input.w) { dx += forward.x; dz += forward.z; }
    if (input.s) { dx -= forward.x; dz -= forward.z; }
    if (input.a) { dx -= right.x;   dz -= right.z; }
    if (input.d) { dx += right.x;   dz += right.z; }

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
      _idleTime = 0;
    } else {
      _idleTime += delta;
    }

    camera.position.x += dx * PLAYER_SPEED * delta;
    camera.position.z += dz * PLAYER_SPEED * delta;
    clampPlayer(camera);

    if (_idleTime > 0.5) {
      camera.position.y += Math.sin(t * 1.3) * 0.008 + Math.cos(t * 0.7) * 0.005;
      camera.position.x += Math.sin(t * 0.9) * 0.004;
    }

    const target = checkInteraction(camera);

    if (input.ePressed) {
      input.ePressed = false;
      if (target) {
        interact(target);
      }
    }
  }

  composer.render();
}

animate();
