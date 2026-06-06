import * as THREE from 'three';
import {
  ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT, WALL_THICKNESS,
  COLORS, FLUORESCENT, HALLWAY_DEPTH, HALLWAY_FAR_Z,
  PASILLO_WIDTH, PASILLO_HEIGHT, SOUTH_EXPAND,
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
  const tex = createNoisyTexture(COLORS.wallBase, 8);
  tex.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.9,
    metalness: 0.05,
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
      const base = 120 + (Math.random() - 0.5) * 20;
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
        imageData.data[idx]     = 140;
        imageData.data[idx + 1] = 140;
        imageData.data[idx + 2] = 144;
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

export function initScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  scene.add(createTestRoom());
  scene.add(createRoomDesks());
  scene.add(createBackWall());
  scene.add(createHallway());
  scene.add(createCity());
  scene.add(createCeilingLights());
  scene.add(createHallwayLights());

  scene.fog = new THREE.FogExp2(0x0a0a14, 0.038);

  const ambient = new THREE.AmbientLight(0x1a2233, 0.50);
  scene.add(ambient);

  return scene;
}

function createTestRoom() {
  const group = new THREE.Group();

  const hw = ROOM_WIDTH / 2;
  const hd = ROOM_DEPTH / 2;
  const hh = ROOM_HEIGHT / 2;
  const wt2 = WALL_THICKNESS / 2;

  const wallMat = createWallMaterial();

  const wallS = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_WIDTH + WALL_THICKNESS * 2, ROOM_HEIGHT, WALL_THICKNESS),
    wallMat
  );
  wallS.position.set(0, hh, -hd - wt2 - SOUTH_EXPAND);

  const roomDepthFull = ROOM_DEPTH + SOUTH_EXPAND;
  const wallE = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, ROOM_HEIGHT, roomDepthFull),
    wallMat
  );
  wallE.position.set(hw + wt2, hh, -SOUTH_EXPAND / 2);

  const wallW = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, ROOM_HEIGHT, roomDepthFull),
    wallMat
  );
  wallW.position.set(-hw - wt2, hh, -SOUTH_EXPAND / 2);

  group.add(wallS, wallE, wallW);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, roomDepthFull),
    createFloorMaterial()
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -SOUTH_EXPAND / 2);
  group.add(floor);

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

  const pipeX = [-4.0, -1.5, 1.5, 4.0];
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
    color: 0xffffff,
    transparent: true,
    opacity: 0.01,
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const glassL = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.98),
    glassMat
  );
  glassL.position.set(-3.25, 1.5, backZ);
  glassL.rotation.y = Math.PI;
  group.add(glassL);

  const glassR = glassL.clone();
  glassR.position.set(3.25, 1.5, backZ);
  group.add(glassR);

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
      new THREE.BoxGeometry(0.45, 0.30, 0.04),
      monMat
    );
    frame.position.set(x, 1.15, 0);
    deskGroup.add(frame);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.25),
      screenMat
    );
    screen.position.set(x, 1.15, -0.03);
    screen.rotation.y = Math.PI;
    deskGroup.add(screen);
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

  return group;
}

function createRoomDesks() {
  const group = new THREE.Group();

  const deskDepth = 1.2;
  const deskThick = 0.06;
  const deskHeight = 0.9;
  const deskW = 4.8;

  const aisleHalf = 1.2;
  const leftCx = -(6 + aisleHalf) / 2;
  const rightCx = (6 + aisleHalf) / 2;

  const stepZ = deskDepth + 1.54;
  const rowZ = [-4.0, -4.0 + stepZ, -4.0 + 2 * stepZ, -4.0 + 3 * stepZ];

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const monMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 0.6,
  });
  const screenDimMat = new THREE.MeshStandardMaterial({
    color: 0x88bbff, emissive: 0x88bbff, emissiveIntensity: 0.2,
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
          new THREE.BoxGeometry(0.44, 0.30, 0.05),
          monMat
        );
        frame.position.set(mx, deskHeight + 0.15, z + 0.025);
        group.add(frame);

        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.38, 0.25),
          mi % 2 === 0 ? screenMat : screenDimMat
        );
        screen.position.set(mx, deskHeight + 0.15, z + 0.06);
        group.add(screen);

        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.38, 0.28),
          towerMat
        );
        tower.position.set(mx + 0.24, deskHeight + deskThick / 2 + 0.19, z);
        group.add(tower);

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
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * cityWidth;
    starPos[i * 3 + 1] = Math.random() * 5 + 2;
    starPos[i * 3 + 2] = farZ + 9 + Math.random() * 3;
    starSizes[i] = 0.3 + Math.random() * 0.4;
    starPhases[i] = Math.random() * Math.PI * 2;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(starPhases, 1));

  const starTex = (() => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();

  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.4,
    map: starTex,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  let twAcc = 0;
  starMat.onBeforeRender = function(r, s, c, geo) {
    twAcc += 0.02;
    const sz = geo.attributes.size.array;
    const ph = geo.attributes.phase.array;
    const base = starSizes;
    for (let i = 0; i < sz.length; i++) {
      sz[i] = base[i] * (0.3 + 0.7 * (Math.sin(twAcc + ph[i]) * 0.5 + 0.5));
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

const ceilingFlickerLights = [];

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
    [-3.0, -3.0],
    [-3.0,  3.0],
    [ 3.0, -3.0],
    [ 3.0,  3.0],
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
    light.castShadow = false;

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

export { createWallMaterial, createNoisyTexture, hallwayFlickerLights, hallwayDeadLights, hallwayScreenMats, ceilingFlickerLights };
