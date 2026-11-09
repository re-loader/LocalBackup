// Shared runtime handles, filled in by main.js at boot. Modules read them
// lazily (inside functions), never at import time.
export const ctx = {
  renderer: null,
  scene: null,
  camera: null,
  rig: null,
  interaction: null,
  hints: null,
  audio: null,
  hud: null,
  hands: null,
  world: null,
  game: null,
  flow: null,
  vr: false,
};
