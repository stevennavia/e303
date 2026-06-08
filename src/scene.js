import * as THREE from 'three';
import {
  ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT, WALL_THICKNESS,
  COLORS, FLUORESCENT, HALLWAY_DEPTH, HALLWAY_FAR_Z,
  PASILLO_WIDTH, PASILLO_HEIGHT, SOUTH_EXPAND,
  LIGHTING_PRESETS,
} from './constants.js';
import { showMessage, updateTimerDisplay, showTimeNotification, showClueUI, updateInventory } from './ui.js';
import { switchGroupRef, comboGroupRef, puertaProxyRef, puertaRef } from './interactables.js';
import { playSpaceOpen, playItemPickup, playDoorOpen } from './audio.js';

function createNoisyTexture(baseHex, noiseAmount = 18) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const r = parseInt(baseHex.slice(1, 3), 16);
  const g = parseInt(baseHex.slice(3, 5), 16);
  const b = parseInt(baseHex.slice(5, 7), 16);

  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noiseAmount;
    imageData.data[i]     = Math.max(0, Math.min(255, r + n));
    imageData.data[i + 1] = Math.max(0, Math.min(255, g + n));
    imageData.data[i + 2] = Math.max(0, Math.min(255, b + n));
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWallMaterial() {
  const tex = createNoisyTexture(COLORS.wallBase, 10);
  tex.repeat.set(2, 2);
  const bump = createNoisyTexture('#808080', 20);
  bump.repeat.set(4, 4);
  return new THREE.MeshStandardMaterial({
    map: tex,
    bumpMap: bump,
    bumpScale: 0.02,
    roughness: 0.60,
    metalness: 0.03,
  });
}

function createFloorMaterial() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const step = 128;
  const line = 2;
  const cols = size / step;
  const rows = size / step;

  const tileData = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const base = 65 + (Math.random() - 0.5) * 20;
      tileData.push({ r: Math.round(base), g: Math.round(base), b: Math.round(base + 4) });
    }
  }

  const imageData = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = Math.floor(x / step);
      const row = Math.floor(y / step);
      const localX = x - col * step;
      const localY = y - row * step;
      const idx = (y * size + x) * 4;

      if (localX < line || localY < line) {
        imageData.data[idx]     = 85;
        imageData.data[idx + 1] = 85;
        imageData.data[idx + 2] = 89;
        imageData.data[idx + 3] = 255;
      } else {
        const tile = tileData[row * cols + col];
        const noise = (Math.random() - 0.5) * 10;
        imageData.data[idx]     = Math.max(0, Math.min(255, tile.r + noise));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, tile.g + noise));
        imageData.data[idx + 2] = Math.max(0, Math.min(255, tile.b + noise));
        imageData.data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(5, 5);

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.9,
    metalness: 0.05,
  });
}

export function initScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  mainScene = scene;

  _testRoom = createTestRoom();
  _desks = createRoomDesks();
  _profDesk = createProfDesk();
  _projector = createProjector();
  _backWall = createBackWall();
  _hallway = createHallway();
  _city = createCity();
  _forest = createForestView();
  _whiteboard = createWhiteboard();
  _ceilingLights = createCeilingLights();
  _hallwayLights = createHallwayLights();
  _dust = createDustParticles();

  scene.add(_testRoom);
  scene.add(_desks);
  scene.add(_profDesk);
  deskColliders.push({ minX: 5.2, maxX: 6.8, minZ: -6.1, maxZ: -4.9 });
  scene.add(_projector);
  scene.add(_backWall);
  scene.add(_hallway);
  scene.add(_city);
  scene.add(_forest);
  scene.add(_whiteboard);
  deskColliders.push({ minX: -7.0, maxX: -5.2, minZ: -8.5, maxZ: -7.5 });
  spawnVictoryDoor(scene);
  createDoorEye(scene);
  scene.add(_ceilingLights);
  scene.add(_hallwayLights);
  scene.add(_dust);

  _starfield = createStarfield();
  scene.add(_starfield);

  _finalFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH + SOUTH_EXPAND),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.85 })
  );
  _finalFloor.rotation.x = -Math.PI / 2;
  _finalFloor.position.set(0, 0, -SOUTH_EXPAND / 2);
  _finalFloor.visible = false;
  scene.add(_finalFloor);

  scene.fog = new THREE.FogExp2(0x0a0a14, 0.038);

  const ambient = new THREE.AmbientLight(0x334466, 0.50);
  scene.add(ambient);
  sceneAmbient = ambient;

  setLightingPreset('default');

  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0a0a1e);
    const envMap = pmremGenerator.fromScene(envScene, 0.04);
    scene.environment = envMap;
    pmremGenerator.dispose();
  }

  return scene;
}

function createTestRoom() {
  const group = new THREE.Group();

  const hw = ROOM_WIDTH / 2;
  const hd = ROOM_DEPTH / 2;
  const hh = ROOM_HEIGHT / 2;
  const wt2 = WALL_THICKNESS / 2;

  const wallMat = createWallMaterial();

  const wallSouthZ = -hd - wt2 - SOUTH_EXPAND;
  const segs = [
    { cx: -6.225, w: 1.95 },
    { cx: -2.0, w: 1.5 },
    { cx: 2.0, w: 1.5 },
    { cx: 6.225, w: 1.95 },
  ];
  segs.forEach(({ cx, w }) => {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(w, ROOM_HEIGHT, WALL_THICKNESS),
      wallMat
    );
    seg.position.set(cx, hh, wallSouthZ);
    seg.receiveShadow = true;
    group.add(seg);
  });

  const winW = 2.5, winH = 2.5;
  const winY = 0.8 + winH / 2;
  const winX = [-4, 0, 4];
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.7,
    metalness: 0.2,
  });
  const forestGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  winX.forEach(x => {
    [
      ['top', x, winY + winH / 2, winW + 0.12],
      ['bottom', x, winY - winH / 2, winW + 0.12],
      ['left', x - winW / 2, winY, winH],
      ['right', x + winW / 2, winY, winH],
    ].forEach(([side, fx, fy, len]) => {
      const isH = side === 'top' || side === 'bottom';
      const fw = isH ? len : 0.06;
      const fh = isH ? 0.06 : len;
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.12), frameMat);
      f.position.set(fx, fy, wallSouthZ);
      group.add(f);
    });

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(winW - 0.08, winH - 0.08),
      forestGlassMat
    );
    glass.position.set(x, winY, wallSouthZ + 0.01);
    group.add(glass);
  });

  const telonGeo = new THREE.PlaneGeometry(3.5, 3.0);
  const telonMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8d8,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const telon = new THREE.Mesh(telonGeo, telonMat);
  telon.position.set(0, 2.5, -7.5);
  group.add(telon);
  telonRef = telon;

  const roomDepthFull = ROOM_DEPTH + SOUTH_EXPAND;
  const wallE = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, ROOM_HEIGHT, roomDepthFull),
    wallMat
  );
  wallE.position.set(hw + wt2, hh, -SOUTH_EXPAND / 2);
  wallE.receiveShadow = true;

  const wallW = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, ROOM_HEIGHT, roomDepthFull),
    wallMat
  );
  wallW.position.set(-hw - wt2, hh, -SOUTH_EXPAND / 2);
  wallW.receiveShadow = true;

  group.add(wallE, wallW);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, roomDepthFull),
    createFloorMaterial()
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -SOUTH_EXPAND / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.7,
    metalness: 0.15,
  });
  const baseZSouth = -ROOM_DEPTH / 2 - SOUTH_EXPAND;
  const interZ = ROOM_DEPTH / 2;
  const baseLenZ = interZ - baseZSouth;
  [
    ['z', 0, baseZSouth, ROOM_WIDTH],
    ['x', -ROOM_WIDTH / 2, 0, roomDepthFull],
    ['x', ROOM_WIDTH / 2, 0, roomDepthFull],
  ].forEach(([axis, x, z, len]) => {
    const bx = axis === 'z' ? ROOM_WIDTH : 0.04;
    const bz = axis === 'z' ? 0.04 : len;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(bx, 0.12, bz), baseMat);
    trim.position.set(x, 0.06, z);
    trim.receiveShadow = true;
    group.add(trim);
  });

  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.9,
    metalness: 0.1,
  });
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, roomDepthFull),
    ceilMat
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ROOM_HEIGHT, -SOUTH_EXPAND / 2);
  group.add(ceiling);

  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.5,
    metalness: 0.4,
  });
  const pipeGeoH = new THREE.CylinderGeometry(0.04, 0.04, ROOM_WIDTH, 8);
  const pipeGeoV = new THREE.CylinderGeometry(0.04, 0.04, roomDepthFull, 8);
  const junctionGeo = new THREE.BoxGeometry(0.12, 0.08, 0.12);

  const pipeX = [-5.0, -2.5, 0, 2.5, 5.0];
  const pipeZ = [-5.0, -1.5, 1.5, 5.0];

  pipeZ.forEach(zp => {
    const p = new THREE.Mesh(pipeGeoH, pipeMat);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, ROOM_HEIGHT - 0.02, zp - SOUTH_EXPAND / 2);
    group.add(p);
  });

  pipeX.forEach(xp => {
    const p = new THREE.Mesh(pipeGeoV, pipeMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(xp, ROOM_HEIGHT - 0.02, -SOUTH_EXPAND / 2);
    group.add(p);
  });

  pipeX.forEach(xp => {
    pipeZ.forEach(zp => {
      const jbox = new THREE.Mesh(junctionGeo, pipeMat);
      jbox.position.set(xp, ROOM_HEIGHT - 0.04, zp - SOUTH_EXPAND / 2);
      group.add(jbox);
    });
  });

  return group;
}

function createBackWall() {
  const group = new THREE.Group();
  const wallMat = createWallMaterial();

  const backZ = ROOM_DEPTH / 2;
  const hh = ROOM_HEIGHT / 2;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.8,
  });

  const aw = 1.0, ah = ROOM_HEIGHT - 2.2;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(aw + 0.12, 0.06, 0.12), frameMat);
  frameTop.position.set(0, 2.2 + ah, backZ);
  group.add(frameTop);
  const frameBottom = frameTop.clone();
  frameBottom.position.set(0, 2.2, backZ);
  group.add(frameBottom);
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.06, ah, 0.12), frameMat);
  frameL.position.set(-aw / 2, 2.2 + ah / 2, backZ);
  group.add(frameL);
  const frameR = frameL.clone();
  frameR.position.set(aw / 2, 2.2 + ah / 2, backZ);
  group.add(frameR);

  const aboveGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.01,
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const aboveGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(aw - 0.08, ah - 0.08),
    aboveGlassMat
  );
  aboveGlass.position.set(0, 2.2 + ah / 2, backZ + 0.01);
  aboveGlass.rotation.y = Math.PI;
  group.add(aboveGlass);

  const jambL = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 2.2, 0.12),
    frameMat
  );
  jambL.position.set(-0.5, 1.1, backZ);
  group.add(jambL);

  const jambR = jambL.clone();
  jambR.position.set(0.5, 1.1, backZ);
  group.add(jambR);

  const header = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.08, 0.12),
    frameMat
  );
  header.position.set(0, 2.2, backZ);
  group.add(header);

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x6b4226,
    roughness: 0.85,
  });
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 2.1, 0.08),
    doorMat
  );
  door.position.set(0, 1.05, backZ + 0.01);
  group.add(door);

  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.8,
    roughness: 0.2,
  });
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), handleMat);
  handle.position.set(0.34, 0.95, backZ + 0.05);
  group.add(handle);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xaabbcc,
    transparent: true,
    opacity: 0.06,
    roughness: 0.02,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const winW1 = 5.4, winH1 = 2.98;
  const winPositions = [
    { x: -3.25, w: winW1 },
    { x: 3.25, w: winW1 },
  ];

  winPositions.forEach(({ x: wx, w }) => {
    const hw = w / 2, hh2 = winH1 / 2;
    const fy = 1.5;
    [
      ['top', wx, fy + hh2, w + 0.12],
      ['bottom', wx, fy - hh2, w + 0.12],
      ['left', wx - hw, fy, winH1],
      ['right', wx + hw, fy, winH1],
    ].forEach(([, fx, fY, len]) => {
      const isH = fx === wx;
      const fw = isH ? len : 0.06;
      const fh = isH ? 0.06 : len;
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.10), frameMat);
      f.position.set(fx, fY, backZ);
      group.add(f);
    });

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.08, winH1 - 0.08),
      glassMat
    );
    glass.position.set(wx, fy, backZ + 0.005);
    glass.rotation.y = Math.PI;
    group.add(glass);
  });

  return group;
}

function createHallway() {
  const group = new THREE.Group();

  const hd2 = HALLWAY_DEPTH / 2;
  const farZ = HALLWAY_FAR_Z;
  const hallCenterZ = ROOM_DEPTH / 2 + hd2;
  const hw = PASILLO_WIDTH / 2;
  const hh = PASILLO_HEIGHT / 2;

  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.hallwayWall,
    roughness: 0.9,
    metalness: 0.05,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: COLORS.hallwayFloor,
    roughness: 0.9,
    metalness: 0.05,
  });
  const hz = 11;

  const holeL = 12, holeR = 16, holeF = 8.5, holeB = 15;

  function makeFloor(x, z, w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    return m;
  }
  group.add(makeFloor(-3.75, hz, 31.5, HALLWAY_DEPTH));
  group.add(makeFloor(17.75, hz, 3.5, HALLWAY_DEPTH));
  group.add(makeFloor(14, (7 + holeF) / 2, holeR - holeL, holeF - 7));

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
  function addEdge(x, y, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMat);
    m.position.set(x, y, z);
    group.add(m);
  }
  addEdge(14, 0.04, holeF, holeR - holeL, 0.08, 0.08);
  addEdge(holeR, 0.04, hz, 0.08, 0.08, holeB - holeF);

  const nSteps = 15;
  const stepDepth = (holeR - holeL) / nSteps;
  const stepHeight = 3 / nSteps;
  for (let i = 0; i < nSteps; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(stepDepth, stepHeight, holeB - holeF),
      floorMat
    );
    const sx = holeR - (i + 0.5) * stepDepth;
    const sy = -(i + 0.5) * stepHeight;
    step.position.set(sx, sy, (holeF + holeB) / 2);
    group.add(step);
  }

  const railMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
    metalness: 0.3,
  });
  function makeRailZ(z, x1, x2, y1) {
    const dx = x2 - x1;
    const dy = 3;
    const len = Math.sqrt(dx * dx + dy * dy);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.05, 0.04),
      railMat
    );
    rail.position.set((x1 + x2) / 2, y1 - dy / 2, z);
    rail.rotation.z = Math.asin(dy / len);
    group.add(rail);
    const nPosts = Math.floor(len / 0.8);
    for (let j = 0; j <= nPosts; j++) {
      const t = j / nPosts;
      const px = x1 + t * dx;
      const py = y1 - t * dy;
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, py + 3, 0.03),
        railMat
      );
      post.position.set(px, (py - 3) / 2, z);
      group.add(post);
    }
  }
  makeRailZ(holeF, holeR, holeL, 0.9);
  makeRailZ(holeB, holeR, holeL, 0.9);

  const railX = holeL;
  const nPosts = Math.floor((holeB - holeF) / 0.7);
  for (let j = 0; j <= nPosts; j++) {
    const t = j / nPosts;
    const pz = holeF + t * (holeB - holeF);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 4.0, 0.03),
      railMat
    );
    post.position.set(railX, -1.0, pz);
    group.add(post);
  }
  [0.5, 1.2, 4.0].forEach(railHeight => {
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, holeB - holeF),
      railMat
    );
    topRail.position.set(railX, -3 + railHeight, (holeF + holeB) / 2);
    group.add(topRail);
  });

  const deskGroup = new THREE.Group();
  deskGroup.position.set(5, 0, 13.5);

  const deskMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7,
  });
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.06, 0.8),
    deskMat
  );
  deskTop.position.set(0, 1.0, 0);
  deskGroup.add(deskTop);
  [[-3, -0.4], [-3, 0.4], [3, -0.4], [3, 0.4]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.0, 0.06),
      deskMat
    );
    leg.position.set(x, 0.5, z);
    deskGroup.add(leg);
  });

  const monMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.5,
  });
  const compX = [-2.2, -0.9, 0.5, 1.8];
  const hallwayScreenMat = new THREE.MeshStandardMaterial({
    color: 0x445588,
    emissive: 0x445588,
    emissiveIntensity: 0.25,
  });
  compX.forEach((x, idx) => {
    const screenMat = hallwayScreenMat.clone();
    hallwayScreenMats.push(screenMat);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.34, 0.04),
      monMat
    );
    frame.position.set(x, 1.15, 0);
    deskGroup.add(frame);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.43, 0.29),
      screenMat
    );
    screen.position.set(x, 1.15, -0.03);
    screen.rotation.y = Math.PI;
    deskGroup.add(screen);
    hallwayScreenMeshes.push(screen);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.02, 0.08),
      monMat
    );
    base.position.set(x, 1.0, 0);
    deskGroup.add(base);
    const kb = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.01, 0.10),
      monMat
    );
    kb.position.set(x, 1.0, 0.05);
    deskGroup.add(kb);
  });

  group.add(deskGroup);

  const stainMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const stainPositions = [
    [-hw + 0.15, 0.8, 9.0, 0.02, 1.6, 1.2],
    [-hw + 0.15, 1.2, 12.5, 0.02, 0.9, 0.7],
    [hw - 0.15, 0.5, 10.0, 0.02, 2.0, 1.5],
    [hw - 0.15, 1.5, 13.0, 0.02, 1.1, 0.8],
    [-hw + 0.15, 2.0, 14.0, 0.02, 0.6, 0.5],
    [hw - 0.15, 0.3, 8.5, 0.02, 1.3, 1.0],
  ];
  stainPositions.forEach(([x, y, z, w, h, d]) => {
    const stain = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stainMat);
    stain.position.set(x, y, z);
    group.add(stain);
  });

  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.6,
    metalness: 0.2,
  });
  const pipePositions = [
    [-8, PASILLO_HEIGHT - 0.08, 10.0, 8.0],
    [5, PASILLO_HEIGHT - 0.08, 12.0, 6.0],
    [-15, PASILLO_HEIGHT - 0.08, 11.5, 10.0],
  ];
  pipePositions.forEach(([x, y, z, len]) => {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, len, 8),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(x, y, z);
    group.add(pipe);
  });

  const lowerMat = new THREE.MeshStandardMaterial({
    color: 0x1a2218,
    roughness: 0.8,
  });
  const lowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(holeR - holeL, holeB - holeF),
    lowerMat
  );
  lowFloor.rotation.x = -Math.PI / 2;
  lowFloor.position.set(14, -3, (holeF + holeB) / 2);
  group.add(lowFloor);

  function makeLowWall(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lowerMat);
    m.position.set(x, y, z);
    group.add(m);
  }
  makeLowWall(0.08, 3, holeB - holeF, holeL, -1.5, (holeF + holeB) / 2);
  makeLowWall(0.08, 3, holeB - holeF, holeR, -1.5, (holeF + holeB) / 2);
  makeLowWall(holeR - holeL, 3, 0.08, 14, -1.5, holeF);

  const lowLight = new THREE.PointLight(0x335533, 1.0, 8, 2);
  lowLight.position.set(14, -1, (holeF + holeB) / 2 + 1);
  group.add(lowLight);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x223322,
    emissive: 0x335533,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const glowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(holeR - holeL - 1, holeB - holeF - 1),
    glowMat
  );
  glowPlane.rotation.x = -Math.PI / 2;
  glowPlane.position.set(14, -2.99, (holeF + holeB) / 2);
  group.add(glowPlane);

  const wallL = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, PASILLO_HEIGHT, HALLWAY_DEPTH),
    wallMat
  );
  wallL.position.set(-hw - WALL_THICKNESS / 2, hh, hallCenterZ);
  group.add(wallL);

  const wallR = wallL.clone();
  wallR.position.set(hw + WALL_THICKNESS / 2, hh, hallCenterZ);
  group.add(wallR);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(PASILLO_WIDTH, HALLWAY_DEPTH),
    wallMat
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, PASILLO_HEIGHT, hallCenterZ);
  group.add(ceiling);

  const glassMat = new THREE.MeshPhysicalMaterial({
    transparent: true,
    opacity: 0.001,
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(PASILLO_WIDTH + 0.5, PASILLO_HEIGHT + 0.3),
    glassMat
  );
  glass.position.set(0, hh, farZ + 0.01);
  glass.rotation.y = Math.PI;
  group.add(glass);

  const fogPlaneMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a14,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  [15.5, 17, 19].forEach((fogZ, i) => {
    const fogPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(PASILLO_WIDTH + 2, PASILLO_HEIGHT + 0.5),
      fogPlaneMat.clone()
    );
    fogPlane.material.opacity = 0.12 + i * 0.14;
    fogPlane.position.set(0, hh, fogZ);
    fogPlane.rotation.y = Math.PI;
    group.add(fogPlane);
  });

  return group;
}

function createRoomDesks() {
  const group = new THREE.Group();

  const deskDepth = 1.2;
  const deskThick = 0.06;
  const deskHeight = 0.9;
  const deskW = 6.0;

  const aisleHalf = 1.2;
  const halfW = ROOM_WIDTH / 2;
  const leftCx = -(halfW + aisleHalf) / 2;
  const rightCx = (halfW + aisleHalf) / 2;

  const stepZ = deskDepth + 1.54;
  const rowZ = [-4.0, -4.0 + stepZ, -4.0 + 2 * stepZ, -4.0 + 3 * stepZ];

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const monMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const roomScreenBaseMat = new THREE.MeshStandardMaterial({
    color: 0x445588, emissive: 0x445588, emissiveIntensity: 0.15,
  });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.1 });
  const chairBackMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.8, metalness: 0.05 });
  const sepMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  const allChairPositions = [];
  rowZ.forEach((z, ri) => {
    [{ cx: leftCx }, { cx: rightCx }].forEach((side, si) => {
      const monSpacing = deskW / 4;
      const monStart = side.cx - deskW / 2 + monSpacing / 2;
      const northZ = z + deskDepth / 2;
      const chairZ = northZ - 0.2;
      for (let mi = 0; mi < 4; mi++) {
        const mx = monStart + mi * monSpacing;
        allChairPositions.push({ mx, chairZ, ri, si, mi });
      }
    });
  });

  const selectedChairIndices = new Set();
  while (selectedChairIndices.size < 5) {
    selectedChairIndices.add(Math.floor(Math.random() * allChairPositions.length));
  }

  let chairIdx = -1;
  rowZ.forEach((z, ri) => {
    [{ cx: leftCx }, { cx: rightCx }].forEach((side, si) => {
      const monSpacing = deskW / 4;
      const monStart = side.cx - deskW / 2 + monSpacing / 2;
      const deskX = side.cx;

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(deskW, deskThick, deskDepth),
        deskMat
      );
      top.position.set(deskX, deskHeight, z);
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      [
        [deskW / 2 - 0.1, deskDepth / 2 - 0.1],
        [deskW / 2 - 0.1, -(deskDepth / 2 - 0.1)],
        [-(deskW / 2 - 0.1), deskDepth / 2 - 0.1],
        [-(deskW / 2 - 0.1), -(deskDepth / 2 - 0.1)],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, deskHeight - deskThick / 2, 0.06),
          deskMat
        );
        leg.position.set(deskX + lx, (deskHeight - deskThick / 2) / 2, z + lz);
        group.add(leg);
      });

      for (let mi = 0; mi < 4; mi++) {
        chairIdx++;
        const mx = monStart + mi * monSpacing;
        const isPuzzle = selectedChairIndices.has(chairIdx);
        const chairOffset = isPuzzle ? 0.4 : 0;

        const northZ = z + deskDepth / 2;

          const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.54, 0.37, 0.05),
          monMat
        );
        frame.position.set(mx, deskHeight + 0.22, z + 0.025);
        group.add(frame);

        const smat = roomScreenBaseMat.clone();
        const deadChance = 0.40;
        const isDead = Math.random() < deadChance;
        if (isDead) smat.emissiveIntensity = 0.02;
        roomScreenMats.push(smat);

        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.48, 0.31),
          smat
        );
        screen.position.set(mx, deskHeight + 0.22, z + 0.06);
        group.add(screen);
        roomScreenMeshes.push(screen);

        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.38, 0.28),
          towerMat
        );
        tower.position.set(mx + 0.32, deskHeight + deskThick / 2 + 0.22, z);
        tower.castShadow = true;
        group.add(tower);

        const cable = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.02, 0.26),
          new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
        );
        cable.position.set(mx + 0.27, deskHeight + deskThick / 2 + 0.02, z);
        group.add(cable);

        const chairZ = northZ - 0.2 + chairOffset;
        const seatY = 0.46;

        const activeChairMat = isPuzzle
          ? new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.5, metalness: 0.2, emissive: 0x2244ff, emissiveIntensity: 0 })
          : chairMat;
        const activeChairBackMat = isPuzzle
          ? new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.6, metalness: 0.15, emissive: 0x2244ff, emissiveIntensity: 0 })
          : chairBackMat;

        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.04, 0.35),
          activeChairMat
        );
        seat.position.set(mx, seatY, chairZ);
        group.add(seat);

        const back = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.35, 0.04),
          activeChairBackMat
        );
        back.position.set(mx, seatY + 0.18, chairZ + 0.16);
        group.add(back);

        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6);
        const legRefs = [];
        [
          [0.13, 0.13], [0.13, -0.13], [-0.13, 0.13], [-0.13, -0.13],
        ].forEach(([lx, lz]) => {
          const legC = new THREE.Mesh(legGeo, isPuzzle ? activeChairMat : chairMat);
          legC.position.set(mx + lx, 0.23, chairZ + lz);
          group.add(legC);
          legRefs.push(legC);
        });

        if (isPuzzle) {
          bluePuzzleChairRefs.push({
            seat,
            back,
            legs: legRefs,
            seatMat: activeChairMat,
            backMat: activeChairBackMat,
            screen,
            screenMat: smat,
            originalZ: northZ - 0.2,
            offsetZ: chairZ,
            mx,
            seatY,
            pushing: false,
            progress: 0,
            pushed: false,
          });
        }
      }
    });

    if (ri < 3) {
      const sepZ = z + deskDepth / 2 + 0.77;
      const sep = new THREE.Mesh(
        new THREE.BoxGeometry(deskW * 2 + 2.4 + 0.2, 0.01, 0.04),
        sepMat
      );
      sep.position.set(0, 0.005, sepZ);
      group.add(sep);
    }
  });

  const violetCandidates = [];
  for (let i = 0; i < roomScreenMeshes.length; i++) {
    if (!roomScreenMeshes[i].userData.blueCodeScreen) violetCandidates.push(i);
  }
  if (violetCandidates.length > 0) {
    const vIdx = violetCandidates[Math.floor(Math.random() * violetCandidates.length)];
    violetEyeState.targetScreenIdx = vIdx;
    gameState.violetCode.targetScreenIdx = vIdx;
    roomScreenMeshes[vIdx].userData.violetCodeScreen = true;

    const vMi = vIdx % 4;
    const conflictSet = new Set([vIdx]);
    if (vMi > 0) conflictSet.add(vIdx - 1);
    if (vMi < 3) conflictSet.add(vIdx + 1);

    for (const chair of bluePuzzleChairRefs) {
      const cIdx = roomScreenMeshes.indexOf(chair.screen);
      if (conflictSet.has(cIdx)) {
        roomScreenMeshes[vIdx].userData.violetCodeScreen = false;
        const retry = violetCandidates.filter(i => !conflictSet.has(i));
        if (retry.length > 0) {
          const newIdx = retry[Math.floor(Math.random() * retry.length)];
          violetEyeState.targetScreenIdx = newIdx;
          gameState.violetCode.targetScreenIdx = newIdx;
          roomScreenMeshes[newIdx].userData.violetCodeScreen = true;
        }
        break;
      }
    }
  }

  deskColliders.length = 0;
  rowZ.forEach((z) => {
    [leftCx, rightCx].forEach((cx) => {
      deskColliders.push({
        minX: cx - deskW / 2,
        maxX: cx + deskW / 2,
        minZ: z - deskDepth / 2,
        maxZ: z + deskDepth / 2 + 0.35,
      });
    });
  });

  return group;
}

function createCity() {
  const group = new THREE.Group();

  const farZ = HALLWAY_FAR_Z;

  const cityWidth = PASILLO_WIDTH * 2; // 36

  const starGeo = new THREE.BufferGeometry();
  const starCount = 450;
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  const starTypes = new Float32Array(starCount);

  const palettes = [
    [1.00, 1.00, 1.00],
    [0.82, 0.88, 1.00],
    [1.00, 0.92, 0.80],
    [0.72, 0.78, 0.95],
    [0.90, 0.88, 1.00],
  ];

  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * cityWidth;
    starPos[i * 3 + 1] = Math.random() * 5 + 2;
    starPos[i * 3 + 2] = farZ + 9 + Math.random() * 3;
    starSizes[i] = 0.25 + Math.random() * 0.45;
    starPhases[i] = Math.random() * Math.PI * 2;
    const c = palettes[Math.floor(Math.random() * palettes.length)];
    starColors[i * 3] = c[0];
    starColors[i * 3 + 1] = c[1];
    starColors[i * 3 + 2] = c[2];
    const r = Math.random();
    starTypes[i] = r < 0.35 ? 0 : (r < 0.70 ? 1 : 2);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(starPhases, 1));
  starGeo.setAttribute('type', new THREE.BufferAttribute(starTypes, 1));

  const starTex = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = Math.abs(x - 7.5);
        const dy = Math.abs(y - 7.5);
        const d = dx + dy;
        if (d < 1.5) ctx.fillStyle = '#ffffff';
        else if (d < 2.5) ctx.fillStyle = '#ccddff';
        else if (d < 3.5) ctx.fillStyle = '#8899bb';
        else if (d < 4.5) ctx.fillStyle = '#445577';
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  })();

  const starMat = new THREE.PointsMaterial({
    size: 0.3,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  let twAcc = 0;
  starMat.onBeforeRender = function(_r, _s, _c, geo) {
    twAcc += 0.015;
    const sz = geo.attributes.size.array;
    const ph = geo.attributes.phase.array;
    const tp = geo.attributes.type.array;
    for (let i = 0; i < sz.length; i++) {
      const base = starSizes[i];
      if (tp[i] === 0) {
        sz[i] = base * (0.85 + 0.15 * Math.sin(twAcc + ph[i]));
      } else if (tp[i] === 1) {
        sz[i] = base * (0.2 + 0.8 * (Math.sin(twAcc * 3 + ph[i]) * 0.5 + 0.5));
      } else {
        const v = Math.sin(twAcc * 5 + ph[i]) * Math.sin(twAcc * 7 + ph[i] * 2);
        sz[i] = v > 0.5 ? base * (0.7 + 0.3 * (v - 0.5) * 2) : 0;
      }
    }
    geo.attributes.size.needsUpdate = true;
  };
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  const bgMat = new THREE.MeshStandardMaterial({
    color: 0x040412,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(cityWidth, 8), bgMat);
  bg.position.set(0, PASILLO_HEIGHT / 2, farZ + 14);
  group.add(bg);

  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a99,
    roughness: 0.7,
  });
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a77,
    roughness: 0.9,
  });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffdd77,
    emissive: 0xffbb44,
    emissiveIntensity: 8.0,
  });
  const dimWinMat = new THREE.MeshStandardMaterial({
    color: 0xffcc66,
    emissive: 0xff9933,
    emissiveIntensity: 4.0,
  });

  const sx = 5.0;
  const buildings = [
    // Cerro Caracol (left hill)
    { x: -7.0 * sx, z: 15, w: 3.0, h: 2.0, d: 2.0, mat: hillMat },
    { x: -6.0 * sx, z: 15.5, w: 2.5, h: 3.2, d: 1.8, mat: hillMat },
    { x: -5.0 * sx, z: 15.8, w: 1.5, h: 2.2, d: 1.5, mat: hillMat },

    // Cathedral / main tower
    { x: 0.0, z: 15.5, w: 1.2, h: 8.0, d: 1.4 },

    // Downtown skyscrapers
    { x: 2.5 * sx, z: 15.0, w: 2.0, h: 6.5, d: 1.2 },
    { x: 4.5 * sx, z: 15.5, w: 1.8, h: 5.0, d: 1.2 },
    { x: 6.5 * sx, z: 15.2, w: 1.2, h: 4.0, d: 1.0 },
    { x: -2.5 * sx, z: 15.3, w: 1.5, h: 4.5, d: 1.2 },

    // Extra skyscrapers to fill width
    { x: 3.5 * sx, z: 15.7, w: 1.0, h: 5.5, d: 1.0 },
    { x: -4.0 * sx, z: 15.1, w: 1.4, h: 3.8, d: 1.2 },
    { x: 5.5 * sx, z: 15.8, w: 1.0, h: 3.0, d: 1.0 },

    // Foreground buildings (closer to glass, bright windows)
    { x: -3.0 * sx, z: 13.5, w: 2.0, h: 2.5, d: 1.5, fg: true },
    { x: 1.8 * sx, z: 13.8, w: 1.8, h: 2.0, d: 1.5, fg: true },
    { x: 4.0 * sx, z: 13.2, w: 2.2, h: 2.8, d: 1.5, fg: true },
  ];

  buildings.forEach(b => {
    const mat = b.mat || buildingMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    group.add(mesh);

    if (b.mat === hillMat) {
      for (let i = 0; i < 6; i++) {
        const hx = b.x + (Math.random() - 0.5) * b.w * 0.7;
        const hz = b.z + b.d / 2 + 0.01;
        const hy = 0.3 + Math.random() * (b.h - 0.4);
        const light = new THREE.Mesh(
          new THREE.PlaneGeometry(0.04, 0.04),
          Math.random() > 0.4 ? winMat : dimWinMat
        );
        light.position.set(hx, hy, hz);
        group.add(light);
      }
      return;
    }

    if (b.fg) {
      for (let wy = 0.5; wy < b.h; wy += 0.6) {
        for (let wx = -b.w / 2 + 0.25; wx < b.w / 2; wx += 0.55) {
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(0.22, 0.28),
            winMat
          );
          win.position.set(b.x + wx, wy, b.z + b.d / 2 + 0.01);
          group.add(win);
        }
      }
      return;
    }

    let seed = 0;
    for (let wy = 0.6; wy < b.h; wy += 0.7) {
      for (let wx = -b.w / 2 + 0.25; wx < b.w / 2; wx += 0.55) {
        seed++;
        const useMat = seed % 5 === 0 ? dimWinMat : winMat;
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.18, 0.22),
          useMat
        );
        win.position.set(b.x + wx, wy, b.z + b.d / 2 + 0.01);
        group.add(win);
      }
    }
  });

  const spireMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a77,
    roughness: 0.7,
  });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 6), spireMat);
  spire.position.set(0, 8.0 + 0.4, 15.5);
  group.add(spire);

  const cityLight = new THREE.PointLight(
    0x5577aa,
    10.0,
    9,
    1.5
  );
  cityLight.position.set(0, 3.0, 15.5);
  group.add(cityLight);

  return group;
}

function createForestView() {
  const group = new THREE.Group();

  const farZ = -ROOM_DEPTH / 2 - SOUTH_EXPAND - WALL_THICKNESS;

  const moonGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 6),
    new THREE.MeshBasicMaterial({
      color: 0x112233,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    })
  );
  moonGlow.position.set(0, ROOM_HEIGHT / 2, farZ - 5);
  group.add(moonGlow);

  const bgMat = new THREE.MeshBasicMaterial({
    color: 0x020208,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(26, 8), bgMat);
  bg.position.set(0, ROOM_HEIGHT / 2 + 2, farZ - 8);
  group.add(bg);

  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x040804,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -1.5, farZ - 2.5);
  group.add(ground);

  const treeMat = new THREE.MeshBasicMaterial({ color: 0x020402 });

  const trees = [];
  for (let i = 0; i < 100; i++) {
    const tx = (Math.random() - 0.5) * 25;
    const tz = farZ - 2.5 - Math.random() * 5.0;
    const th = 2.5 + Math.random() * 6.5;
    const r = Math.random();
    let type;
    if (r < 0.55) type = 'pine';
    else if (r < 0.85) type = 'round';
    else type = 'bare';
    trees.push({ x: tx, z: tz, h: th, type });
  }
  trees.sort((a, b) => a.z - b.z);

  trees.forEach(t => {
    if (t.type === 'pine') {
      const bw = 0.06 + Math.random() * 0.07;
      const tw = 0.5 + Math.random() * 1.0;
      const trunkH = t.h * 0.32;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.5, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const layers = 2 + Math.floor(Math.random() * 4);
      for (let l = 0; l < layers; l++) {
        const lh = t.h * 0.55 / layers;
        const lw = tw - l * tw * 0.22;
        const ly = -1.5 + trunkH + l * lh + lh / 2;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(0.12, lw), lh, 7),
          treeMat
        );
        cone.position.set(t.x, ly, t.z);
        group.add(cone);
      }
    } else if (t.type === 'round') {
      const bw = 0.05 + Math.random() * 0.08;
      const trunkH = t.h * 0.45;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.3, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const canopyR = 0.5 + Math.random() * 1.0;
      const canopyY = -1.5 + trunkH + canopyR * 0.65;
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(canopyR, 8, 6),
        treeMat
      );
      canopy.scale.set(1, 0.75, 1);
      canopy.position.set(t.x, canopyY, t.z);
      group.add(canopy);

      if (Math.random() > 0.4) {
        const subR = canopyR * 0.55;
        const sub = new THREE.Mesh(
          new THREE.SphereGeometry(subR, 7, 5),
          treeMat
        );
        sub.position.set(t.x + canopyR * 0.35, canopyY + canopyR * 0.25, t.z);
        group.add(sub);
      }
    } else {
      const bw = 0.03 + Math.random() * 0.04;
      const trunkH = t.h * 0.75;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.1, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const branches = 2 + Math.floor(Math.random() * 4);
      for (let b = 0; b < branches; b++) {
        const angle = (Math.random() - 0.5) * 1.2;
        const bLen = 0.25 + Math.random() * 0.7;
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.025, bLen, 5),
          treeMat
        );
        branch.position.set(
          t.x + Math.sin(angle) * bLen * 0.3,
          -1.5 + trunkH * 0.5 + b * trunkH * 0.22,
          t.z
        );
        branch.rotation.z = angle;
        group.add(branch);
      }
    }
  });

  return group;
}

function createProfDesk() {
  const group = new THREE.Group();

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.1 });
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.05, 1.2),
    deskMat
  );
  top.position.set(6.0, 0.85, -5.5);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  [
    [0.75, 0.55], [0.75, -0.55], [-0.75, 0.55], [-0.75, -0.55],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.82, 0.05),
      deskMat
    );
    leg.position.set(6.0 + lx, 0.41, -5.5 + lz);
    group.add(leg);
  });

  const chairGroup = new THREE.Group();
  chairGroup.position.set(6.0, 0, -5.1);

  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.2 });
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.04, 0.42),
    seatMat
  );
  seat.position.set(0, 0.48, 0);
  chairGroup.add(seat);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.40, 0.04),
    seatMat
  );
  back.position.set(0, 0.68, -0.18);
  chairGroup.add(back);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.44, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.6 })
  );
  stem.position.set(0, 0.24, 0);
  chairGroup.add(stem);

  const baseGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
  const basePlate = new THREE.Mesh(
    baseGeo,
    new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.5 })
  );
  basePlate.position.set(0, 0.02, 0);
  chairGroup.add(basePlate);

  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.5 });
  for (let s = 0; s < 5; s++) {
    const angle = s * (Math.PI * 2 / 5);
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.14),
      spokeMat
    );
    spoke.position.set(Math.cos(angle) * 0.08, 0.03, Math.sin(angle) * 0.08);
    spoke.rotation.y = angle;
    chairGroup.add(spoke);
  }

  group.add(chairGroup);

  const monProfMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.1 });
  if (!_projIconCanvas) {
    _projIconCanvas = document.createElement('canvas');
    _projIconCanvas.width = 128;
    _projIconCanvas.height = 96;
    _projIconCtx = _projIconCanvas.getContext('2d');
    _projIconTex = new THREE.CanvasTexture(_projIconCanvas);
    _projIconTex.minFilter = THREE.LinearFilter;
    _projIconTex.magFilter = THREE.LinearFilter;
    _projIconTex.colorSpace = THREE.SRGBColorSpace;
  }
  const _oc = _projIconCtx;
  _oc.fillStyle = '#000000';
  _oc.fillRect(0, 0, 128, 96);
  _oc.fillStyle = '#222222';
  _oc.font = '10px monospace';
  _oc.textAlign = 'center';
  _oc.fillText('SIN SEÑAL', 64, 48);
  _projIconTex.needsUpdate = true;
  const monProfScreenMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0x000000, emissiveIntensity: 0,
    map: _projIconTex, emissiveMap: _projIconTex,
  });

  const mframe = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.38, 0.06),
    monProfMat
  );
  mframe.position.set(6.0, 1.08, -6.0);
  group.add(mframe);

  const screenGeo = new THREE.PlaneGeometry(0.48, 0.32);
  const uv = screenGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), uv.getY(i));
  const mscreen = new THREE.Mesh(
    screenGeo,
    monProfScreenMat
  );
  mscreen.position.set(6.0, 1.08, -6.04);
  mscreen.rotation.y = Math.PI;
  group.add(mscreen);

  const towerProfMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.15 });
  const profTower = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.45, 0.32),
    towerProfMat
  );
  profTower.position.set(5.55, 1.05, -5.5);
  group.add(profTower);

  const ledProf = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x33ff33,
      emissive: 0x33ff33,
      emissiveIntensity: 1.5,
    })
  );
  ledProf.position.set(5.63, 1.22, -5.5);
  group.add(ledProf);

  const redBlink = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.06, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0xff1100,
      emissive: 0xff1100,
      emissiveIntensity: 2.0,
    })
  );
  redBlink.position.set(7.1, 0.04, -6.5);
  group.add(redBlink);
  profBlinkLight = { light: redBlink, baseIntensity: 2.0, phase: Math.random() * 10 };

  const cableGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.8, 6);
  const cable1 = new THREE.Mesh(cableGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
  cable1.position.set(5.55, 0.85, -5.5);
  cable1.rotation.z = -0.7;
  group.add(cable1);

  const cable2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
  );
  cable2.position.set(6.3, 0.3, -5.9);
  cable2.rotation.z = Math.PI / 3;
  group.add(cable2);

  const cable3 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
  );
  cable3.position.set(6.8, 0.06, -6.2);
  cable3.rotation.z = 0;
  group.add(cable3);

  profScreenRef = mscreen;
  profScreenMatRef = monProfScreenMat;

  return group;
}

function createRectFrustum(w1, h1, w2, h2, depth) {
  const hw1 = w1 / 2, hh1 = h1 / 2;
  const hw2 = w2 / 2, hh2 = h2 / 2;
  const pos = new Float32Array([
    -hw1, -hh1,  depth / 2,
     hw1, -hh1,  depth / 2,
     hw1,  hh1,  depth / 2,
    -hw1,  hh1,  depth / 2,
    -hw2, -hh2, -depth / 2,
     hw2, -hh2, -depth / 2,
     hw2,  hh2, -depth / 2,
    -hw2,  hh2, -depth / 2,
  ]);
  const idx = [0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function createProjector() {
  const group = new THREE.Group();
  group.position.set(0, ROOM_HEIGHT - 0.08, -2.5);

  const ceilDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.015, 16),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.3 })
  );
  group.add(ceilDisc);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.3, metalness: 0.5 })
  );
  arm.position.set(0, -0.18, 0);
  group.add(arm);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.16, 0.38),
    new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.25, metalness: 0.05 })
  );
  body.position.set(0, -0.42, 0);
  body.rotation.x = -0.25;
  group.add(body);
  projBodyRef = body;

  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.08, 0.10),
    new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.25, metalness: 0.05 })
  );
  lip.position.set(0, -0.50, -0.18);
  lip.rotation.x = -0.25;
  group.add(lip);

  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.02, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.3 })
  );
  vent.position.set(0, -0.36, -0.06);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.014, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.4 })
  );
  ring.position.set(0, -0.52, -0.22);
  ring.rotation.x = -0.25;
  group.add(ring);

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.045, 0.12, 12),
    new THREE.MeshStandardMaterial({
      color: 0x3366cc,
      emissive: 0x3366cc,
      emissiveIntensity: 2.5,
      roughness: 0.1,
      metalness: 0.1,
    })
  );
  lens.position.set(0, -0.52, -0.24);
  lens.rotation.x = -0.25;
  group.add(lens);

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x33ff33,
      emissive: 0x33ff33,
      emissiveIntensity: 2.0,
    })
  );
  led.position.set(0.25, -0.36, -0.10);
  group.add(led);

  const projBtn = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.3 })
  );
  projBtn.position.set(0, -0.36, 0.14);
  group.add(projBtn);
  projButtonRef = projBtn;

  const lensL = new THREE.Vector3(0, -0.52, -0.24);
  const telonL = new THREE.Vector3(0, 2.5 - (ROOM_HEIGHT - 0.08), -7.5 + 2.5);
  const beamDir = new THREE.Vector3().subVectors(telonL, lensL);
  const beamH = beamDir.length();
  beamDir.normalize();
  const beamMid = new THREE.Vector3().addVectors(lensL, telonL).multiplyScalar(0.5);
  const negDir = beamDir.clone().negate();
  const beamLayers = [
    [0.08, 0.06, 2.4, 1.8, 0.035],
    [0.20, 0.15, 3.2, 2.4, 0.015],
    [0.40, 0.30, 4.0, 3.0, 0.006],
  ];
  const beamGroup = new THREE.Group();
  beamLayers.forEach(([w1, h1, w2, h2, op]) => {
    const g = createRectFrustum(w1, h1, w2, h2, beamH);
    const m = new THREE.MeshBasicMaterial({
      color: 0x88bbff, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(beamMid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), negDir);
    beamGroup.add(mesh);
  });
  beamGroup.visible = false;
  group.add(beamGroup);
  beamRef = beamGroup;

  return group;
}

function createDustParticles() {
  const count = 120;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const baseZ = -ROOM_DEPTH / 2 - SOUTH_EXPAND;
  const topZ = ROOM_DEPTH / 2;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * ROOM_WIDTH;
    positions[i * 3 + 1] = 0.2 + Math.random() * (ROOM_HEIGHT - 0.4);
    positions[i * 3 + 2] = baseZ + Math.random() * (topZ - baseZ);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x8899aa,
    size: 0.018,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const ceilingFlickerLights = [];
let sceneAmbient = null;
let mainScene = null;
let currentPreset = 'default';
let _wbCanvas = null;
let _wbCtx = null;
let _wbTex = null;
let _wbMat = null;
let _wbInfMat = null;

export function setWhiteboardGlow(intensity) {
  if (_wbMat) _wbMat.emissiveIntensity = intensity;
  if (_wbInfMat) {
    _wbInfMat.opacity = intensity > 0.5 ? 0.7 : 0;
  }
}

function drawWhiteboardCanvas(ctx) {
  const w = 512, h = 512;
  ctx.fillStyle = '#0a0a0e';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#1a1a22';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  const col = '#1a1a2a';

  function terrorText(text, x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || (Math.random() - 0.5) * 0.015);
    ctx.fillStyle = col;
    ctx.font = `italic ${size}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5 + Math.random() * 0.15;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  terrorText('Entre infinitas ideas', w / 2, 130, 26);
  terrorText('se esconde una clave.', w / 2, 170, 24);
  terrorText('Dale una vuelta', w / 2, 230, 26, 0.02);
  terrorText('y ver\u00e1s su verdad.', w / 2, 270, 24);

  for (let i = 0; i < 6; i++) {
    const sx = 30 + Math.random() * 180;
    const sy = 360 + Math.random() * 100;
    const sr = 1.5 + Math.random() * 4;
    ctx.strokeStyle = '#12121a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * (1 + Math.random()));
    ctx.stroke();
  }
}

function createWhiteboard() {
  const group = new THREE.Group();
  const bw = 1.8, bh = 1.6, bd = 0.03, fw = 0.06;
  const boardBottom = 0.6;

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a, roughness: 0.3, metalness: 0.8,
  });

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  drawWhiteboardCanvas(ctx);

  const boardTex = new THREE.CanvasTexture(canvas);
  boardTex.minFilter = THREE.LinearFilter;
  boardTex.magFilter = THREE.LinearFilter;
  _wbCanvas = canvas;
  _wbCtx = ctx;
  _wbTex = boardTex;

  const texMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0e,
    map: boardTex,
    emissiveMap: boardTex,
    emissive: 0x8800ff,
    emissiveIntensity: 0.02,
    roughness: 0.9,
    metalness: 0.0,
  });
  _wbMat = texMat;

  const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), texMat);
  board.position.set(0, bh / 2 + boardBottom, 0);
  group.add(board);

  const infCanvas = document.createElement('canvas');
  infCanvas.width = 64;
  infCanvas.height = 64;
  const infCtx = infCanvas.getContext('2d');
  infCtx.clearRect(0, 0, 64, 64);
  infCtx.save();
  infCtx.translate(32, 32);
  infCtx.rotate(0.03);
  infCtx.strokeStyle = '#ff2222';
  infCtx.lineWidth = 2.5;
  infCtx.beginPath();
  infCtx.arc(0, 0, 30, -0.3, Math.PI * 0.8);
  infCtx.stroke();
  infCtx.beginPath();
  infCtx.arc(7, 0, 30, Math.PI * 1.1, Math.PI * 2.2);
  infCtx.stroke();
  infCtx.fillStyle = '#ff2222';
  infCtx.font = '38px serif';
  infCtx.textAlign = 'center';
  infCtx.textBaseline = 'middle';
  infCtx.globalAlpha = 0.7;
  infCtx.fillText('\u221e', 4, -2);
  infCtx.restore();
  const infTex = new THREE.CanvasTexture(infCanvas);
  const infMat = new THREE.MeshBasicMaterial({
    map: infTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const infMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), infMat);
  infMesh.position.set(bw / 2 - 0.35, bh + boardBottom - 0.35, bd / 2 + 0.001);
  group.add(infMesh);
  _wbInfMat = infMat;

  const ft = new THREE.Mesh(new THREE.BoxGeometry(bw + fw * 2, fw, fw), ironMat);
  ft.position.set(0, bh + boardBottom, 0);
  group.add(ft);

  const fb = ft.clone();
  fb.position.set(0, boardBottom, 0);
  group.add(fb);

  const fs = new THREE.Mesh(new THREE.BoxGeometry(fw, bh, fw), ironMat);
  fs.position.set(-bw / 2 - fw / 2, bh / 2 + boardBottom, 0);
  group.add(fs);

  const fd = fs.clone();
  fd.position.set(bw / 2 + fw / 2, bh / 2 + boardBottom, 0);
  group.add(fd);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, boardBottom, 8), ironMat);
  legL.position.set(-bw / 2 + 0.2, boardBottom / 2, 0.06);
  group.add(legL);

  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, boardBottom, 8), ironMat);
  legR.position.set(bw / 2 - 0.2, boardBottom / 2, 0.06);
  group.add(legR);

  const backL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, boardBottom * 0.85, 6), ironMat);
  backL.position.set(-bw / 2 + 0.25, boardBottom * 0.45, 0.35);
  backL.rotation.x = 0.25;
  group.add(backL);

  const backR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, boardBottom * 0.85, 6), ironMat);
  backR.position.set(bw / 2 - 0.25, boardBottom * 0.45, 0.35);
  backR.rotation.x = 0.25;
  group.add(backR);

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.5, 0.025, 0.025), ironMat);
  crossbar.position.set(0, boardBottom * 0.55, 0.2);
  group.add(crossbar);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.4 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.3, 0.03, 0.35), baseMat);
  base.position.set(0, 0.015, 0.06);
  group.add(base);

  group.position.set(-6.1, 0, -8.0);
  group.rotation.y = 0.35;

  return group;
}

function spawnVictoryDoor(scene) {
  const group = new THREE.Group();
  const fw = 1.5, fh = 2.5;
  group.position.set(-7.15, fh / 2 + 0.3, -6.0);
  group.rotation.y = Math.PI / 2;
  group.visible = false;

  const violetMat = new THREE.MeshStandardMaterial({ color: 0x9400D3, emissive: 0xaa22ff, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.3 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xFF0000, emissive: 0xff2222, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.3 });
  const greenMatBar = new THREE.MeshStandardMaterial({ color: 0x00CC00, emissive: 0x22ff22, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.3 });
  const blueMatBar = new THREE.MeshStandardMaterial({ color: 0x0066FF, emissive: 0x2266ff, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.3 });

  const ft = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.06, 0.06), violetMat);
  ft.position.set(0, fh / 2, 0);
  group.add(ft);

  const fb = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.06, 0.06), greenMatBar);
  fb.position.set(0, -fh / 2, 0);
  group.add(fb);

  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.06, fh, 0.06), blueMatBar);
  fl.position.set(-fw / 2, 0, 0);
  group.add(fl);

  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, fh, 0.06), redMat);
  fr.position.set(fw / 2, 0, 0);
  group.add(fr);

  const cornerDefs = [
    { color: 0x9400D3, emissive: 0xaa22ff, x: -fw / 2, y: fh / 2 },
    { color: 0xFF0000, emissive: 0xff2222, x: fw / 2, y: fh / 2 },
    { color: 0x00CC00, emissive: 0x22ff22, x: fw / 2, y: -fh / 2 },
    { color: 0x0066FF, emissive: 0x2266ff, x: -fw / 2, y: -fh / 2 },
  ];

  cornerDefs.forEach(({ color, emissive, x, y }) => {
    const sMat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 4.0,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), sMat);
    sphere.position.set(x, y, 0.02);
    group.add(sphere);

    const light = new THREE.PointLight(color, 2.0, 3.5, 2);
    light.position.set(x, y, 0.08);
    group.add(light);
  });

  const gCanvas = document.createElement('canvas');
  gCanvas.width = 128;
  gCanvas.height = 128;
  const gCtx = gCanvas.getContext('2d');
  const gCorners = [
    { x: 10, y: 10, color: 'rgba(148,0,211,0.5)' },
    { x: 118, y: 10, color: 'rgba(255,0,0,0.5)' },
    { x: 118, y: 118, color: 'rgba(0,204,0,0.5)' },
    { x: 10, y: 118, color: 'rgba(0,102,255,0.5)' },
  ];
  gCorners.forEach(({ x, y, color }) => {
    const rad = gCtx.createRadialGradient(x, y, 2, x, y, 70);
    rad.addColorStop(0, color);
    rad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    gCtx.fillStyle = rad;
    gCtx.fillRect(0, 0, 128, 128);
  });
  const gTex = new THREE.CanvasTexture(gCanvas);
  const portalMat = new THREE.MeshBasicMaterial({
    map: gTex,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.1, fh - 0.1), portalMat);
  portal.position.z = -0.01;
  group.add(portal);

  scene.add(group);
  _victoryDoor = group;
  return group;
}

let _victoryDoor = null;
let _doorEyeInst = null;
let _doorEyeMesh = null;
let _blueTex = null;
let _blueScreenIdx = -1;
let _violetTex = null;
let _violetScreenIdx = -1;

let _testRoom, _desks, _profDesk, _backWall, _hallway, _city, _forest, _whiteboard, _ceilingLights, _hallwayLights, _projector, _dust, _starfield, _finalFloor;

function createDoorEye(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35));
  mesh.position.set(0, 1.5, 6.93);
  mesh.rotation.y = Math.PI;
  mesh.visible = false;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xff4444, emissiveIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide,
  });
  mesh.material = mat;
  scene.add(mesh);

  const inst = {
    idx: 0,
    meshes: [mesh],
    mats: [mat],
    canvas, ctx, tex,
    frameCount: 0,
    type: 'door',
    glitchType: 3,
    glitchTimer: 9999,
    stareTimer: 60,
    saccadeTarget: null,
    blinkTimer: 120 + Math.floor(Math.random() * 120),
    blinkPhase: 0,
    seed: Math.random() * 100,
    emotion: { current: 'anger', target: 'anger', blend: 1, _alarmTimer: 0 },
  };
  eyeInstances.push(inst);
  _doorEyeInst = inst;
  _doorEyeMesh = mesh;
}

function createStarfield() {
  const geo = new THREE.BufferGeometry();
  const count = 1500;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 35;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xddeeff, size: 0.06, depthWrite: false });
  const stars = new THREE.Points(geo, mat);
  stars.visible = false;
  return stars;
}

function startEscapeEndingSequence() {
  gameState.grandFinale = 1;
  gameState.finaleTimer = 0;
  playDoorOpen();
  setTimeout(() => {
    removeRoomShell();
    document.getElementById('victory-overlay').classList.add('active');
    setTimeout(() => {
      document.getElementById('victory-overlay').classList.remove('active');
    }, 3000);
  }, 800);
}

function removeRoomShell() {
  [_testRoom, _backWall, _hallway, _city, _forest, _hallwayLights, _projector, _dust].forEach(ref => { if (ref) ref.visible = false; });
  [switchGroupRef, comboGroupRef, puertaProxyRef, puertaRef].forEach(ref => { if (ref) ref.visible = false; });
  if (_doorEyeMesh) _doorEyeMesh.visible = false;
  roomScreenMeshes.forEach(m => { if (m) m.visible = false; });
  if (_finalFloor) _finalFloor.visible = true;
  if (_starfield) _starfield.visible = true;
  if (mainScene) {
    mainScene.background = new THREE.Color(0x000a1a);
    mainScene.fog = null;
    const centerLight = new THREE.PointLight(0x8899cc, 6.0, 18, 1.3);
    centerLight.position.set(0, 4, 0);
    mainScene.add(centerLight);
    const floorLight = new THREE.PointLight(0x5577aa, 2.0, 12, 1.8);
    floorLight.position.set(0, 0.5, 0);
    mainScene.add(floorLight);
  }
  if (sceneAmbient) {
    sceneAmbient.intensity = 0.4;
    sceneAmbient.color.set(0x445566);
  }
}

function createCeilingLights() {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.7,
    metalness: 0.2,
  });

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x8899bb,
    emissive: FLUORESCENT.glowEmission,
    emissiveIntensity: FLUORESCENT.glowIntensity,
    roughness: 0.5,
  });

  const positions = [
    [-3.6, -3.0],
    [-3.6,  3.0],
    [ 3.6, -3.0],
    [ 3.6,  3.0],
  ];

  positions.forEach(([x, z], idx) => {
    const isDead = idx === 3;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.06, 0.5),
      frameMat
    );
    frame.position.set(x, ROOM_HEIGHT - 0.03, z);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.025, 0.34),
      isDead ? new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x111111, emissiveIntensity: 0.0, roughness: 0.5 }) : glowMat
    );
    panel.position.set(x, ROOM_HEIGHT - 0.065, z);

    const light = new THREE.PointLight(
      FLUORESCENT.color,
      isDead ? 0.02 : FLUORESCENT.intensityEach,
      FLUORESCENT.distance,
      FLUORESCENT.decay
    );
    light.position.set(x, ROOM_HEIGHT - 0.2, z);
    if (idx === 0 && !isDead) {
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 20;
      light.shadow.bias = -0.002;
    } else {
      light.castShadow = false;
    }

    group.add(frame, panel, light);

    ceilingFlickerLights.push({
      light,
      panel,
      baseIntensity: isDead ? 0.02 : FLUORESCENT.intensityEach,
      phase: idx * 2.1 + (isDead ? 50 : 0),
      isDead,
    });
  });

  return group;
}

const hallwayFlickerLights = [];
const hallwayDeadLights = [];
const hallwayScreenMats = [];
const hallwayScreenMeshes = [];
const roomScreenMats = [];
const roomScreenMeshes = [];

const eyeInstances = [];
let profBlinkLight = null;
let profScreenRef = null;
let profScreenMatRef = null;
let telonRef = null;
let projButtonRef = null;
let projBodyRef = null;
let beamRef = null;

export const gameState = {
  remoteCollected: false,
  powerConnected: false,
  projectorOn: false,
  combinationDigits: { violet: 0, red: 8, green: 0, blue: 0 },
  blueCode: { solved: false, digit: 0, pushedCount: 0 },
  violetCode: { solved: false, digit: 0, targetScreenIdx: -1 },
  dizzyEndTime: 0,
  timer: null,
  flashlightCollected: false,
  flashlightOn: false,
  codeValidated: false,
  cameraAnim: { active: false, startPos: null, targetPos: null, startQuat: null, targetQuat: null, progress: 0 },
  eyeTrapStage: 0,
  eyeTrapTimer: 0,
  eyeTrapEye: null,
  whiteFlash: 0,
  victoryOpening: false,
  victoryStage: 0,
  grandFinale: 0,
  finaleTimer: 0,
  finaleCamStart: null,
  finaleCamTarget: new THREE.Vector3(0, 8, 35),
  finaleFreeFlight: false,
  finalePullbackStart: null,
  finalePullbackTarget: new THREE.Vector3(0, 8, 35),
  finaleFlySpeed: 10,
  camera: null,
};

export const bluePuzzleChairRefs = [];

export const deskColliders = [];

export const violetEyeState = {
  targetScreenIdx: -1,
  eyeScreenIdx: -1,
  instance: null,
  visible: false,
  timer: 0,
  duration: 5,
};

export const questionMonitorState = {
  active: false,
  screenIdx: -1,
  proxy: null,
  proxyData: null,
  meshesRef: null,
  dataRef: null,
  canvas: null,
  ctx: null,
  tex: null,
};

function createHallwayLights() {
  const hlMat = new THREE.MeshStandardMaterial({
    color: 0x8899bb,
    emissive: 0xaabbdd,
    emissiveIntensity: 1.2,
  });

  const deadMat = new THREE.MeshStandardMaterial({
    color: 0x222228,
    emissive: 0x111115,
    emissiveIntensity: 0.0,
  });

  const positions = [
    [-12.0, 7.5],
    [ 12.0, 7.5],
    [-12.0, 10.5],
    [ 12.0, 10.5],
    [ 0.0, 9.0],
  ];

  const group = new THREE.Group();

  positions.forEach(([x, z], idx) => {
    const isDead = idx === 4;
    const isFlicker = idx === 0 || idx === 3;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.18),
      isDead ? deadMat : hlMat
    );
    panel.position.set(x, PASILLO_HEIGHT - 0.01, z);
    panel.rotation.x = -Math.PI / 2;
    group.add(panel);

    const light = new THREE.PointLight(
      0xaabbdd,
      isDead ? 0.0 : 3.0,
      28,
      1.5
    );
    light.position.set(x, PASILLO_HEIGHT - 0.3, z);
    group.add(light);

    if (isDead) {
      hallwayDeadLights.push({ light, panel });
    } else if (isFlicker) {
      hallwayFlickerLights.push({ light, panel, baseIntensity: 3.0, phase: Math.random() * 100 });
    }
  });

  const emergMat = new THREE.MeshStandardMaterial({
    color: 0xff2200,
    emissive: 0xff2200,
    emissiveIntensity: 0.4,
  });
  const emergPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.12),
    emergMat
  );
  emergPanel.position.set(14, PASILLO_HEIGHT - 0.01, 11.7);
  emergPanel.rotation.x = -Math.PI / 2;
  group.add(emergPanel);

  const emergLight = new THREE.PointLight(0xff2200, 0.8, 6, 2);
  emergLight.position.set(14, PASILLO_HEIGHT - 0.3, 11.7);
  group.add(emergLight);
  hallwayFlickerLights.push({ light: emergLight, panel: emergPanel, baseIntensity: 0.8, phase: 77, isEmergency: true });

  return group;
}

export { createWallMaterial, createNoisyTexture, hallwayFlickerLights, hallwayDeadLights, hallwayScreenMats, ceilingFlickerLights, roomScreenMats, roomScreenMeshes, hallwayScreenMeshes, eyeInstances, profBlinkLight, profScreenRef, profScreenMatRef, telonRef, projButtonRef, beamRef, _victoryDoor as victoryDoorRef, _doorEyeMesh as doorEyeMeshRef, _testRoom as testRoomRef, _backWall as backWallRef, _hallway as hallwayRef, _city as cityRef, _forest as forestRef, _ceilingLights as ceilingLightsRef, _hallwayLights as hallwayLightsRef, _projector as projectorRef, _dust as dustRef, _starfield as starfieldRef, _blueTex as blueTexRef, _blueScreenIdx as blueScreenIdxRef, _violetTex as violetTexRef, _violetScreenIdx as violetScreenIdxRef };

export function setLightingPreset(preset) {
  const p = LIGHTING_PRESETS[preset];
  if (!p) return;
  currentPreset = preset;
  if (mainScene && mainScene.fog) {
    mainScene.fog.density = p.fogDensity;
  }
  if (sceneAmbient) {
    sceneAmbient.color.set(p.ambientColor);
    sceneAmbient.intensity = p.ambientIntensity;
  }
  ceilingFlickerLights.forEach(item => {
    if (p.fluorescentColor) {
      item.light.color.set(p.fluorescentColor);
    }
    if (!item.isDead || preset === 'default') {
      item.baseIntensity = p.fluorescentIntensity;
      item.light.intensity = p.fluorescentIntensity;
    }
    if (item.panel && item.panel.material) {
      if (p.glowEmission) {
        item.panel.material.color.set(p.glowEmission);
        item.panel.material.emissive.set(p.glowEmission);
      }
      item.panel.material.emissiveIntensity = (item.isDead && preset !== 'default') ? 0.0 : p.glowIntensity;
    }
  });
}

export function getCurrentPreset() {
  return currentPreset;
}

export function connectPower() {
  if (gameState.powerConnected) return;
  gameState.powerConnected = true;
  if (profBlinkLight && profBlinkLight.light && profBlinkLight.light.material) {
    profBlinkLight.light.material.color.set(0x33ff33);
    profBlinkLight.light.material.emissive.set(0x33ff33);
  }
  if (profScreenRef && profScreenRef.material) {
    drawProjectorIcon();
  }
}

export function toggleProjector() {
  gameState.projectorOn = !gameState.projectorOn;
  if (profScreenRef && profScreenRef.material) {
    drawProjectorIcon();
  }
}

let _projIconCanvas = null;
let _projIconCtx = null;
let _projIconTex = null;

function drawProjectorIcon() {
  if (!_projIconCtx || !profScreenRef || !profScreenRef.material) return;
  const ctx = _projIconCtx;
  ctx.clearRect(0, 0, 128, 96);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 96);

  if (!gameState.powerConnected) {
    ctx.fillStyle = '#222222';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SIN SE\u00d1AL', 64, 48);
  } else {
    ctx.save();
    ctx.translate(64, 48);
    ctx.scale(-1, 1);
    ctx.translate(-64, -48);

    const cx = 64, cy = 48;

    if (gameState.projectorOn) {
      ctx.strokeStyle = '#44cc44';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 14);
      ctx.lineTo(cx, cy + 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#cc0000';
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(cx - 3, cy - 18, 6, 18);
    }

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(gameState.projectorOn ? 'PROYECTOR ACTIVO' : 'PROYECTOR APAGADO', 64, 78);

    ctx.restore();
  }

  _projIconTex.needsUpdate = true;
  profScreenRef.material.color.set(0xffffff);
  profScreenRef.material.map = _projIconTex;
  profScreenRef.material.emissiveMap = _projIconTex;
  profScreenRef.material.emissive.set(0xffffff);
  profScreenRef.material.emissiveIntensity = 2.0;
  profScreenRef.material.needsUpdate = true;
}

export function createExtraInteractables(scene) {
  const meshes = [];
  const data = new Map();

  let rPos;
  let rValid;
  do {
    rPos = { x: -6 + Math.random() * 12, z: -6 + Math.random() * 10 };
    rValid = true;
    for (const rect of deskColliders) {
      if (rPos.x > rect.minX && rPos.x < rect.maxX &&
          rPos.z > rect.minZ - 0.3 && rPos.z < rect.maxZ + 0.3) {
        rValid = false;
        break;
      }
    }
  } while (!rValid);

  const remoteMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.3 });
  const remote = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.18), remoteMat);
  remote.position.set(rPos.x, 0.02, rPos.z);
  scene.add(remote);
  meshes.push(remote);

  const remoteLedMat = new THREE.MeshStandardMaterial({
    color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.5,
  });
  const remoteLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), remoteLedMat);
  remoteLed.position.set(rPos.x, 0.04, rPos.z - 0.055);
  scene.add(remoteLed);

  data.set(remote, {
    id: 'remote',
    label: 'control remoto',
    message: 'Presiona E para recoger',
    action() {
      if (gameState.remoteCollected) return;
      gameState.remoteCollected = true;
      updateInventory(gameState);
      playItemPickup();
      remote.visible = false;
      remoteLed.visible = false;
      this.message = 'Control remoto recogido.';
    },
  });

  if (projBodyRef) {
    meshes.push(projBodyRef);
    data.set(projBodyRef, {
      id: 'proyector',
      label: 'proyector',
      message: 'Necesitas el control remoto.',
      action() {
        if (!gameState.remoteCollected) {
          this.message = 'Necesitas el control remoto.';
          return;
        }
        toggleProjector();
        this.message = gameState.projectorOn ? 'Proyector encendido.' : 'Proyector apagado.';
      },
    });
  }

  let fPos;
  let valid;
  do {
    fPos = { x: -6 + Math.random() * 12, z: -6 + Math.random() * 10 };
    valid = true;
    for (const rect of deskColliders) {
      if (fPos.x > rect.minX && fPos.x < rect.maxX &&
          fPos.z > rect.minZ - 0.3 && fPos.z < rect.maxZ + 0.3) {
        valid = false;
        break;
      }
    }
  } while (!valid);

  const flashGroup = new THREE.Group();
  flashGroup.position.set(fPos.x, 0.01, fPos.z);
  flashGroup.scale.set(2, 2, 2);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.5 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.6 });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.06, 10), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 0);
  flashGroup.add(barrel);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.025, 0.025, 10), headMat);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0, 0.04);
  flashGroup.add(head);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 12), ringMat);
  ring.position.set(0, 0, 0.028);
  ring.rotation.x = Math.PI / 2;
  flashGroup.add(ring);

  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffeecc, emissive: 0xffeecc, emissiveIntensity: 1.5,
  });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), lensMat);
  lens.position.set(0, 0, 0.053);
  flashGroup.add(lens);

  scene.add(flashGroup);
  meshes.push(flashGroup);

  data.set(flashGroup, {
    id: 'flashlight',
    label: 'linterna',
    message: 'Presiona E para recoger',
    action() {
      if (gameState.flashlightCollected) return;
      gameState.flashlightCollected = true;
      updateInventory(gameState);
      playItemPickup();
      flashGroup.visible = false;
      gameState.flashlightOn = true;
      this.message = 'Linterna recogida. Presiona F para encender/apagar.';
    },
  });

  const CLUES = {
    blue: 'La clase termina,\npero las sillas permanecen,\nsosteniendo el peso\nde las ideas que no se dijeron.',
    green: 'una buena idea parte\npor mirar al miedo\nde frente',
    violet: 'Donde todos ven un problema,\nuna mirada distinta\nencuentra la solucion.',
    red: 'Donde otros ven\nuna pizarra vacia,\nla luz correcta\nencuentra una leccion.',
  };

  const paperPositions = [
    { color: 'blue', x: -4.5, z: 0.5 },
    { color: 'green', x: 0, z: -5.5 },
    { color: 'violet', x: 3.5, z: -2.5 },
    { color: 'red', x: -5.5, z: -7.5 },
  ];

  const paperColors = {
    blue: { emissive: 0x2244ff, hex: '#4488ff' },
    green: { emissive: 0x22aa44, hex: '#44cc44' },
    violet: { emissive: 0x5522aa, hex: '#8844cc' },
    red: { emissive: 0xaa2222, hex: '#cc4444' },
  };

  paperPositions.forEach(({ color, x, z }) => {
    const pc = paperColors[color];
    const paperMat = new THREE.MeshStandardMaterial({
      color: 0xe8e0c8,
      emissive: pc.emissive,
      emissiveIntensity: 0.08,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), paperMat);
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = (Math.random() - 0.5) * 0.3;
    paper.position.set(x, 0.005, z);
    scene.add(paper);

    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.15, 0.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(x, 0.06, z);
    scene.add(proxy);
    meshes.push(proxy);

    data.set(proxy, {
      id: `clue_${color}`,
      label: 'papel',
      message: 'Presiona E para leer',
      action() {
        showClueUI(CLUES[color], color);
      },
    });
  });

  bluePuzzleChairRefs.forEach((chair, i) => {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.8, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(chair.mx, chair.seatY + 0.3, chair.offsetZ + 0.15);
    scene.add(proxy);
    meshes.push(proxy);

    data.set(proxy, {
      id: `blueChair_${i}`,
      label: 'silla resaltada',
      message: 'Presiona E para empujar la silla',
      action() {
        if (chair.pushed) {
          this.message = 'Ya empujaste esta silla.';
          return;
        }
        chair.pushed = true;
        chair.pushing = true;
        chair.progress = 0;
        gameState.blueCode.pushedCount++;

        this.message = `Silla empujada (${gameState.blueCode.pushedCount}/5)`;

        if (gameState.blueCode.pushedCount === 5) {
          gameState.blueCode.digit = Math.floor(Math.random() * 10);
          gameState.combinationDigits.blue = gameState.blueCode.digit;
          gameState.blueCode.solved = true;

          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0a1a3a';
          ctx.fillRect(0, 0, 256, 256);
          ctx.fillStyle = '#4488ff';
          ctx.font = 'bold 160px Courier New';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(gameState.blueCode.digit), 128, 128);

          const tex = new THREE.CanvasTexture(canvas);
          chair.screen.material.map = tex;
          chair.screen.material.emissiveMap = tex;
          chair.screen.material.emissive.set(0xffffff);
          chair.screen.material.emissiveIntensity = 2.0;
          chair.screen.material.needsUpdate = true;
          chair.screen.userData.blueCodeScreen = true;
          _blueTex = tex;
          _blueScreenIdx = roomScreenMeshes.indexOf(chair.screen);

          showMessage(`Codigo azul revelado: ${gameState.blueCode.digit}`);
        }
      },
    });
  });

  if (violetEyeState.targetScreenIdx >= 0) {
    const vScreen = roomScreenMeshes[violetEyeState.targetScreenIdx];
    const vPos = vScreen.position;
    const vProxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    vProxy.position.set(vPos.x, vPos.y, vPos.z - 0.15);
    scene.add(vProxy);
    meshes.push(vProxy);

    data.set(vProxy, {
      id: 'violetScreen',
      label: 'pantalla violeta',
      message: 'Presiona E para interactuar',
      action() {
        if (gameState.violetCode.solved) {
          this.message = 'Ya descubriste el codigo violeta.';
          return;
        }
        gameState.violetCode.digit = Math.floor(Math.random() * 10);
        gameState.combinationDigits.violet = gameState.violetCode.digit;
        gameState.violetCode.solved = true;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a0030';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#aa44ff';
        ctx.font = 'bold 160px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gameState.violetCode.digit), 128, 128);

        const tex = new THREE.CanvasTexture(canvas);
        vScreen.material.map = tex;
        vScreen.material.emissiveMap = tex;
        vScreen.material.emissive.set(0xffffff);
        vScreen.material.emissiveIntensity = 2.0;
        vScreen.material.needsUpdate = true;
        _violetTex = tex;
        _violetScreenIdx = violetEyeState.targetScreenIdx;

        showMessage(`Codigo violeta revelado: ${gameState.violetCode.digit}`);
      },
    });
  }

  const sdProxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 2.8, 0.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  sdProxy.position.set(-7.15, 1.6, -6.0);
  sdProxy.rotation.y = Math.PI / 2;
  scene.add(sdProxy);
  meshes.push(sdProxy);

  data.set(sdProxy, {
    id: 'secretDoor',
    label: 'puerta especial',
    message: '',
    action() {
      if (!gameState.codeValidated) {
        showMessage('Necesitas validar el c\u00f3digo');
        return;
      }
      startEscapeEndingSequence();
    },
  });

  return { meshes, data };
}

const EMOTIONS = {
  neutral: { ryScale: 1, pupilScale: 1, scleraRed: 0, browRaise: 0, blinkSpeed: 1, gazeIntensity: 0.02, jitter: 1 },
  alarm: { ryScale: 1.3, pupilScale: 1.3, scleraRed: 0.25, browRaise: 0.2, blinkSpeed: 1.5, gazeIntensity: 0.04, jitter: 0.5 },
  malice: { ryScale: 0.8, pupilScale: 0.8, scleraRed: 0.15, browRaise: -0.15, blinkSpeed: 0.7, gazeIntensity: 0.04, jitter: 0.3 },
  fear: { ryScale: 1.4, pupilScale: 1.5, scleraRed: 0.45, browRaise: 0.3, blinkSpeed: 2, gazeIntensity: 0.01, jitter: 1.5 },
  anger: { ryScale: 0.65, pupilScale: 0.65, scleraRed: 0.55, browRaise: -0.25, blinkSpeed: 0.5, gazeIntensity: 0.04, jitter: 0 },
};

function getEmotionParams(e) {
  const from = EMOTIONS[e.current] || EMOTIONS.neutral;
  const to = EMOTIONS[e.target] || EMOTIONS.neutral;
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

function setEmotion(inst, target) {
  if (inst.emotion.target === target) return;
  inst.emotion.current = inst.emotion.target;
  inst.emotion.target = target;
  inst.emotion.blend = 0;
}

function updateEyeEmotion(inst, camera, worldPos) {
  const e = inst.emotion;
  if (e.current !== e.target) {
    e.blend += 0.03;
    if (e.blend >= 1) {
      e.blend = 0;
      e.current = e.target;
    }
  }
  if (inst.type === 'violet') return;

  const dist = camera.position.distanceTo(worldPos);

  if (dist < 1.8 && e.target !== 'fear') {
    setEmotion(inst, 'fear');
  } else if (dist < 3 && e.target === 'neutral') {
    setEmotion(inst, 'alarm');
  } else if (dist < 3 && inst.stareTimer > 10 && e.target === 'neutral') {
    setEmotion(inst, 'malice');
  } else if (dist > 6 && e.target !== 'neutral' && e.current === e.target) {
    setEmotion(inst, 'neutral');
  }

  if (inst.stareTimer > 30 && e.target === 'neutral' && Math.random() < 0.002) {
    setEmotion(inst, Math.random() < 0.5 ? 'malice' : 'anger');
  }
  if (inst.stareTimer > 50 && e.target === 'malice' && Math.random() < 0.003) {
    setEmotion(inst, 'anger');
  }

  if (Math.random() < 0.001 && e.target === 'neutral') {
    setEmotion(inst, 'alarm');
    inst.emotion._alarmTimer = 30;
  }
  if (inst.emotion._alarmTimer > 0) {
    inst.emotion._alarmTimer--;
    if (inst.emotion._alarmTimer === 0) setEmotion(inst, 'neutral');
  }
}

export function spawnEye(meshes, mats, type) {
  if (meshes.length === 0) return;
  const used = new Set(eyeInstances.map(e => e.idx));
  const blocked = new Set(used);
  used.forEach(u => {
    blocked.add(u - 1);
    blocked.add(u + 1);
    if (type === 'room') {
      blocked.add(u - 5);
      blocked.add(u + 5);
    }
  });
  const candidates = [];
  for (let i = 0; i < meshes.length; i++) {
    if (!blocked.has(i) && !meshes[i].userData.blueCodeScreen && !meshes[i].userData.violetCodeScreen && !meshes[i].userData.questionMonitor) candidates.push(i);
  }
  if (candidates.length === 0) return;
  const idx = candidates[Math.floor(Math.random() * candidates.length)];

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  meshes[idx].material.map = tex;
  meshes[idx].material.emissiveMap = tex;
  meshes[idx].material.emissive.set(0xffffff);
  meshes[idx].material.emissiveIntensity = 0.4;
  meshes[idx].material.needsUpdate = true;

  const instance = {
    idx,
    meshes,
    mats,
    canvas,
    ctx,
    tex,
    frameCount: 0,
    type,
    glitchType: 0,
    glitchTimer: 0,
    stareTimer: 0,
    saccadeTarget: null,
    blinkTimer: 120 + Math.floor(Math.random() * 120),
    blinkPhase: 0,
    seed: Math.random() * 100,
    emotion: {
      current: 'neutral',
      target: 'neutral',
      blend: 0,
      _alarmTimer: 0,
    },
  };
  eyeInstances.push(instance);
  return instance;
}

export function clearEye(instance) {
  const idx = instance.idx;
  if (instance.meshes[idx].userData.violetCodeScreen) return;
  instance.meshes[idx].material.map = null;
  instance.meshes[idx].material.emissiveMap = null;
  instance.meshes[idx].material.emissive.set(0x445588);
  instance.meshes[idx].material.emissiveIntensity = instance.mats[idx].emissiveIntensity;
  instance.meshes[idx].material.needsUpdate = true;
  eyeInstances.splice(eyeInstances.indexOf(instance), 1);
}

export function spawnVioletEye() {
  const tIdx = violetEyeState.targetScreenIdx;
  if (tIdx < 0) return;

  const used = new Set(eyeInstances.map(e => e.idx));
  const mi = tIdx % 4;
  const adjacent = [];
  if (mi > 0) adjacent.push(tIdx - 1);
  if (mi < 3) adjacent.push(tIdx + 1);
  const candidates = adjacent.filter(i =>
    !used.has(i) && !roomScreenMeshes[i].userData.blueCodeScreen && !roomScreenMeshes[i].userData.violetCodeScreen && !roomScreenMeshes[i].userData.questionMonitor
  );
  if (candidates.length === 0) return;

  const eIdx = candidates[Math.floor(Math.random() * candidates.length)];

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const mesh = roomScreenMeshes[eIdx];
  mesh.material.map = tex;
  mesh.material.emissiveMap = tex;
  mesh.material.emissive.set(0xffffff);
  mesh.material.emissiveIntensity = 0.4;
  mesh.material.needsUpdate = true;

  const targetPos = new THREE.Vector3();
  roomScreenMeshes[tIdx].getWorldPosition(targetPos);

  const instance = {
    idx: eIdx,
    meshes: roomScreenMeshes,
    mats: roomScreenMats,
    canvas,
    ctx,
    tex,
    frameCount: 0,
    type: 'violet',
    glitchType: 0,
    glitchTimer: 0,
    stareTimer: 0,
    saccadeTarget: null,
    targetWorldPos: targetPos,
  };
  eyeInstances.push(instance);
  violetEyeState.instance = instance;
  violetEyeState.eyeScreenIdx = eIdx;
}

export function clearVioletEye() {
  if (!violetEyeState.instance) return;
  const inst = violetEyeState.instance;
  const idx = inst.idx;
  inst.meshes[idx].material.map = null;
  inst.meshes[idx].material.emissiveMap = null;
  inst.meshes[idx].material.emissive.set(0x445588);
  inst.meshes[idx].material.emissiveIntensity = inst.mats[idx].emissiveIntensity;
  inst.meshes[idx].material.needsUpdate = true;
  eyeInstances.splice(eyeInstances.indexOf(inst), 1);
  violetEyeState.instance = null;
  violetEyeState.eyeScreenIdx = -1;
}

export function questionMonitorSpawn(scene, meshes, data) {
  if (questionMonitorState.active) return null;

  const used = new Set(eyeInstances.map(e => e.idx));
  const candidates = [];
  for (let i = 0; i < roomScreenMeshes.length; i++) {
    if (used.has(i)) continue;
    if (roomScreenMeshes[i].userData.blueCodeScreen) continue;
    if (roomScreenMeshes[i].userData.violetCodeScreen) continue;
    if (roomScreenMeshes[i].userData.questionMonitor) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return null;

  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  const screen = roomScreenMeshes[idx];

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  function drawGlitch() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 100; i++) {
      const r = 30 + Math.random() * 200;
      const g = 10 + Math.random() * 180;
      const b = 40 + Math.random() * 200;
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${0.2 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 8 + 2, Math.random() * 3 + 1);
    }

    for (let i = 0; i < 8; i++) {
      const r = 50 + Math.random() * 200;
      const g = 20 + Math.random() * 80;
      const b = 80 + Math.random() * 170;
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.2)`;
      const y = Math.random() * 256;
      const bh = 2 + Math.random() * 8;
      const offset = (Math.random() - 0.5) * 40;
      ctx.fillRect(Math.max(0, offset), y, 256, bh);
    }

    ctx.globalCompositeOperation = 'lighter';
    const glitchOffset = (Math.random() - 0.5) * 24;
    ctx.font = 'bold 160px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 128 + glitchOffset, 128);
    ctx.fillStyle = `rgba(${100+Math.random()*155|0},${50+Math.random()*100|0},${150+Math.random()*105|0},0.5)`;
    ctx.fillText('?', 128 - glitchOffset * 0.5, 130 + (Math.random() - 0.5) * 4);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.06})`;
    ctx.fillRect(0, 0, 256, 3 + Math.random() * 10);

    for (let i = 0; i < 256; i += 4) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
      ctx.fillRect(0, i, 256, 1);
    }
  }

  drawGlitch();
  const tex = new THREE.CanvasTexture(canvas);
  screen.material.map = tex;
  screen.material.emissiveMap = tex;
  screen.material.emissive.set(0xffffff);
  screen.material.emissiveIntensity = 1.5;
  screen.material.needsUpdate = true;
  screen.userData.questionMonitor = true;

  const pos = screen.position;
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(pos.x, pos.y, pos.z - 0.15);
  scene.add(proxy);
  meshes.push(proxy);

  const proxyData = {
    id: 'questionMonitor',
    label: 'monitor misterioso',
    message: 'Presiona E para interactuar',
    action() {
      const roll = Math.random();
      const now = performance.now() / 1000;

      if (roll < 0.33) {
        gameState.dizzyEndTime = now + 15;
        showMessage('Efecto dizzy activado por 15 segundos');
      } else if (roll < 0.66) {
        gameState.timer.remaining = Math.min(gameState.timer.duration, gameState.timer.remaining + 30);
        updateTimerDisplay(gameState.timer.formatted);
        showTimeNotification(30);
      } else {
        gameState.timer.remaining = Math.max(0, gameState.timer.remaining - 30);
        updateTimerDisplay(gameState.timer.formatted);
        showTimeNotification(-30);
      }

      questionMonitorClear();
    },
  };
  data.set(proxy, proxyData);

  questionMonitorState.active = true;
  questionMonitorState.screenIdx = idx;
  questionMonitorState.proxy = proxy;
  questionMonitorState.proxyData = proxyData;
  questionMonitorState.meshesRef = meshes;
  questionMonitorState.dataRef = data;
  questionMonitorState.canvas = canvas;
  questionMonitorState.ctx = ctx;
  questionMonitorState.tex = tex;

  return proxy;
}

export function questionMonitorClear() {
  if (!questionMonitorState.active) return;

  const idx = questionMonitorState.screenIdx;
  const screen = roomScreenMeshes[idx];
  screen.material.map = null;
  screen.material.emissiveMap = null;
  screen.material.emissive.set(0x445588);
  screen.material.emissiveIntensity = roomScreenMats[idx].emissiveIntensity;
  screen.material.needsUpdate = true;
  screen.userData.questionMonitor = false;

  if (questionMonitorState.proxy) {
    const proxy = questionMonitorState.proxy;
    if (proxy.parent) proxy.parent.remove(proxy);
    if (questionMonitorState.dataRef) questionMonitorState.dataRef.delete(proxy);
    if (questionMonitorState.meshesRef) {
      const mi = questionMonitorState.meshesRef.indexOf(proxy);
      if (mi !== -1) questionMonitorState.meshesRef.splice(mi, 1);
    }
  }

  questionMonitorState.active = false;
  questionMonitorState.screenIdx = -1;
  questionMonitorState.proxy = null;
  questionMonitorState.proxyData = null;
  questionMonitorState.meshesRef = null;
  questionMonitorState.dataRef = null;
  questionMonitorState.canvas = null;
  questionMonitorState.ctx = null;
  questionMonitorState.tex = null;
}

export function updateQuestionGlitch() {
  if (!questionMonitorState.active || !questionMonitorState.ctx) return;
  const ctx = questionMonitorState.ctx;
  const w = 256, h = 256;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 80; i++) {
    const r = 30 + Math.random() * 200;
    const g = 10 + Math.random() * 180;
    const b = 40 + Math.random() * 200;
    ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${0.2 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 6 + 2, Math.random() * 2 + 1);
  }

  for (let i = 0; i < 6; i++) {
    const r = 50 + Math.random() * 200;
    const g = 20 + Math.random() * 80;
    const b = 80 + Math.random() * 170;
    ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.18)`;
    const y = Math.random() * h;
    const bh = 2 + Math.random() * 6;
    const offset = (Math.random() - 0.5) * 30;
    ctx.fillRect(Math.max(0, offset), y, w, bh);
  }

  ctx.globalCompositeOperation = 'lighter';
  const glitchOffset = (Math.random() - 0.5) * 20;
  ctx.font = 'bold 160px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('?', 128 + glitchOffset, 128);
  ctx.fillStyle = `rgba(${100+Math.random()*155|0},${50+Math.random()*100|0},${150+Math.random()*105|0},0.4)`;
  ctx.fillText('?', 128 - glitchOffset * 0.5, 130 + (Math.random() - 0.5) * 4);
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < w; i += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
    ctx.fillRect(0, i, w, 1);
  }

  if (questionMonitorState.tex) questionMonitorState.tex.needsUpdate = true;
}

export function updateAllEyes(camera) {
  for (let i = eyeInstances.length - 1; i >= 0; i--) {
    const inst = eyeInstances[i];
    inst.frameCount++;
    drawEye(inst, camera);
  }
}

function drawEye(instance, camera) {
  const ctx = instance.ctx;
  const [mesh] = [instance.meshes[instance.idx]];
  const w = 256, h = 256;
  const cx = w / 2, cy = h / 2 + 4;
  const rx = w * 0.44;
  const fc = instance.frameCount;
  const isViolet = instance.type === 'violet';
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const lookTarget = instance.targetWorldPos || camera.position;
  const camPos = lookTarget.clone();

  if (!isViolet) updateEyeEmotion(instance, camera, worldPos);
  const ep = isViolet ? EMOTIONS.neutral : getEmotionParams(instance.emotion);
  const ry = h * 0.30 * ep.ryScale;

  const gazeScale = ep.gazeIntensity;
  const jitScale = ep.jitter;

  if (instance.stareTimer > 0) {
    instance.stareTimer--;
  } else if (Math.random() < 0.005) {
    instance.stareTimer = 10 + Math.floor(Math.random() * 20);
  }

  let dirX, dirY;
  if (instance.stareTimer > 0) {
    dirX = (camPos.x - worldPos.x) * (gazeScale * 2);
    dirY = (camPos.y - worldPos.y) * (gazeScale * 2);
  } else {
    dirX = (camPos.x - worldPos.x) * gazeScale;
    dirY = (camPos.y - worldPos.y) * gazeScale;
  }
  const dlen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  dirX /= dlen; dirY /= dlen;

  const gazeX = (instance.stareTimer > 0 ? 40 : 16) * dirX;
  const gazeY = (instance.stareTimer > 0 ? -30 : -12) * dirY;
  const ex = cx + gazeX + (Math.random() - 0.5) * (instance.stareTimer > 0 ? 1 : 2);
  const ey = cy + gazeY + (Math.random() - 0.5) * (instance.stareTimer > 0 ? 1 : 2);

  const microX = Math.sin(fc * 0.73) * 2.5 + Math.sin(fc * 1.51) * 2.0;
  const microY = Math.cos(fc * 0.61) * 2.0 + Math.cos(fc * 1.43) * 1.5;

  const driftX = Math.sin(fc * 0.03 + (instance.seed || 0)) * 6;
  const driftY = Math.cos(fc * 0.025 + (instance.seed || 0) * 2) * 4;

  const jitX = (Math.sin(fc * 0.11) * 2 + Math.sin(fc * 0.37) * 1) * jitScale;
  const jitY = (Math.cos(fc * 0.13) * 1.8 + Math.cos(fc * 0.41) * 0.8) * jitScale;
  const spx = ex + jitX + microX + driftX + (Math.random() - 0.5) * (instance.stareTimer > 0 ? 0 : 3);
  const spy = ey + jitY + microY + driftY + (Math.random() - 0.5) * (instance.stareTimer > 0 ? 0 : 3);

  ctx.fillStyle = isViolet ? '#0a0014' : '#000000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const scleraR = rx * 1.3;
  const scleraGrad = ctx.createRadialGradient(ex, ey, scleraR * 0.05, ex, ey, scleraR);
  if (isViolet) {
    scleraGrad.addColorStop(0, '#f0e8f8');
    scleraGrad.addColorStop(0.4, '#d8c8e8');
    scleraGrad.addColorStop(0.7, '#a088b0');
    scleraGrad.addColorStop(0.9, '#503860');
    scleraGrad.addColorStop(1, '#302040');
  } else {
    scleraGrad.addColorStop(0, '#f5f0e8');
    scleraGrad.addColorStop(0.4, '#e8e0d5');
    scleraGrad.addColorStop(0.7, '#cdc0b0');
    scleraGrad.addColorStop(0.9, '#b8a898');
    scleraGrad.addColorStop(1, '#a09080');
  }
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(ex - scleraR, ey - scleraR, scleraR * 2, scleraR * 2);

  if (!isViolet) {
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
      const redBoost = isViolet ? 0 : ep.scleraRed;
      ctx.strokeStyle = `rgba(${180 + redBoost * 100},${Math.floor(15 - redBoost * 10)},${Math.floor(15 - redBoost * 10)},${(0.25 + Math.random() * 0.2 + redBoost * 0.3) * pulse})`;
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
  if (isViolet) {
    irisGrad.addColorStop(0, '#2a0050');
    irisGrad.addColorStop(0.5, '#5522aa');
    irisGrad.addColorStop(0.85, '#3a1070');
    irisGrad.addColorStop(1, '#1a0030');
  } else {
    irisGrad.addColorStop(0.05, '#3a3020');
    irisGrad.addColorStop(0.3, '#4a3d28');
    irisGrad.addColorStop(0.6, '#3d3220');
    irisGrad.addColorStop(0.85, '#2a2215');
    irisGrad.addColorStop(1, '#1a150e');
  }
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.fill();

  if (!isViolet) {
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
      ctx.fillStyle = `rgba(20,15,10,0.25)`;
      ctx.beginPath();
      ctx.ellipse(ex + Math.cos(ca) * cd, ey + Math.sin(ca) * cd, cs, ch, ca, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (!isViolet) {
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
  } else {
    ctx.strokeStyle = isViolet ? 'rgba(200,100,255,0.4)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(ex, ey, irisR - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const pupilShrink = 0.65 + Math.sin(fc * 0.012) * 0.45 + (instance.stareTimer > 0 ? 0.25 : 0);
  const effectivePupilR = pupilR * Math.min(1.1, pupilShrink) * (isViolet ? 1 : ep.pupilScale);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  if (!isViolet) {
    ctx.moveTo(spx + effectivePupilR, spy);
    for (let a = 0; a <= 40; a++) {
      const angle = (a / 40) * Math.PI * 2;
      const ir = effectivePupilR + Math.sin(angle * 8 + fc * 0.02) * 0.5 + Math.sin(angle * 13 + fc * 0.03) * 0.3;
      ctx.lineTo(spx + Math.cos(angle) * ir, spy + Math.sin(angle) * ir);
    }
    ctx.closePath();
  } else {
    ctx.arc(spx, spy, effectivePupilR, 0, Math.PI * 2);
  }
  ctx.fill();

  if (!isViolet) {
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
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.038, 0, Math.PI * 2);
    ctx.fill();

    const hl2Grad = ctx.createRadialGradient(spx - w * 0.025, spy - w * 0.025, 0, spx - w * 0.025, spy - w * 0.025, w * 0.038);
    hl2Grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl2Grad.addColorStop(1, 'rgba(180,200,240,0.0)');
    ctx.fillStyle = hl2Grad;
    ctx.beginPath();
    ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.arc(spx + w * 0.045, spy + w * 0.06, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!isViolet) {
    const bagGrad = ctx.createRadialGradient(ex, ey + ry * 0.6, 0, ex, ey + ry * 0.6, rx * 0.7);
    bagGrad.addColorStop(0, 'rgba(50,15,30,0.3)');
    bagGrad.addColorStop(0.5, 'rgba(40,10,25,0.15)');
    bagGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bagGrad;
    ctx.beginPath();
    ctx.ellipse(ex, ey + ry * 0.5, rx * 0.6, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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

  if (!isViolet) {
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
  }

  const lowerLidGrad = ctx.createLinearGradient(0, cy + ry * 0.7, 0, cy + ry);
  lowerLidGrad.addColorStop(0, 'rgba(0,0,0,0)');
  lowerLidGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
  lowerLidGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = lowerLidGrad;
  ctx.fillRect(cx - rx - 4, cy + ry * 0.7, rx * 2 + 8, ry * 0.3);
  ctx.restore();

  if (!isViolet) {
    const browY = cy - ry - 10 + ep.browRaise * 18;
    const browH = ry * 0.15 + ep.browRaise * 5;
    const browW = rx * 0.55;
    ctx.strokeStyle = `rgba(80,70,65,${0.4 + Math.abs(ep.browRaise) * 0.4})`;
    ctx.lineWidth = 2.5 + Math.abs(ep.browRaise) * 2;
    ctx.beginPath();
    const bDir = ep.browRaise > 0 ? 1 : -1;
    ctx.moveTo(cx - browW, browY + browH * bDir);
    ctx.quadraticCurveTo(cx, browY - browH * 0.3 * bDir, cx + browW, browY + browH * bDir);
    ctx.stroke();

    ctx.strokeStyle = `rgba(60,50,45,${0.3 + Math.abs(ep.browRaise) * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - browW * 0.8, browY + browH * bDir + 2);
    ctx.quadraticCurveTo(cx, browY - browH * 0.2 * bDir + 2, cx + browW * 0.8, browY + browH * bDir + 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(100,100,100,0.30)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let l = 0; l < 7; l++) {
    const lx = cx - rx + 6 + l * (rx * 2 - 12) / 6;
    const ly = cy - ry + 2;
    ctx.strokeStyle = 'rgba(200,200,200,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - 2 + Math.random(), ly - 5 - Math.random() * 4);
    ctx.stroke();
  }

  for (let sy = 0; sy < h; sy += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, sy, w, 1);
  }

  for (let i = 0; i < 40; i++) {
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

  ctx.fillStyle = isViolet ? 'rgba(20,0,40,0.08)' : 'rgba(0,15,0,0.05)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 4, ry + 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!isViolet && instance.blinkTimer > 0) {
    instance.blinkTimer -= 1 / ep.blinkSpeed;
  } else if (isViolet) {
    instance.blinkTimer--;
  }
  if (instance.blinkTimer <= 0) {
    instance.blinkPhase = 1;
    instance.blinkTimer = (120 + Math.floor(Math.random() * 120)) / (isViolet ? 1 : ep.blinkSpeed);
  }
  if (instance.blinkPhase > 0 && instance.blinkPhase < 14) {
    const bp = instance.blinkPhase / 14;
    instance.blinkPhase++;
    const lidH = bp < 0.5 ? bp * 2 * ry * 2.2 : (1 - bp) * 2 * ry * 2.2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, lidH);
    ctx.fillRect(0, h - lidH * 0.6, w, lidH * 0.6);
  } else if (instance.blinkPhase >= 14) {
    instance.blinkPhase = 0;
  }

  if (instance.tex) instance.tex.needsUpdate = true;

  if (instance.glitchTimer > 0) {
    instance.glitchTimer--;
    const gt = instance.glitchType;
    const w2 = w, h2 = h;
    if (gt === 1) {
      const bandY = Math.random() * h2;
      const bandH = 4 + Math.random() * 20;
      const shift = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 30);
      const imgData = ctx.getImageData(0, bandY, w2, bandH);
      ctx.putImageData(imgData, shift, bandY);
    } else if (gt === 2) {
      const imgData = ctx.getImageData(0, 0, w2, h2);
      const d = imgData.data;
      const shift = 8;
      for (let y = 0; y < h2; y++) {
        for (let x = 0; x < w2; x++) {
          const i = (y * w2 + x) * 4;
          const ri = (y * w2 + Math.max(0, x - shift)) * 4;
          const bi = (y * w2 + Math.min(w2 - 1, x + shift)) * 4;
          if (x >= shift) { d[i] = d[ri]; }
          if (x + shift < w2) { d[i + 2] = d[bi + 2]; }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (gt === 3) {
      for (let i = 0; i < 60; i++) {
        const nx = Math.random() * w2, ny = Math.random() * h2;
        ctx.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},${0.2+Math.random()*0.4})`;
        ctx.fillRect(nx, ny, 2 + Math.random() * 8, 1 + Math.random() * 4);
      }
    } else if (gt === 4) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w2, h2);
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(${80+Math.random()*80},${80+Math.random()*80},${80+Math.random()*80},${Math.random()*0.5})`;
        ctx.fillRect(Math.random() * w2, Math.random() * h2, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    }
  } else if (Math.random() < 0.015) {
    instance.glitchType = 1 + Math.floor(Math.random() * 4);
    instance.glitchTimer = 6 + Math.floor(Math.random() * 20);
  }
}
