import * as THREE from 'three';
import { Timer } from './timer.js';
import { TIMER_START_SECONDS, PLAYER_SPEED } from './constants.js';
import { initScene, hallwayFlickerLights, hallwayScreenMats, ceilingFlickerLights } from './scene.js';
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

document.getElementById('game-container').appendChild(renderer.domElement);

const scene = initScene();
const camera = setupPlayer();
const controls = setupControls(camera, document.body, onLockChange);
const { interactableMeshes: _interactables, interactableData: _data } = createInteractables(scene);

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

function onLockChange(locked) {
  input.ePressed = false;
  if (gameOver) return;
  if (locked) {
    if (!gameStarted) {
      gameStarted = true;
      timer.start();
      hideStartOverlay();
    } else {
      timer.resume();
    }
  } else {
    timer.pause();
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
});

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  timer.update(delta);

  const t = clock.elapsedTime;

  hallwayFlickerLights.forEach(({ light, panel, baseIntensity, phase, isEmergency }) => {
    if (isEmergency) {
      const flicker = Math.sin(t * 8.0 + phase) * 0.3 + Math.sin(t * 13.0 + phase * 2) * 0.2;
      light.intensity = Math.max(0.1, baseIntensity + flicker);
    } else {
      const flicker = Math.sin(t * 6.0 + phase) * 1.5 + Math.sin(t * 17.0 + phase * 3) * 1.0;
      light.intensity = Math.max(0.2, baseIntensity + flicker);
    }
  });

  ceilingFlickerLights.forEach(({ light, panel, baseIntensity, phase, isDead }) => {
    if (isDead) {
      const glitch = Math.sin(t * 1.3 + phase) * Math.sin(t * 3.1 + phase);
      light.intensity = glitch > 0.85 ? 0.08 : 0.02;
    } else {
      const flicker = Math.sin(t * 2.7 + phase) * 0.08 + Math.sin(t * 5.1 + phase * 1.7) * 0.05;
      light.intensity = Math.max(0.08, baseIntensity + flicker);
    }
  });

  hallwayScreenMats.forEach((mat, i) => {
    const speeds = [0.35, 0.50, 0.30, 0.65];
    const lo = [0.02, 0.01, 0.03, 0.01];
    const hi = [0.35, 0.20, 0.40, 0.15];
    const s = speeds[i];
    const flicker = Math.sin(t * (0.8 + s * 1.3)) * Math.sin(t * (1.5 + s * 2.7)) * Math.sin(t * (2.1 + s * 4.1));
    mat.emissiveIntensity = lo[i] + Math.abs(flicker) * (hi[i] - lo[i]);
  });

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
    }

    camera.position.x += dx * PLAYER_SPEED * delta;
    camera.position.z += dz * PLAYER_SPEED * delta;
    clampPlayer(camera);

    const target = checkInteraction(camera);

    if (input.ePressed) {
      input.ePressed = false;
      if (target) {
        interact(target);
      }
    }
  }

  renderer.render(scene, camera);
}

animate();
