// Grenades: one ballistic projectile with bouncing, three payloads. HE deals radius
// damage only with line of sight to the blast; smoke lays a cloud that blocks bot
// vision (see canSee); flash blinds whoever faces the pop. All three are bought in
// the buy menu and thrown with G.
import * as THREE from 'three';
import { overlapsBox, rayWalls } from './map.js';
import { NADES, damageCombatant } from './weapons.js';
import { pushEvent } from './state.js';

const GRAVITY = 12.5;
const THROW_SPEED = 14;
const BOUNCE = 0.45;
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

export function throwGrenade(state, owner, type) {
  if (owner.nades[type] <= 0 || !owner.alive) return false;
  const def = NADES[type];
  owner.nades[type] -= 1;
  const cp = Math.cos(owner.pitch);
  const dir = new THREE.Vector3(
    -Math.sin(owner.yaw) * cp,
    Math.sin(owner.pitch) + 0.25,
    -Math.cos(owner.yaw) * cp,
  ).normalize();
  state.grenades.push({
    type, owner,
    pos: new THREE.Vector3(owner.pos.x, owner.pos.y + 1.5, owner.pos.z),
    vel: dir.multiplyScalar(THROW_SPEED),
    fuse: def.fuse, rest: false,
  });
  pushEvent(state, { kind: 'throw', who: owner.id, nade: type });
  return true;
}

function stepProjectile(g, dt, colliders) {
  g.vel.y -= GRAVITY * dt;
  const p = g.pos;
  const nx = p.x + g.vel.x * dt;
  if (!overlapsBox(colliders, nx, p.z, 0.12, p.y - 0.12, p.y + 0.12)) {
    p.x = nx;
  } else {
    g.vel.x *= -BOUNCE;
  }
  const nz = p.z + g.vel.z * dt;
  if (!overlapsBox(colliders, p.x, nz, 0.12, p.y - 0.12, p.y + 0.12)) {
    p.z = nz;
  } else {
    g.vel.z *= -BOUNCE;
  }
  p.y += g.vel.y * dt;
  let support = 0;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 && c.y1 <= p.y + 0.15 && c.y1 > support) {
      support = c.y1;
    }
  }
  if (p.y <= support + 0.12) {
    p.y = support + 0.12;
    if (Math.abs(g.vel.y) > 1.6) {
      g.vel.y *= -BOUNCE;
    } else {
      g.vel.y = 0;
      g.vel.x *= 0.82;
      g.vel.z *= 0.82;
      if (Math.hypot(g.vel.x, g.vel.z) < 0.4) g.rest = true;
    }
  }
}

function detonateHE(state, colliders, g) {
  const def = NADES.he;
  pushEvent(state, { kind: 'explosion', x: g.pos.x, y: g.pos.y, z: g.pos.z });
  state.noises.push({ x: g.pos.x, z: g.pos.z, radius: 42, t: state.time, id: -1, team: null });
  const bodies = [state.player, ...state.bots];
  for (const body of bodies) {
    if (!body.alive) continue;
    _to.set(body.pos.x, body.pos.y + 1.2, body.pos.z);
    const dist = _to.distanceTo(g.pos);
    if (dist > def.radius) continue;
    _to.sub(g.pos).normalize();
    if (rayWalls(colliders, g.pos, _to, dist - 0.2) < dist - 0.2) continue;
    const dmg = def.damage * (1 - (dist / def.radius) * 0.75);
    damageCombatant(state, body, dmg, g.owner, 'torso');
  }
}

function detonateFlash(state, colliders, g) {
  const def = NADES.flash;
  pushEvent(state, { kind: 'flashpop', x: g.pos.x, y: g.pos.y, z: g.pos.z });
  const bodies = [state.player, ...state.bots];
  for (const body of bodies) {
    if (!body.alive) continue;
    _eye.set(body.pos.x, body.pos.y + 1.5, body.pos.z);
    _to.copy(g.pos).sub(_eye);
    const dist = _to.length();
    if (dist > def.radius) continue;
    _to.divideScalar(dist || 1);
    if (rayWalls(colliders, _eye, _to, dist - 0.2) < dist - 0.2) continue;
    const facing = -Math.sin(body.yaw) * _to.x - Math.cos(body.yaw) * _to.z;
    const strength = (1 - dist / def.radius) * (facing > -0.3 ? 1 : 0.35);
    body.flash = Math.min(1.4, Math.max(body.flash, strength * 1.4));
  }
}

export function stepGrenades(state, dt, colliders) {
  for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
    const g = state.grenades[i];
    g.fuse -= dt;
    if (!g.rest) stepProjectile(g, dt, colliders);
    if (g.fuse > 0) continue;
    state.grenades.splice(i, 1);
    if (g.type === 'he') detonateHE(state, colliders, g);
    else if (g.type === 'flash') detonateFlash(state, colliders, g);
    else {
      state.smokes.push({
        x: g.pos.x, y: g.pos.y + 0.6, z: g.pos.z,
        radius: NADES.smoke.radius, t0: state.time, life: NADES.smoke.life,
      });
      pushEvent(state, { kind: 'smokepop', x: g.pos.x, y: g.pos.y, z: g.pos.z });
    }
  }
  for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
    if (state.time - state.smokes[i].t0 > state.smokes[i].life) state.smokes.splice(i, 1);
  }
}
