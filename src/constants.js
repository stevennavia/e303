export const ROOM_WIDTH = 14.4;
export const ROOM_DEPTH = 14;
export const SOUTH_EXPAND = 1.4;
export const ROOM_HEIGHT = 4.0;
export const WALL_THICKNESS = 0.2;

export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_SPEED = 5;
export const MOUSE_SENSITIVITY = 0.5;

export const INTERACTION_RANGE = 3;

export const TIMER_START_SECONDS = 480;

export const FLUORESCENT = {
  color: 0x8899cc,
  intensityEach: 0.55,
  distance: 14,
  decay: 1.4,
  glowEmission: 0x99aadd,
  glowIntensity: 0.3,
};

export const LIGHTING_PRESETS = {
  default: {
    ambientColor: 0x334466,
    ambientIntensity: 2.0,
    fluorescentColor: 0x8899cc,
    fluorescentIntensity: 5.0,
    glowEmission: 0x99aadd,
    glowIntensity: 2.0,
    fogDensity: 0.025,
  },
  blackout: {
    ambientColor: 0x1a1122,
    ambientIntensity: 0.70,
    fluorescentColor: 0x6633aa,
    fluorescentIntensity: 0.80,
    glowEmission: 0x7744bb,
    glowIntensity: 0.4,
    fogDensity: 0.055,
  },
};

export const COLORS = {
  background: 0x0a0a14,
  ambient: 0x334466,
  ambientIntensity: 0.5,
  wallBase: '#4e4e52',
  floorBase: '#3a3a3e',
  hallwayWall: 0x3a3a42,
  hallwayFloor: 0x2a2a30,
};

export const HALLWAY_DEPTH = 8;
export const HALLWAY_FAR_Z = ROOM_DEPTH / 2 + HALLWAY_DEPTH;

export const PASILLO_WIDTH = 39;
export const PASILLO_HEIGHT = 3.5;

export const WALL_BOUNDS = {
  minX: -ROOM_WIDTH / 2,
  maxX: ROOM_WIDTH / 2,
  minZ: -ROOM_DEPTH / 2 - SOUTH_EXPAND,
  maxZ: ROOM_DEPTH / 2,
};

export const WALKABLE = {
  minX: WALL_BOUNDS.minX + PLAYER_RADIUS,
  maxX: WALL_BOUNDS.maxX - PLAYER_RADIUS,
  minZ: WALL_BOUNDS.minZ + PLAYER_RADIUS,
  maxZ: WALL_BOUNDS.maxZ - PLAYER_RADIUS,
};
