import * as THREE from 'three';
import { INTERACTION_RANGE } from './constants.js';
import { interactableMeshes, interactableData } from './interactables.js';
import { showMessage, showInteractionPrompt } from './ui.js';

const raycaster = new THREE.Raycaster();
const _direction = new THREE.Vector3();

let currentTarget = null;

export function checkInteraction(camera) {
  camera.getWorldDirection(_direction);
  raycaster.set(camera.position, _direction);

  const hits = raycaster.intersectObjects(interactableMeshes, true);

  if (hits.length > 0 && hits[0].distance <= INTERACTION_RANGE) {
    let mesh = hits[0].object;
    while (mesh && !interactableData.has(mesh)) {
      mesh = mesh.parent;
    }
    const data = mesh ? interactableData.get(mesh) : null;
    if (data && currentTarget !== data) {
      currentTarget = data;
      showInteractionPrompt('Presiona E para interactuar');
    }
  } else {
    if (currentTarget !== null) {
      currentTarget = null;
      showInteractionPrompt(null);
    }
  }

  return currentTarget;
}

export function interact(current) {
  if (current) {
    if (current.action) {
      current.action();
    }
    if (current.message) {
      showMessage(current.message);
    }
  }
}
