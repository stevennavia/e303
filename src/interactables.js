import * as THREE from 'three';
import { setLightingPreset, getCurrentPreset } from './scene.js';

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

  const switchGroup = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.2 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), plateMat);
  switchGroup.add(plate);

  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x33ff33,
    emissive: 0x33ff33,
    emissiveIntensity: 2.0,
  });
  const ledIndicator = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), ledMat);
  ledIndicator.position.set(0, 0.04, -0.02);
  switchGroup.add(ledIndicator);

  switchGroup.position.set(1.5, 1.4, 6.9);
  scene.add(switchGroup);

  interactableMeshes.push(pizarra, monitor, puerta, switchGroup);

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

  interactableData.set(switchGroup, {
    id: 'lightswitch',
    label: 'interruptor',
    message: 'Luces encendidas.',
    action() {
      const next = getCurrentPreset() === 'default' ? 'blackout' : 'default';
      setLightingPreset(next);
      if (next === 'blackout') {
        ledMat.color.set(0xff2200);
        ledMat.emissive.set(0xff2200);
        this.message = 'Corte de luz activado.';
      } else {
        ledMat.color.set(0x33ff33);
        ledMat.emissive.set(0x33ff33);
        this.message = 'Luces restauradas.';
      }
    },
  });

  return { interactableMeshes, interactableData };
}

export { interactableMeshes, interactableData };
