import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { MOUSE_SENSITIVITY } from './constants.js';

export const input = {
  w: false, a: false, s: false, d: false,
  ePressed: false,
};

let controls = null;
let onLockChange = null;

export function setupControls(camera, domElement, lockCallback) {
  controls = new PointerLockControls(camera, domElement);
  onLockChange = lockCallback;

  controls.pointerSpeed = MOUSE_SENSITIVITY;

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === domElement;
    if (onLockChange) onLockChange(locked);
  });

  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    input.w = true; break;
      case 'KeyA': case 'ArrowLeft':  input.a = true; break;
      case 'KeyS': case 'ArrowDown':  input.s = true; break;
      case 'KeyD': case 'ArrowRight': input.d = true; break;
      case 'KeyE': input.ePressed = true; break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    input.w = false; break;
      case 'KeyA': case 'ArrowLeft':  input.a = false; break;
      case 'KeyS': case 'ArrowDown':  input.s = false; break;
      case 'KeyD': case 'ArrowRight': input.d = false; break;
    }
  });

  document.addEventListener('click', () => {
    if (!controls.isLocked) {
      const co = document.getElementById('combo-overlay');
      if (!co || !co.classList.contains('active')) {
        controls.lock();
      }
    }
  });

  return controls;
}

export function requestLock() {
  if (controls) controls.lock();
}

export function releaseLock() {
  if (controls) controls.unlock();
}

export function isLocked() {
  return controls ? controls.isLocked : false;
}
