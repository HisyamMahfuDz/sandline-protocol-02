// Player movement and aim. Acceleration and friction make starts and stops weighty;
// crouching slows the body and lowers the eye; jumping is one impulse under gravity.
// Collision is the shared moveBody from map.js, so the player and the bots obey the
// same walls.
import * as THREE from 'three';
import { moveBody } from './map.js';
import { WEAPONS, eyeHeight } from './weapons.js';

const WALK_SPEED = 5.6;
const CROUCH_SPEED = 2.9;
const WALK_SLOW = 2.8; // Shift: quiet steps, smaller noise radius
const ACCEL = 42;
const FRICTION = 11;
const AIR_CONTROL = 0.35;
const GRAVITY = 12.5;
const JUMP_VEL = 6.0;
const RADIUS = 0.42;
const HEIGHT = 1.78;
const LOOK_SENS = 0.0022;
const RECOIL_RECOVER = 3.2;

const _wish = new THREE.Vector3();
const _eye = new THREE.Vector3();

export function eyePos(combatant, out) {
  out = out ?? _eye;
  out.set(combatant.pos.x, combatant.pos.y + eyeHeight(combatant.crouched), combatant.pos.z);
  return out;
}

export function forwardOf(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

export function applyLook(state, dx, dy) {
  const p = state.player;
  p.yaw -= dx * LOOK_SENS;
  p.pitch -= dy * LOOK_SENS;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
}

// stepPlayer: one fixed step of the local player. input is the shared input state
// (keys held, jump pressed this tick, crouch held, walk held).
export function stepPlayer(state, dt, input, colliders) {
  const p = state.player;
  if (!p.alive) return;
  p.recoilP = approach(p.recoilP, 0, RECOIL_RECOVER * dt);
  p.recoilY = approach(p.recoilY, 0, RECOIL_RECOVER * dt);
  p.bloom = Math.max(0, p.bloom - dt * 0.09);
  p.flash = Math.max(0, p.flash - dt * 0.55);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) finishReload(state, p);
  }

  const crouchHeld = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  p.crouched = crouchHeld;
  const speedCap = crouchHeld ? CROUCH_SPEED : input.keys.has('ShiftLeft') ? WALK_SLOW : WALK_SPEED;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  _wish.set(0, 0, 0);
  if (input.keys.has('KeyW')) { _wish.x += -sin; _wish.z += -cos; }
  if (input.keys.has('KeyS')) { _wish.x += sin; _wish.z += cos; }
  if (input.keys.has('KeyA')) { _wish.x += -cos; _wish.z += sin; }
  if (input.keys.has('KeyD')) { _wish.x += cos; _wish.z += -sin; }
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(speedCap);

  const control = p.onGround ? 1 : AIR_CONTROL;
  p.vel.x = approach(p.vel.x, _wish.x, ACCEL * control * dt);
  p.vel.z = approach(p.vel.z, _wish.z, ACCEL * control * dt);
  if (p.onGround && _wish.lengthSq() === 0) {
    p.vel.x = approach(p.vel.x, 0, FRICTION * dt);
    p.vel.z = approach(p.vel.z, 0, FRICTION * dt);
  }
  p.vel.y -= GRAVITY * dt;
  if (input.jumpQueued && p.onGround) {
    p.vel.y = JUMP_VEL;
    p.onGround = false;
  }
  p.onGround = moveBody(p.pos, p.vel, dt, colliders, RADIUS, HEIGHT);
  p.moving = Math.hypot(p.vel.x, p.vel.z);
  if (p.moving > 0.5 && p.onGround) p.walkPhase += dt * p.moving * 1.6;
}

function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

export function finishReload(state, c) {
  const def = WEAPONS[c.weapon];
  const need = def.mag - c.mag;
  const take = Math.min(need, c.reserve);
  c.mag += take;
  c.reserve -= take;
  c.reloading = 0;
  c.reloadTotal = 0;
}

export function startReload(state, c) {
  const def = WEAPONS[c.weapon];
  if (c.reloading > 0 || c.mag >= def.mag || c.reserve <= 0) return false;
  c.reloading = def.reload;
  c.reloadTotal = def.reload;
  return true;
}
