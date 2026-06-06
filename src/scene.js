import * as THREE from 'three';
import {
  ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT, WALL_THICKNESS,
  COLORS, FLUORESCENT, HALLWAY_DEPTH, HALLWAY_FAR_Z,
  PASILLO_WIDTH, PASILLO_HEIGHT, SOUTH_EXPAND,
  LIGHTING_PRESETS,
} from './constants.js';

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

  scene.add(createTestRoom());
  scene.add(createRoomDesks());
  scene.add(createProfDesk());
  scene.add(createProjector());
  scene.add(createBackWall());
  scene.add(createHallway());
  scene.add(createCity());
  scene.add(createForestView());
  scene.add(createCeilingLights());
  scene.add(createHallwayLights());
  scene.add(createDustParticles());

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

  rowZ.forEach((z, ri) => {
    [{ cx: leftCx }, { cx: rightCx }].forEach(side => {
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

      const northZ = z + deskDepth / 2;
      const southZ = z - deskDepth / 2;

      for (let mi = 0; mi < 4; mi++) {
        const mx = monStart + mi * monSpacing;

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

        const chairZ = northZ - 0.2;
        const seatY = 0.46;

        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.04, 0.35),
          chairMat
        );
        seat.position.set(mx, seatY, chairZ);
        group.add(seat);

        const back = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.35, 0.04),
          chairBackMat
        );
        back.position.set(mx, seatY + 0.18, chairZ + 0.16);
        group.add(back);

        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6);
        [
          [0.13, 0.13], [0.13, -0.13], [-0.13, 0.13], [-0.13, -0.13],
        ].forEach(([lx, lz]) => {
          const legC = new THREE.Mesh(legGeo, chairMat);
          legC.position.set(mx + lx, 0.23, chairZ + lz);
          group.add(legC);
        });
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

  const bgMat = new THREE.MeshBasicMaterial({
    color: 0x020210,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), bgMat);
  bg.position.set(0, ROOM_HEIGHT / 2 + 1, farZ - 7);
  group.add(bg);

  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x050a05,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 4), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -1.5, farZ - 2.5);
  group.add(ground);

  const treeMat = new THREE.MeshBasicMaterial({ color: 0x030504 });

  const trees = [];
  for (let i = 0; i < 55; i++) {
    const tx = (Math.random() - 0.5) * 22;
    const tz = farZ - 0.5 - Math.random() * 4;
    const th = 2.5 + Math.random() * 5;
    const r = Math.random();
    let type;
    if (r < 0.45) type = 'pine';
    else if (r < 0.80) type = 'round';
    else type = 'bare';
    trees.push({ x: tx, z: tz, h: th, type });
  }
  trees.sort((a, b) => a.z - b.z);

  trees.forEach(t => {
    if (t.type === 'pine') {
      const bw = 0.08 + Math.random() * 0.06;
      const tw = 0.5 + Math.random() * 0.8;
      const trunkH = t.h * 0.35;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.4, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const layers = 2 + Math.floor(Math.random() * 3);
      for (let l = 0; l < layers; l++) {
        const lh = t.h * 0.55 / layers;
        const lw = tw - l * tw * 0.28;
        const ly = -1.5 + trunkH + l * lh + lh / 2;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(0.15, lw), lh, 7),
          treeMat
        );
        cone.position.set(t.x, ly, t.z);
        group.add(cone);
      }
    } else if (t.type === 'round') {
      const bw = 0.06 + Math.random() * 0.08;
      const trunkH = t.h * 0.45;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.3, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const canopyR = 0.5 + Math.random() * 0.9;
      const canopyY = -1.5 + trunkH + canopyR * 0.7;
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(canopyR, 8, 6),
        treeMat
      );
      canopy.scale.set(1, 0.8, 1);
      canopy.position.set(t.x, canopyY, t.z);
      group.add(canopy);

      if (Math.random() > 0.5) {
        const subR = canopyR * 0.6;
        const sub = new THREE.Mesh(
          new THREE.SphereGeometry(subR, 7, 5),
          treeMat
        );
        sub.position.set(t.x + canopyR * 0.4, canopyY + canopyR * 0.3, t.z);
        group.add(sub);
      }
    } else {
      const bw = 0.04 + Math.random() * 0.05;
      const trunkH = t.h * 0.7;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(bw, bw * 1.1, trunkH, 6),
        treeMat
      );
      trunk.position.set(t.x, -1.5 + trunkH / 2, t.z);
      group.add(trunk);

      const branches = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < branches; b++) {
        const angle = (Math.random() - 0.5) * 1.0;
        const bLen = 0.3 + Math.random() * 0.6;
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.03, bLen, 5),
          treeMat
        );
        branch.position.set(
          t.x + Math.sin(angle) * bLen * 0.3,
          -1.5 + trunkH * 0.5 + b * trunkH * 0.25,
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
    new THREE.BoxGeometry(1.4, 0.05, 1.0),
    deskMat
  );
  top.position.set(6.0, 0.85, -6.0);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  [
    [0.65, 0.45], [0.65, -0.45], [-0.65, 0.45], [-0.65, -0.45],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.82, 0.05),
      deskMat
    );
    leg.position.set(6.0 + lx, 0.41, -6.0 + lz);
    group.add(leg);
  });

  const chairGroup = new THREE.Group();
  chairGroup.position.set(6.0, 0, -5.6);

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
  const monProfScreenMat = new THREE.MeshStandardMaterial({
    color: 0x335588, emissive: 0x335588, emissiveIntensity: 0.3,
  });
  [-0.3, 0.3].forEach(ox => {
    const mframe = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.38, 0.06),
      monProfMat
    );
    mframe.position.set(6.0 + ox, 1.08, -6.5);
    group.add(mframe);

    const mscreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.32),
      monProfScreenMat.clone()
    );
    mscreen.position.set(6.0 + ox, 1.08, -6.46);
    group.add(mscreen);
  });

  const towerProfMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.15 });
  const profTower = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.45, 0.32),
    towerProfMat
  );
  profTower.position.set(5.55, 1.05, -6.0);
  group.add(profTower);

  const ledProf = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x33ff33,
      emissive: 0x33ff33,
      emissiveIntensity: 1.5,
    })
  );
  ledProf.position.set(5.63, 1.22, -6.0);
  group.add(ledProf);

  return group;
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

  return group;
}

function createDustParticles() {
  const count = 75;
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
    size: 0.015,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const ceilingFlickerLights = [];
let sceneAmbient = null;
let mainScene = null;
let currentPreset = 'default';

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

export { createWallMaterial, createNoisyTexture, hallwayFlickerLights, hallwayDeadLights, hallwayScreenMats, ceilingFlickerLights, roomScreenMats, roomScreenMeshes, hallwayScreenMeshes, eyeInstances };

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
    if (!blocked.has(i)) candidates.push(i);
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
  meshes[idx].material.emissiveIntensity = 0.8;
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
  };
  eyeInstances.push(instance);
  return instance;
}

export function clearEye(instance) {
  const idx = instance.idx;
  instance.meshes[idx].material.map = null;
  instance.meshes[idx].material.emissiveIntensity = instance.mats[idx].emissiveIntensity;
  instance.meshes[idx].material.needsUpdate = true;
  eyeInstances.splice(eyeInstances.indexOf(instance), 1);
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
  const rx = w * 0.44, ry = h * 0.30;
  const fc = instance.frameCount;

  ctx.clearRect(0, 0, w, h);

  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const camPos = camera.position.clone();
  let dirX = (camPos.x - worldPos.x) * 0.02;
  let dirY = (camPos.y - worldPos.y) * 0.02;
  const dlen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  dirX /= dlen; dirY /= dlen;

  const gazeX = dirX * 16;
  const gazeY = -dirY * 12;
  const ex = cx + gazeX;
  const ey = cy + gazeY;
  const jitX = Math.sin(fc * 0.11) * 2 + Math.sin(fc * 0.37) * 1;
  const jitY = Math.cos(fc * 0.13) * 1.8 + Math.cos(fc * 0.41) * 0.8;
  const spx = ex + jitX;
  const spy = ey + jitY;

  ctx.fillStyle = '#1a0000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const scleraR = rx * 1.3;
  const scleraGrad = ctx.createRadialGradient(ex, ey, scleraR * 0.05, ex, ey, scleraR);
  scleraGrad.addColorStop(0, '#f8f0e0');
  scleraGrad.addColorStop(0.3, '#f0e8d4');
  scleraGrad.addColorStop(0.6, '#ece0c8');
  scleraGrad.addColorStop(0.8, '#d8c8a8');
  scleraGrad.addColorStop(0.95, '#c0a880');
  scleraGrad.addColorStop(1, '#a08060');
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(ex - scleraR, ey - scleraR, scleraR * 2, scleraR * 2);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const veinColors = [
    'rgba(180,60,50,0.20)', 'rgba(160,55,45,0.24)',
    'rgba(190,70,60,0.16)', 'rgba(170,50,40,0.22)',
    'rgba(155,45,35,0.18)',
  ];
  for (let v = 0; v < 14; v++) {
    const vx = ex + Math.cos(v * 1.8 + 0.3) * rx * 0.85;
    const vy = ey + Math.sin(v * 1.8 + 0.3) * ry * 0.7;
    const vc = veinColors[v % veinColors.length];
    ctx.strokeStyle = vc;
    ctx.lineWidth = 0.3 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(v * 0.3) * rx * 0.25, ey + Math.sin(v * 0.3) * ry * 0.2);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    if (Math.random() > 0.5) {
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      const bx = vx + (Math.random() - 0.5) * rx * 0.25;
      const by = vy + (Math.random() - 0.5) * ry * 0.2;
      ctx.moveTo(vx, vy);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
  ctx.restore();

  const irisR = w * 0.21;
  const pupilR = w * 0.095;

  const irisGrad = ctx.createRadialGradient(ex, ey, irisR * 0.05, ex, ey, irisR);
  irisGrad.addColorStop(0, '#0a0402');
  irisGrad.addColorStop(0.08, '#150a04');
  irisGrad.addColorStop(0.2, '#3a1a08');
  irisGrad.addColorStop(0.4, '#6a3518');
  irisGrad.addColorStop(0.6, '#8a5020');
  irisGrad.addColorStop(0.75, '#5a3015');
  irisGrad.addColorStop(0.9, '#2a1208');
  irisGrad.addColorStop(1, '#080402');
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.clip();
  for (let f = 0; f < 35; f++) {
    const ang = f * (Math.PI * 2 / 35);
    const rx1 = irisR * 0.15;
    const rx2 = irisR * 0.92 + Math.sin(fc * 0.02 + f * 0.7) * 2;
    const x1 = ex + Math.cos(ang) * rx1;
    const y1 = ey + Math.sin(ang) * rx1;
    const x2 = ex + Math.cos(ang) * rx2;
    const y2 = ey + Math.sin(ang) * rx2;
    const brightness = 40 + Math.sin(f * 2.7) * 15;
    ctx.strokeStyle = `rgba(${brightness},${Math.floor(brightness*0.5)},${Math.floor(brightness*0.3)},0.35)`;
    ctx.lineWidth = 0.4 + Math.abs(Math.sin(f * 1.3)) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  for (let c = 0; c < 8; c++) {
    const ca = Math.random() * Math.PI * 2;
    const cr = irisR * 0.35 + Math.random() * irisR * 0.5;
    const cpx = ex + Math.cos(ca) * cr;
    const cpy = ey + Math.sin(ca) * cr;
    ctx.fillStyle = 'rgba(10,5,2,0.25)';
    ctx.beginPath();
    ctx.arc(cpx, cpy, irisR * 0.04 + Math.random() * irisR * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(10,5,3,0.5)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR - 3, 0, Math.PI * 2);
  ctx.stroke();

  const outerIrisGrad = ctx.createRadialGradient(ex, ey, irisR * 0.7, ex, ey, irisR);
  outerIrisGrad.addColorStop(0, 'rgba(0,0,0,0)');
  outerIrisGrad.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  outerIrisGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = outerIrisGrad;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.fill();

  const pupilShrink = 1 + Math.sin(fc * 0.008) * 0.08;
  const effectivePupilR = pupilR * pupilShrink;
  const pupilGrad = ctx.createRadialGradient(ex, ey, effectivePupilR * 0.5, ex, ey, effectivePupilR);
  pupilGrad.addColorStop(0, '#000000');
  pupilGrad.addColorStop(0.8, '#0a0505');
  pupilGrad.addColorStop(1, '#150a08');
  ctx.fillStyle = pupilGrad;
  ctx.beginPath();
  ctx.arc(spx, spy, effectivePupilR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(15,8,5,0.6)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(spx, spy, effectivePupilR, 0, Math.PI * 2);
  ctx.stroke();

  const irisReflectGrad = ctx.createRadialGradient(ex - 2, ey + 1, effectivePupilR * 1.1, ex, ey, effectivePupilR * 1.6);
  irisReflectGrad.addColorStop(0, 'rgba(180,120,80,0.08)');
  irisReflectGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = irisReflectGrad;
  ctx.beginPath();
  ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.022, 0, Math.PI * 2);
  ctx.fill();

  const hl2Grad = ctx.createRadialGradient(spx - w * 0.025, spy - w * 0.025, 0, spx - w * 0.025, spy - w * 0.025, w * 0.022);
  hl2Grad.addColorStop(0, 'rgba(255,255,255,0.6)');
  hl2Grad.addColorStop(1, 'rgba(180,200,240,0.0)');
  ctx.fillStyle = hl2Grad;
  ctx.beginPath();
  ctx.arc(spx - w * 0.025, spy - w * 0.025, w * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(spx + w * 0.045, spy + w * 0.06, w * 0.007, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const lidGrad = ctx.createLinearGradient(0, cy - ry, 0, cy - ry * 0.7);
  lidGrad.addColorStop(0, 'rgba(20,2,2,0.55)');
  lidGrad.addColorStop(0.5, 'rgba(15,3,3,0.25)');
  lidGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lidGrad;
  ctx.fillRect(cx - rx - 4, cy - ry, rx * 2 + 8, ry * 0.7);

  const lowerLidGrad = ctx.createLinearGradient(0, cy + ry * 0.7, 0, cy + ry);
  lowerLidGrad.addColorStop(0, 'rgba(0,0,0,0)');
  lowerLidGrad.addColorStop(0.5, 'rgba(15,3,3,0.15)');
  lowerLidGrad.addColorStop(1, 'rgba(20,2,2,0.35)');
  ctx.fillStyle = lowerLidGrad;
  ctx.fillRect(cx - rx - 4, cy + ry * 0.7, rx * 2 + 8, ry * 0.3);
  ctx.restore();

  ctx.strokeStyle = 'rgba(30,15,10,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(60,30,20,0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let l = 0; l < 7; l++) {
    const lx = cx - rx + 6 + l * (rx * 2 - 12) / 6;
    const ly = cy - ry + 2;
    ctx.strokeStyle = 'rgba(20,10,8,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - 2 + Math.random(), ly - 5 - Math.random() * 4);
    ctx.stroke();
  }

  const blinkPhase = fc % 210;
  if (blinkPhase < 14) {
    const bp = blinkPhase / 14;
    const lidH = bp < 0.5 ? bp * 2 * ry * 2.2 : (1 - bp) * 2 * ry * 2.2;
    ctx.fillStyle = '#1a0000';
    ctx.fillRect(0, 0, w, lidH);
    ctx.fillRect(0, h - lidH * 0.6, w, lidH * 0.6);
  }

  if (instance.tex) instance.tex.needsUpdate = true;
}
