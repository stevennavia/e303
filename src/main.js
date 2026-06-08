import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Timer } from './timer.js';
import { TIMER_START_SECONDS, PLAYER_SPEED, PLAYER_RADIUS } from './constants.js';
import { initScene, hallwayFlickerLights, hallwayScreenMats, hallwayScreenMeshes, ceilingFlickerLights, roomScreenMats, roomScreenMeshes, getCurrentPreset, setLightingPreset, spawnEye, clearEye, updateAllEyes, eyeInstances, profBlinkLight, gameState, telonRef, createExtraInteractables, beamRef, bluePuzzleChairRefs, violetEyeState, spawnVioletEye, clearVioletEye, questionMonitorSpawn, questionMonitorClear, questionMonitorState, updateQuestionGlitch, deskColliders, setWhiteboardGlow, victoryDoorRef, doorEyeMeshRef, starfieldRef, blueTexRef, blueScreenIdxRef, violetTexRef, violetScreenIdxRef } from './scene.js';
import { setupPlayer, clampPlayer } from './player.js';
import { setupControls, input, requestLock, isLocked } from './controls.js';
import { createInteractables } from './interactables.js';
import { checkInteraction, interact } from './interaction.js';
import { setAudioCtx, playMonitorGlitch, playEyeBuzz, playGameOver } from './audio.js';
import {
  showStartOverlay, hideStartOverlay, showEndOverlay,
  updateTimerDisplay, initComboUI, showMessage,
  showClueUI, hideClueUI, initClueUI,
} from './ui.js';

const mobileBlock = document.getElementById('mobile-block');
if (window.innerWidth < 768) {
  mobileBlock.style.display = 'flex';
  throw new Error('Mobile not supported');
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

document.getElementById('game-container').appendChild(renderer.domElement);

let gameOver = false;

showStartOverlay();

document.getElementById('start-overlay').addEventListener('click', () => {
  requestLock();
});

document.getElementById('dev-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  gameState.codeValidated = true;
  requestLock();
});

initComboUI();
initClueUI();

const scene = initScene(renderer);
const camera = setupPlayer();
gameState.camera = camera;
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

const chromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0 },
    time: { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5);
      float dist = length(dir);
      float a = amount * (0.8 + 0.4 * sin(time * 3.0));
      vec2 offset = dir * dist * a;
      float r = texture2D(tDiffuse, vUv + offset * 1.2).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset * 1.2).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};
const chromaticPass = new ShaderPass(chromaticAberrationShader);
composer.addPass(chromaticPass);
composer.addPass(new OutputPass());

const flashLight = new THREE.SpotLight(0xffeecc, 0, 15, 0.5, 0.4, 1);
flashLight.target.position.set(0, 0, -1);
scene.add(flashLight);
scene.add(flashLight.target);

function startAudio() {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const audioCtx = listener.context;
  setAudioCtx(audioCtx);
  _audioCtx = audioCtx;
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

let _audioCtx = null;

let audioNodes = null;

const timer = new Timer(TIMER_START_SECONDS);
gameState.timer = timer;
timer.onTick((remaining) => {
  updateTimerDisplay(timer.formatted);
});
timer.onEnd(() => {
  gameOver = true;
  playGameOver();
  showEndOverlay();
});

const clock = new THREE.Clock();

let gameStarted = false;
let _eyeLastSpawnR = -5;
let _eyeLastSpawnH = 0;
let _questionTimer = 12;
let _flickerTimer = 5;
let _glitchTimer = 0;
let _flashlightMsgShown = false;
let _wasProjectorBlackout = false;

let _greenCodeAssigned = false;
let _telonBuzzPlayed = false;

let _telonCtx = null;
let _telonCanvas = null;
let _telonTex = null;
let _telonPassword = null;
let _telonFrameCount = 0;
let _telonGlitchType = 0;
let _telonGlitchTimer = 0;
let _telonStareTimer = 0;
let _telonBlinkTimer = 120;
let _telonBlinkPhase = 0;
let _telonEmotion = { current: 'neutral', target: 'neutral', blend: 0, _alarmTimer: 0 };

const TELON_EMOTIONS = {
  neutral: { ryScale: 1, pupilScale: 1, scleraRed: 0, browRaise: 0, blinkSpeed: 1, gazeIntensity: 0.02, jitter: 1 },
  alarm: { ryScale: 1.25, pupilScale: 1.3, scleraRed: 0.25, browRaise: 0.2, blinkSpeed: 1.5, gazeIntensity: 0.04, jitter: 0.5 },
  malice: { ryScale: 0.8, pupilScale: 0.8, scleraRed: 0.15, browRaise: -0.15, blinkSpeed: 0.7, gazeIntensity: 0.04, jitter: 0.3 },
  fear: { ryScale: 1.35, pupilScale: 1.5, scleraRed: 0.45, browRaise: 0.3, blinkSpeed: 2, gazeIntensity: 0.01, jitter: 1.5 },
  anger: { ryScale: 0.65, pupilScale: 0.65, scleraRed: 0.55, browRaise: -0.25, blinkSpeed: 0.5, gazeIntensity: 0.04, jitter: 0 },
};

function updateTelonEmotion(camera, telonPos) {
  const e = _telonEmotion;
  if (e.current !== e.target) {
    e.blend += 0.03;
    if (e.blend >= 1) { e.blend = 0; e.current = e.target; }
  }
  const dist = camera.position.distanceTo(telonPos);
  if (dist < 1.8 && e.target !== 'fear') setTelonEmotion('fear');
  else if (dist < 3 && e.current === 'neutral') setTelonEmotion('alarm');
  else if (dist > 6 && e.current !== 'neutral' && e.current === e.target) setTelonEmotion('neutral');

  if (_telonStareTimer > 30 && Math.random() < 0.003 && e.target === 'neutral') setTelonEmotion('malice');
  if (_telonStareTimer > 50 && e.target === 'malice' && Math.random() < 0.004) setTelonEmotion('anger');

  if (Math.random() < 0.002 && e.target === 'neutral') { setTelonEmotion('alarm'); e._alarmTimer = 30; }
  if (e._alarmTimer > 0) { e._alarmTimer--; if (e._alarmTimer === 0) setTelonEmotion('neutral'); }
}

function setTelonEmotion(target) {
  if (_telonEmotion.target === target) return;
  _telonEmotion.current = _telonEmotion.target;
  _telonEmotion.target = target;
  _telonEmotion.blend = 0;
}

function getTelonEmotionParams() {
  const e = _telonEmotion;
  const from = TELON_EMOTIONS[e.current] || TELON_EMOTIONS.neutral;
  const to = TELON_EMOTIONS[e.target] || TELON_EMOTIONS.neutral;
  const b = e.blend;
  return {
    ryScale: from.ryScale + (to.ryScale - from.ryScale) * b,
    pupilScale: from.pupilScale + (to.pupilScale - from.pupilScale) * b,
    scleraRed: from.scleraRed + (to.scleraRed - from.scleraRed) * b,
    browRaise: from.browRaise + (to.browRaise - from.browRaise) * b,
    blinkSpeed: from.blinkSpeed + (to.blinkSpeed - from.blinkSpeed) * b,
    gazeIntensity: from.gazeIntensity + (to.gazeIntensity - from.gazeIntensity) * b,
    jitter: from.jitter + (to.jitter - from.jitter) * b,
  };
}

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
    _greenCodeAssigned = false;
    _telonBuzzPlayed = false;
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
    const rx = w * 0.38;
    const telonWorld = new THREE.Vector3(0, 2.5, -7.5);
    const camPos = camera.position;

    updateTelonEmotion(camera, telonWorld);
    const tep = getTelonEmotionParams();
    const ry = h * 0.28 * tep.ryScale;
    const gazeScale = tep.gazeIntensity;

    if (_telonStareTimer > 0) {
      _telonStareTimer--;
    } else if (Math.random() < 0.005) {
      _telonStareTimer = 10 + Math.floor(Math.random() * 20);
    }

    let dirX, dirY;
    if (_telonStareTimer > 0) {
      dirX = (camPos.x - telonWorld.x) * (gazeScale * 2);
      dirY = (camPos.y - telonWorld.y) * (gazeScale * 2);
    } else {
      dirX = (camPos.x - telonWorld.x) * gazeScale;
      dirY = (camPos.y - telonWorld.y) * gazeScale;
    }
    const dlen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= dlen; dirY /= dlen;
    const gazeX = (_telonStareTimer > 0 ? 40 : 16) * dirX;
    const gazeY = (_telonStareTimer > 0 ? -30 : -12) * dirY;
    const ex = cx + gazeX + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 1 : 2);
    const ey = cy + gazeY + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 1 : 2);

    const microX = Math.sin(fc * 0.73) * 2.5 + Math.sin(fc * 1.51) * 2.0;
    const microY = Math.cos(fc * 0.61) * 2.0 + Math.cos(fc * 1.43) * 1.5;

    const jitX = (Math.sin(fc * 0.11) * 2 + Math.sin(fc * 0.37) * 1) * tep.jitter;
    const jitY = (Math.cos(fc * 0.13) * 1.8 + Math.cos(fc * 0.41) * 0.8) * tep.jitter;
    const spx = ex + jitX + microX + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 0 : 3);
    const spy = ey + jitY + microY + (Math.random() - 0.5) * (_telonStareTimer > 0 ? 0 : 3);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const scleraR = rx * 1.3;
    const scleraGrad = ctx.createRadialGradient(ex, ey, scleraR * 0.05, ex, ey, scleraR);
    scleraGrad.addColorStop(0, '#f5f0e8');
    scleraGrad.addColorStop(0.4, '#e8e0d5');
    scleraGrad.addColorStop(0.7, '#cdc0b0');
    scleraGrad.addColorStop(0.9, '#b8a898');
    scleraGrad.addColorStop(1, '#a09080');
    ctx.fillStyle = scleraGrad;
    ctx.fillRect(ex - scleraR, ey - scleraR, scleraR * 2, scleraR * 2);

    for (let c = 0; c < 2; c++) {
      const side = c === 0 ? -1 : 1;
      const cg = ctx.createRadialGradient(ex + side * rx * 0.8, ey + ry * 0.1, 0, ex + side * rx * 0.8, ey + ry * 0.1, rx * 0.4);
      cg.addColorStop(0, 'rgba(180,120,100,0.25)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(ex + side * rx * 0.8, ey + ry * 0.1, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let v = 0; v < 8; v++) {
      const angle = Math.random() * Math.PI - Math.PI / 2;
      const dist = rx * (0.6 + Math.random() * 0.5);
      const startX = ex + Math.cos(angle) * dist;
      const startY = ey + Math.sin(angle) * dist;
      const pulse = 0.7 + Math.sin(fc * 0.05 + v * 3) * 0.3;
      ctx.strokeStyle = `rgba(${180 + tep.scleraRed * 100},${Math.floor(15 - tep.scleraRed * 10)},${Math.floor(15 - tep.scleraRed * 10)},${(0.25 + Math.random() * 0.2 + tep.scleraRed * 0.3) * pulse})`;
      ctx.lineWidth = 0.5 + Math.random() * 1.0;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      const steps = 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < steps; s++) {
        const cpX = startX + (Math.random() - 0.5) * rx * 0.4;
        const cpY = startY + (Math.random() - 0.5) * ry * 0.5;
        const endX = startX + (Math.cos(angle + (Math.random() - 0.5) * 0.5)) * (dist + rx * 0.6);
        const endY = startY + (Math.sin(angle + (Math.random() - 0.5) * 0.5)) * (dist + ry * 0.6);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
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
    irisGrad.addColorStop(0.05, '#3a3020');
    irisGrad.addColorStop(0.3, '#4a3d28');
    irisGrad.addColorStop(0.6, '#3d3220');
    irisGrad.addColorStop(0.85, '#2a2215');
    irisGrad.addColorStop(1, '#1a150e');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2 + Math.sin(fc * 0.008 + i * 0.3) * 0.08;
      const r1 = irisR * 0.15;
      const r2 = irisR * (0.3 + Math.random() * 0.55);
      ctx.strokeStyle = `rgba(80,55,30,${0.1 + Math.random() * 0.2})`;
      ctx.lineWidth = 0.3 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(angle) * r1, ey + Math.sin(angle) * r1);
      ctx.lineTo(ex + Math.cos(angle) * r2, ey + Math.sin(angle) * r2);
      ctx.stroke();
    }

    const collGrad = ctx.createRadialGradient(ex, ey, irisR * 0.3, ex, ey, irisR * 0.55);
    collGrad.addColorStop(0, 'rgba(80,60,35,0)');
    collGrad.addColorStop(0.5, 'rgba(100,75,45,0.2)');
    collGrad.addColorStop(0.8, 'rgba(80,60,35,0.15)');
    collGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = collGrad;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    for (let c = 0; c < 12; c++) {
      const ca = Math.random() * Math.PI * 2;
      const cd = irisR * (0.45 + Math.random() * 0.35);
      const cs = 2 + Math.random() * 4;
      const ch = 1 + Math.random() * 3;
      ctx.fillStyle = 'rgba(20,15,10,0.25)';
      ctx.beginPath();
      ctx.ellipse(ex + Math.cos(ca) * cd, ey + Math.sin(ca) * cd, cs, ch, ca, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(60,50,40,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,35,30,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,75,60,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR - 1, 0, Math.PI * 2);
    ctx.stroke();

    const pupilShrink = 0.65 + Math.sin(fc * 0.012) * 0.45;
    const effectivePupilR = pupilR * pupilShrink * tep.pupilScale;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(spx + effectivePupilR, spy);
    for (let a = 0; a <= 40; a++) {
      const angle = (a / 40) * Math.PI * 2;
      const ir = effectivePupilR + Math.sin(angle * 8 + fc * 0.02) * 0.5 + Math.sin(angle * 13 + fc * 0.03) * 0.3;
      ctx.lineTo(spx + Math.cos(angle) * ir, spy + Math.sin(angle) * ir);
    }
    ctx.closePath();
    ctx.fill();

    const ambGrad = ctx.createRadialGradient(spx - w * 0.02, spy - w * 0.03, 0, spx - w * 0.02, spy - w * 0.03, w * 0.06);
    ambGrad.addColorStop(0, 'rgba(180,200,230,0.35)');
    ambGrad.addColorStop(0.4, 'rgba(140,170,210,0.15)');
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambGrad;
    ctx.beginPath();
    ctx.arc(spx - w * 0.02, spy - w * 0.03, w * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.035, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(spx + w * 0.04, spy + w * 0.05, w * 0.015, 0, Math.PI * 2);
    ctx.fill();

    const wetGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    wetGrad.addColorStop(0, 'rgba(200,220,255,0.1)');
    wetGrad.addColorStop(0.5, 'rgba(180,200,240,0.06)');
    wetGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wetGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    if (_telonStareTimer > 0) {
      const pulse = 0.5 + Math.sin(fc * 0.15) * 0.3;
      const eyeGlow = ctx.createRadialGradient(ex, ey, rx * 0.1, ex, ey, rx * 0.8);
      eyeGlow.addColorStop(0, `rgba(255,0,0,${0.08*pulse})`);
      eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eyeGlow;
      ctx.fillRect(0, 0, w, h);
    }

    const bagGrad = ctx.createRadialGradient(ex, ey + ry * 0.6, 0, ex, ey + ry * 0.6, rx * 0.7);
    bagGrad.addColorStop(0, 'rgba(50,15,30,0.3)');
    bagGrad.addColorStop(0.5, 'rgba(40,10,25,0.15)');
    bagGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bagGrad;
    ctx.beginPath();
    ctx.ellipse(ex, ey + ry * 0.5, rx * 0.6, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.strokeStyle = 'rgba(160,80,80,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rx - 0.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    for (let l = 0; l < 14; l++) {
      const la = Math.PI * 1.15 + (l / 14) * Math.PI * 0.7;
      const ll = 5 + Math.random() * 10;
      ctx.strokeStyle = 'rgba(180,170,160,0.3)';
      ctx.lineWidth = 0.6 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(la) * (rx + 1), cy + Math.sin(la) * (ry + 1));
      ctx.quadraticCurveTo(
        cx + Math.cos(la - 0.1) * (rx + 1 + ll),
        cy + Math.sin(la - 0.1) * (ry + 1 + ll * 0.3),
        cx + Math.cos(la - 0.15) * (rx + 1 + ll * 1.2),
        cy + Math.sin(la - 0.15) * (ry + 1 + ll * 0.3)
      );
      ctx.stroke();
    }

    const lowerLidGrad = ctx.createLinearGradient(0, cy + ry * 0.7, 0, cy + ry);
    lowerLidGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lowerLidGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    lowerLidGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lowerLidGrad;
    ctx.fillRect(cx - rx - 4, cy + ry * 0.7, rx * 2 + 8, ry * 0.3);
    ctx.restore();

    const browY = cy - ry - 8 + tep.browRaise * 16;
    const browH = ry * 0.12 + tep.browRaise * 4;
    const browW = rx * 0.5;
    ctx.strokeStyle = `rgba(80,70,65,${0.4 + Math.abs(tep.browRaise) * 0.4})`;
    ctx.lineWidth = 2 + Math.abs(tep.browRaise) * 2;
    ctx.beginPath();
    const bDir = tep.browRaise > 0 ? 1 : -1;
    ctx.moveTo(cx - browW, browY + browH * bDir);
    ctx.quadraticCurveTo(cx, browY - browH * 0.3 * bDir, cx + browW, browY + browH * bDir);
    ctx.stroke();

    ctx.strokeStyle = `rgba(60,50,45,${0.3 + Math.abs(tep.browRaise) * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - browW * 0.8, browY + browH * bDir + 2);
    ctx.quadraticCurveTo(cx, browY - browH * 0.2 * bDir + 2, cx + browW * 0.8, browY + browH * bDir + 2);
    ctx.stroke();

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

    _telonBlinkTimer -= 1 / tep.blinkSpeed;
    if (_telonBlinkTimer <= 0) {
      _telonBlinkPhase = 1;
      _telonBlinkTimer = (120 + Math.floor(Math.random() * 120)) / tep.blinkSpeed;
    }
    if (_telonBlinkPhase > 0 && _telonBlinkPhase < 14) {
      const bp = _telonBlinkPhase / 14;
      _telonBlinkPhase++;
      const lidH = bp < 0.5 ? bp * 2 * ry * 2.2 : (1 - bp) * 2 * ry * 2.2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, lidH);
      ctx.fillRect(0, h - lidH * 0.6, w, lidH * 0.6);
    } else if (_telonBlinkPhase >= 14) {
      _telonBlinkPhase = 0;
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

    if (!_greenCodeAssigned) {
      gameState.combinationDigits.green = parseInt(_telonPassword, 10);
      _greenCodeAssigned = true;
      if (!_telonBuzzPlayed) {
        playEyeBuzz();
        _telonBuzzPlayed = true;
      }
    }

    if (camera.position.distanceTo(telonWorld) < 3) {
      ctx.fillStyle = '#33ff33';
      ctx.font = 'bold 52px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#33ff33';
      ctx.shadowBlur = 20;
      ctx.fillText(_telonPassword, w / 2, h / 2 + 6);
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
  updateTimerDisplay(timer.formatted);

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
    if (item.flickerEnd && t < item.flickerEnd) {
      const f = Math.sin((t - item.flickerStart) * 60) * 0.5 + 0.5;
      item.light.intensity = item.baseIntensity * (0.05 + f * 0.2);
    } else if (getCurrentPreset() === 'default') {
      item.light.intensity = item.baseIntensity;
    } else if (item.isDead) {
      const glitch = Math.sin(t * 1.3 + item.phase) * Math.sin(t * 3.1 + item.phase);
      item.light.intensity = glitch > 0.85 ? 0.08 : 0.02;
    } else {
      const flicker = Math.sin(t * 2.7 + item.phase) * 0.08 + Math.sin(t * 5.1 + item.phase * 1.7) * 0.05;
      item.light.intensity = Math.max(0.08, item.baseIntensity + flicker);
    }
  });

  _flickerTimer -= delta;
  if (_flickerTimer <= 0) {
    _flickerTimer = 5 + Math.random() * 2;
    const inactive = ceilingFlickerLights.filter(l => !l.flickerEnd || t > l.flickerEnd);
    if (inactive.length > 0) {
      const pick = inactive[Math.floor(Math.random() * inactive.length)];
      pick.flickerStart = t;
      pick.flickerEnd = t + 0.3 + Math.random() * 0.4;
    }
  }

  _glitchTimer -= delta;
  if (_glitchTimer <= 0) {
    _glitchTimer = 0.15 + Math.random() * 0.2;
    updateQuestionGlitch();
  }

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
  if (roomEyes.length < 6 && t - _eyeLastSpawnR > 3 && roomScreenMeshes.length > 0) {
    spawnEye(roomScreenMeshes, roomScreenMats, 'room');
    _eyeLastSpawnR = t;
  }

  const hwEyes = eyeInstances.filter(e => e.type === 'hallway');
  if (hwEyes.length < 1 && t - _eyeLastSpawnH > 25 && hallwayScreenMeshes.length > 0) {
    spawnEye(hallwayScreenMeshes, hallwayScreenMats, 'hallway');
    _eyeLastSpawnH = t;
  }

  for (let i = eyeInstances.length - 1; i >= 0; i--) {
    if (eyeInstances[i].frameCount > 1200 && eyeInstances[i].type !== 'violet') {
      clearEye(eyeInstances[i]);
    }
  }

  if (gameState.blueCode.solved && blueTexRef && blueScreenIdxRef >= 0) {
    const s = roomScreenMeshes[blueScreenIdxRef];
    if (s && s.material) {
      s.material.map = blueTexRef;
      s.material.emissiveMap = blueTexRef;
      s.material.emissive.set(0xffffff);
      s.material.emissiveIntensity = 2.0;
      s.material.needsUpdate = true;
    }
  }

  if (gameState.violetCode.solved && violetTexRef && violetScreenIdxRef >= 0) {
    const s = roomScreenMeshes[violetScreenIdxRef];
    if (s && s.material) {
      s.material.map = violetTexRef;
      s.material.emissiveMap = violetTexRef;
      s.material.emissive.set(0xffffff);
      s.material.emissiveIntensity = 2.0;
      s.material.needsUpdate = true;
    }
  }

  violetEyeState.timer += delta;
  if (violetEyeState.visible && violetEyeState.timer >= (violetEyeState.duration || 10)) {
    clearVioletEye();
    violetEyeState.visible = false;
    violetEyeState.timer = 0;
    violetEyeState.duration = 8 + Math.random() * 6;
  } else if (!violetEyeState.visible && violetEyeState.timer >= (violetEyeState.duration || 10)) {
    spawnVioletEye();
    violetEyeState.visible = true;
    violetEyeState.timer = 0;
    violetEyeState.duration = 14;
  }

  if (!questionMonitorState.active) {
    _questionTimer += delta;
    if (_questionTimer >= 15) {
      const proxy = questionMonitorSpawn(scene, _interactables, _data);
      if (proxy) {
        _questionTimer = 0;
      }
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

  if (gameState.projectorOn && gameState.powerConnected) {
    if (getCurrentPreset() !== 'blackout') {
      setLightingPreset('blackout');
      setWhiteboardGlow(1.8);
      _flashlightMsgShown = false;
    }
    if (!gameState.flashlightCollected && !_flashlightMsgShown) {
      showMessage('Debe haber una linterna por aqui...');
      _flashlightMsgShown = true;
    }
    _wasProjectorBlackout = true;
  } else {
    if (_wasProjectorBlackout) {
      setWhiteboardGlow(0.02);
      _wasProjectorBlackout = false;
    }
    _flashlightMsgShown = false;
  }

  bluePuzzleChairRefs.forEach((chair) => {
    if (!chair.pushed) {
      const isBlackout = getCurrentPreset() === 'blackout';
      chair.seatMat.emissiveIntensity = isBlackout ? (0.08 + Math.sin(t * 3.0) * 0.04) : 0;
      chair.backMat.emissiveIntensity = isBlackout ? (0.08 + Math.sin(t * 3.0) * 0.04) : 0;
    }
    if (chair.pushing) {
      chair.progress += delta / 0.4;
      if (chair.progress >= 1) {
        chair.progress = 1;
        chair.pushing = false;
        chair.seatMat.emissiveIntensity = 0;
        chair.backMat.emissiveIntensity = 0;
        chair.seatMat.emissive.set(0x000000);
        chair.backMat.emissive.set(0x000000);
      }
      const ez = chair.originalZ;
      const oz = chair.offsetZ;
      const cz = oz + (ez - oz) * chair.progress;
      chair.seat.position.z = cz;
      chair.back.position.z = cz + 0.16;
      chair.legs.forEach((leg, li) => {
        const lx = li === 0 || li === 2 ? 0.13 : -0.13;
        const lz = li === 0 || li === 1 ? 0.13 : -0.13;
        leg.position.z = cz + lz;
      });
    }
  });

  if (victoryDoorRef) victoryDoorRef.visible = gameState.codeValidated;
  if (doorEyeMeshRef) doorEyeMeshRef.visible = gameState.codeValidated;

  const cam = gameState.cameraAnim;
  if (cam.active) {
    cam.progress += delta * 0.4;
    const t = Math.min(1, cam.progress);
    if (cam.startPos && cam.targetPos && cam.startQuat && cam.targetQuat) {
      camera.position.lerpVectors(cam.startPos, cam.targetPos, t);
      camera.quaternion.slerpQuaternions(cam.startQuat, cam.targetQuat, t);
    }
    if (t >= 1) {
      cam.active = false;
      cam.startPos = null;
      cam.targetPos = null;
      cam.startQuat = null;
      cam.targetQuat = null;
    }
  }

  if (gameState.grandFinale === 1) {
    gameState.finaleTimer += delta;
    if (gameState.finaleTimer > 0.8) {
      gameState.grandFinale = 2;
      gameState.finaleTimer = 0;
      bloomPass.strength = 0.5;
    }
  }

  if (gameState.grandFinale === 2) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const speed = gameState.finaleFlySpeed * delta;
    if (input.w) camera.position.addScaledVector(forward, speed);
    if (input.s) camera.position.addScaledVector(forward, -speed);
    if (input.a) camera.position.addScaledVector(right, -speed);
    if (input.d) camera.position.addScaledVector(right, speed);
    if (input.fPressed) { camera.position.y += speed; input.fPressed = false; }

    if (input.ePressed) {
      input.ePressed = false;
      const rc = new THREE.Raycaster();
      rc.set(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
      const hits = rc.intersectObjects(roomScreenMeshes, true);
      if (hits.length > 0 && hits[0].distance < 15) {
        const colors = ['#081824', '#140818', '#081a14', '#1a1208', '#101030', '#050518', '#180810', '#101828', '#0a1525', '#150a20'];
        scene.background = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        playMonitorGlitch();
      }
    }
  }

  if (gameState.eyeTrapStage > 0) {
    gameState.eyeTrapTimer += delta;

    if (gameState.eyeTrapStage === 1) {
      if (doorEyeMeshRef && doorEyeMeshRef.material) {
        doorEyeMeshRef.material.emissiveIntensity = 0.4 + Math.sin(gameState.eyeTrapTimer * 20) * 0.4;
      }
      if (gameState.eyeTrapTimer > 2.0) {
        setLightingPreset('blackout');
        gameState.eyeTrapStage = 2;
        gameState.eyeTrapTimer = 0;
      }
    }

    if (gameState.eyeTrapStage === 2) {
      const t = Math.min(1, gameState.eyeTrapTimer / 1.0);
      camera.fov = 75 * (1 - t);
      camera.updateProjectionMatrix();
      if (t >= 1) {
        camera.fov = 75;
        camera.updateProjectionMatrix();
        gameOver = true;
        playGameOver();
        showEndOverlay();
        gameState.eyeTrapStage = 0;
        gameState.eyeTrapEye = null;
      }
    }
  }

  if (isLocked() && !gameOver && !gameState.cameraAnim.active && gameState.eyeTrapStage === 0 && gameState.grandFinale === 0) {
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

    for (const rect of deskColliders) {
      const p = camera.position;
      if (p.x > rect.minX - PLAYER_RADIUS && p.x < rect.maxX + PLAYER_RADIUS &&
          p.z > rect.minZ - PLAYER_RADIUS && p.z < rect.maxZ + PLAYER_RADIUS) {
        const ol = p.x - (rect.minX - PLAYER_RADIUS);
        const or = (rect.maxX + PLAYER_RADIUS) - p.x;
        const ot = p.z - (rect.minZ - PLAYER_RADIUS);
        const ob = (rect.maxZ + PLAYER_RADIUS) - p.z;
        const min = Math.min(ol, or, ot, ob);
        if (min === ol) p.x = rect.minX - PLAYER_RADIUS;
        else if (min === or) p.x = rect.maxX + PLAYER_RADIUS;
        else if (min === ot) p.z = rect.minZ - PLAYER_RADIUS;
        else p.z = rect.maxZ + PLAYER_RADIUS;
      }
    }
    clampPlayer(camera);

    if (t < gameState.dizzyEndTime) {
      const d = (gameState.dizzyEndTime - t) / 15;
      const intensity = 0.5 + d * 0.5;
      camera.fov = 75 + Math.sin(t * 1.2) * 8 * intensity;
      camera.updateProjectionMatrix();
      chromaticPass.uniforms.amount.value = 0.03 * intensity;
      chromaticPass.uniforms.time.value = t;
      chromaticPass.enabled = true;
    } else if (gameState.dizzyEndTime > 0) {
      camera.fov = 75;
      camera.updateProjectionMatrix();
      chromaticPass.uniforms.amount.value = 0;
      chromaticPass.enabled = false;
      gameState.dizzyEndTime = 0;
    }

    flashLight.intensity = gameState.flashlightOn ? 6 : 0;
    flashLight.position.copy(camera.position);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flashLight.target.position.copy(camera.position).add(fwd.multiplyScalar(3));
    flashLight.target.updateMatrixWorld();

    const target = checkInteraction(camera);

    if (input.ePressed) {
      input.ePressed = false;
      if (target) {
        interact(target);
      }
    }

    if (input.fPressed) {
      input.fPressed = false;
      if (gameState.flashlightCollected) {
        const co = document.getElementById('combo-overlay');
        if (!co || !co.classList.contains('active')) {
          gameState.flashlightOn = !gameState.flashlightOn;
        }
      }
    }
  }

  composer.render();
}

animate();
