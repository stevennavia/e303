import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS, WALKABLE } from './constants.js';

export function setupPlayer() {
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );

  camera.position.set(0, PLAYER_HEIGHT, 0);

  return camera;
}

export function clampPlayer(camera) {
  camera.position.x = Math.max(WALKABLE.minX, Math.min(WALKABLE.maxX, camera.position.x));
  camera.position.z = Math.max(WALKABLE.minZ, Math.min(WALKABLE.maxZ, camera.position.z));
  camera.position.y = PLAYER_HEIGHT;
}
