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

  const hits = raycaster.intersectObjects(interactableMeshes);

  if (hits.length > 0 && hits[0].distance <= INTERACTION_RANGE) {
    const mesh = hits[0].object;
    const data = interactableData.get(mesh);
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
  if (current && current.message) {
    showMessage(current.message);
  }
}
