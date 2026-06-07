import * as THREE from 'three';
import { setLightingPreset, getCurrentPreset, gameState, connectPower, setWhiteboardGlow } from './scene.js';
import { showComboUI, hideComboUI, showMessage } from './ui.js';
import { playAccessGranted, playDoorUnlock1, playDoorUnlock2 } from './audio.js';

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

  const puerta = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.15), brownMat);
  puerta.position.set(0, 1.2, 6.0);
  puerta.material.transparent = true;
  puerta.material.opacity = 0.3;
  puerta.material.depthWrite = false;

  const switchGroup = new THREE.Group();
  const switchBackPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.30, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.3 })
  );
  switchGroup.add(switchBackPlate);

  const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.2 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), plateMat);
  plate.position.set(0, 0.03, -0.03);
  switchGroup.add(plate);

  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x33ff33,
    emissive: 0x33ff33,
    emissiveIntensity: 2.0,
  });
  const ledIndicator = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), ledMat);
  ledIndicator.position.set(0, 0.04, -0.05);
  switchGroup.add(ledIndicator);

  const cableMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const switchCable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.25, 6),
    cableMat
  );
  switchCable.position.set(0, -0.775, -0.01);
  switchGroup.add(switchCable);

  switchGroup.position.set(-1.5, 1.4, 6.9);
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
    message: '',
    action() {
      if (gameState.doorUnlocked) {
        showMessage('La puerta ya est\u00e1 abierta.');
        return;
      }
      showMessage('Puerta cerrada, necesito c\u00f3digo');
    },
  });

  interactableData.set(switchGroup, {
    id: 'lightswitch',
    label: 'interruptor',
    message: '',
    action() {
      const next = getCurrentPreset() === 'default' ? 'blackout' : 'default';
      setLightingPreset(next);
      setWhiteboardGlow(next === 'blackout' ? 1.8 : 0.02);
      if (next === 'blackout') {
        ledMat.color.set(0xff2200);
        ledMat.emissive.set(0xff2200);
      } else {
        ledMat.color.set(0x33ff33);
        ledMat.emissive.set(0x33ff33);
      }
    },
  });

  const profMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.24, 0.06), grayMat);
  profMonitor.position.set(6.0, 1.08, -6.0);
  profMonitor.visible = false;

  const profTower = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.45, 0.32), grayMat);
  profTower.position.set(5.55, 1.05, -5.5);
  profTower.visible = false;

  scene.add(profMonitor, profTower);
  interactableMeshes.push(profMonitor, profTower);

  interactableData.set(profMonitor, {
    id: 'profMonitor',
    label: 'monitor del profesor',
    message: 'Equipo sin corriente.',
    action() {
      if (!gameState.powerConnected) {
        this.message = 'Equipo sin corriente.';
      } else if (!gameState.projectorOn) {
        this.message = 'Proyector apagado.';
      } else {
        this.message = 'Proyector activo \u2014 mir\u00e1 el tel\u00f3n.';
      }
    },
  });

  interactableData.set(profTower, {
    id: 'profTower',
    label: 'torre del profesor',
    message: 'Equipo sin corriente.',
    action() {
      if (!gameState.powerConnected) {
        this.message = 'Equipo sin corriente.';
      } else {
        this.message = 'La torre est\u00e1 funcionando.';
      }
    },
  });

  const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.02), grayMat);
  outlet.position.set(7.1, 0.04, -6.5);
  outlet.visible = false;

  scene.add(outlet);
  interactableMeshes.push(outlet);

  interactableData.set(outlet, {
    id: 'outlet',
    label: 'enchufe',
    message: 'Presiona E para conectar',
    action() {
      if (gameState.powerConnected) {
        this.message = 'El enchufe ya est\u00e1 conectado.';
        return;
      }
      connectPower();
      this.message = 'Equipo conectado.';
    },
  });

  const comboGroup = new THREE.Group();
  comboGroup.position.set(1.5, 1.4, 6.9);

  const comboBackPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.30, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.3 })
  );
  comboGroup.add(comboBackPlate);

  const comboBtnMat = new THREE.MeshStandardMaterial({
    color: 0xDDDDDD,
    emissive: 0x444444,
    emissiveIntensity: 0.5,
    roughness: 0.08,
    metalness: 0.95,
  });
  const comboBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.025, 32),
    comboBtnMat
  );
  comboBtn.rotation.x = Math.PI / 2;
  comboBtn.position.set(0, 0.03, -0.03);
  comboGroup.add(comboBtn);

  const comboRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.006, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.2, metalness: 0.8 })
  );
  comboRing.position.set(0, 0.03, -0.045);
  comboGroup.add(comboRing);

  const comboCable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.25, 6),
    cableMat
  );
  comboCable.position.set(0, -0.775, -0.01);
  comboGroup.add(comboCable);

  scene.add(comboGroup);

  interactableMeshes.push(comboBtn);
  interactableData.set(comboBtn, {
    id: 'comboButton',
    label: '',
    message: '',
    action() {
      showComboUI(gameState.combinationDigits, null, (entered, correct) => {
          if (entered.violet === correct.violet &&
              entered.red === correct.red &&
              entered.green === correct.green &&
              entered.blue === correct.blue) {
            gameState.doorUnlocked = true;
            playAccessGranted();
            playDoorUnlock1();
            playDoorUnlock2();
            hideComboUI();
          }
      });
    },
  });

  return { interactableMeshes, interactableData };
}

export { interactableMeshes, interactableData };
