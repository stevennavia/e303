import * as THREE from 'three';

const interactableMeshes = [];
const interactableData = new Map();

export function createInteractables(scene) {
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.7 });
  const grayMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });
  const brownMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });

  const pizarra = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.15), greenMat);
  pizarra.position.set(0, 1.5, -5.6);

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.8), grayMat);
  monitor.position.set(-5.6, 1.2, -1.5);

  const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.6), brownMat);
  puerta.position.set(0, 1.05, 6.0);
  puerta.rotation.y = Math.PI / 2;
  puerta.material.transparent = true;
  puerta.material.opacity = 0;
  puerta.material.depthWrite = false;

  scene.add(pizarra, monitor, puerta);

  interactableMeshes.push(pizarra, monitor, puerta);

  interactableData.set(pizarra, {
    id: 'pizarra',
    label: 'pizarra',
    message: 'La pizarra parece incompleta.',
  });

  interactableData.set(monitor, {
    id: 'monitor',
    label: 'monitor',
    message: 'El monitor est\u00e1 apagado.',
  });

  interactableData.set(puerta, {
    id: 'puerta',
    label: 'puerta',
    message: 'La puerta est\u00e1 cerrada.',
  });

  return { interactableMeshes, interactableData };
}

export { interactableMeshes, interactableData };
