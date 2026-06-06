import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Timer } from './timer.js';
import { TIMER_START_SECONDS, PLAYER_SPEED } from './constants.js';
import { initScene, hallwayFlickerLights, hallwayScreenMats, hallwayScreenMeshes, ceilingFlickerLights, roomScreenMats, roomScreenMeshes, getCurrentPreset, spawnEye, clearEye, updateAllEyes, eyeInstances } from './scene.js';
import { setupPlayer, clampPlayer } from './player.js';
import { setupControls, input, requestLock, isLocked } from './controls.js';
import { createInteractables } from './interactables.js';
import { checkInteraction, interact } from './interaction.js';
import {
  showStartOverlay, hideStartOverlay, showEndOverlay,
  updateTimerDisplay,
} from './ui.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

document.getElementById('game-container').appendChild(renderer.domElement);

const scene = initScene(renderer);
const camera = setupPlayer();
const controls = setupControls(camera, document.body, onLockChange);
const { interactableMeshes: _interactables, interactableData: _data } = createInteractables(scene);

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

showStartOverlay();

document.getElementById('start-overlay').addEventListener('click', () => {
  requestLock();
});

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
