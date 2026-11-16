// Weapon definitions, hit resolution and the damage model. Hits are checked against
// body-part boxes (head / torso / limbs) with a ray, and walls occlude via ray-vs-AABB,
// so cover genuinely stops bullets. Damage falls off with distance; armour halves it.
import * as THREE from 'three';
import { rayWalls, rayBox } from './map.js';
import { pushEvent, pushFeed } from './state.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', slot: 'secondary', price: 0,
    damage: 26, headMult: 4, limbMult: 0.75, mag: 12, reserve: 48,
    interval: 0.16, reload: 1.4, spread: 0.011, moveSpread: 0.03,
    bloom: 0.006, bloomMax: 0.05, recoil: 0.007, auto: false, range: 60, noise: 22,
  },
  smg: {
    id: 'smg', name: 'Kestrel SMG', slot: 'primary', price: 1500,
    damage: 24, headMult: 4, limbMult: 0.75, mag: 30, reserve: 120,
    interval: 0.075, reload: 2.0, spread: 0.016, moveSpread: 0.042,
    bloom: 0.005, bloomMax: 0.06, recoil: 0.006, auto: true, range: 45, noise: 26,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', slot: 'primary', price: 2700,
    damage: 33, headMult: 4, limbMult: 0.75, mag: 30, reserve: 90,
    interval: 0.1, reload: 2.3, spread: 0.008, moveSpread: 0.05,
    bloom: 0.007, bloomMax: 0.07, recoil: 0.011, auto: true, range: 70, noise: 30,
  },
  marksman: {
    id: 'marksman', name: 'Longshot DMR', slot: 'primary', price: 4500,
    damage: 82, headMult: 4, limbMult: 0.75, mag: 10, reserve: 30,
    interval: 0.55, reload: 3.0, spread: 0.001, moveSpread: 0.09,
    bloom: 0.02, bloomMax: 0.09, recoil: 0.03, auto: false, range: 90, noise: 34,
  },
};

export const NADES = {
  he: { id: 'he', name: 'HE Charge', price: 300, fuse: 1.6, radius: 7, damage: 110 },
  smoke: { id: 'smoke', name: 'Veil Smoke', price: 300, fuse: 1.2, radius: 4.5, life: 16 },
  flash: { id: 'flash', name: 'Starburst Flash', price: 200, fuse: 1.4, radius: 22 },
};

export const ARMOR_PRICE = 650;

// Body-part boxes, relative to a combatant's feet position. Crouching compresses them.
const PARTS = [
  { part: 'head', w: 0.36, y0: 1.46, y1: 1.8 },
  { part: 'torso', w: 0.56, y0: 0.82, y1: 1.46 },
  { part: 'limbs', w: 0.5, y0: 0.0, y1: 0.82 },
];

const _hit = { kind: 'none', body: null, part: null, dist: Infinity, point: new THREE.Vector3() };

// resolveHit: the single bullet path for players and bots alike. Walls occlude first;
// among bodies, the nearest part box wins. The returned object is reused — read it
// before the next call.
export function resolveHit(state, colliders, origin, dir, shooter, maxDist) {
  const wallDist = rayWalls(colliders, origin, dir, maxDist);
  let bestDist = wallDist;
  let bestBody = null;
  let bestPart = null;
  const bodies = [state.player, ...state.bots];
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    if (!body.alive || body === shooter || body.team === shooter.team) continue;
    const squash = body.crouched ? 0.72 : 1;
    for (let p = 0; p < PARTS.length; p += 1) {
      const spec = PARTS[p];
      const half = spec.w / 2;
      const d = rayBox(
        origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
        body.pos.x - half, body.pos.y + spec.y0 * squash, body.pos.z - half,
        body.pos.x + half, body.pos.y + spec.y1 * squash, body.pos.z + half,
        bestDist,
      );
      if (d < bestDist) {
        bestDist = d;
        bestBody = body;
        bestPart = spec.part;
      }
    }
  }
  _hit.dist = bestDist;
  _hit.point.copy(origin).addScaledVector(dir, bestDist);
  if (bestBody) {
    _hit.kind = 'body';
    _hit.body = bestBody;
    _hit.part = bestPart;
  } else if (wallDist < maxDist) {
    _hit.kind = 'wall';
    _hit.body = null;
    _hit.part = null;
  } else {
    _hit.kind = 'none';
    _hit.body = null;
    _hit.part = null;
  }
  return _hit;
}

export function damageFor(def, part, dist) {
  const falloff = dist > def.range * 0.6 ? Math.max(0.55, 1 - (dist - def.range * 0.6) / def.range) : 1;
  const mult = part === 'head' ? def.headMult : part === 'limbs' ? def.limbMult : 1;
  return def.damage * mult * falloff;
}

// Spread grows with movement and with sustained fire (bloom), shrinks while crouched
// and still: stopping to aim pays, firing on the move punishes.
export function spreadFor(def, speed, crouched, airborne, bloom) {
  let spread = def.spread + bloom;
  if (airborne) spread += def.moveSpread * 1.6;
  else if (speed > 0.5) spread += def.moveSpread * Math.min(1, speed / 5.5);
  if (crouched) spread *= 0.7;
  return spread;
}

export function eyeHeight(crouched) {
  return crouched ? 1.15 : 1.62;
}

// applyRecoil: kicks the view up and sideways; the per-frame recovery in the
// movement step pulls it back, so bursts climb and single shots settle.
export function applyRecoil(c, def, rng) {
  const kick = def.recoil * (0.85 + rng() * 0.3);
  c.recoilP += kick;
  c.recoilY += (rng() * 2 - 1) * kick * 0.45;
  c.bloom = Math.min(def.bloomMax, c.bloom + def.bloom);
}

let _noiseId = 0;
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

// shootBullet: the one firing path for the player and every bot. Consumes a round,
// applies spread, resolves the hit, spawns the tracer/impact/noise records the
// renderer and the bot hearing read, and applies damage. extraSpread is bot aim error.
export function shootBullet(state, colliders, shooter, aimDir, extraSpread) {
  const def = WEAPONS[shooter.weapon];
  if (shooter.reloading > 0 || state.time < shooter.nextShotAt) return false;
  if (shooter.mag <= 0) {
    pushEvent(state, { kind: 'dry', who: shooter.id });
    shooter.nextShotAt = state.time + 0.3;
    return false;
  }
  shooter.mag -= 1;
  shooter.nextShotAt = state.time + def.interval;
  const spread = spreadFor(def, shooter.moving, shooter.crouched, !shooter.onGround, shooter.bloom)
    + (extraSpread ?? 0);
  _dir.copy(aimDir);
  _dir.x += (state.rng() * 2 - 1) * spread;
  _dir.y += (state.rng() * 2 - 1) * spread;
  _dir.z += (state.rng() * 2 - 1) * spread;
  _dir.normalize();
  _origin.set(shooter.pos.x, shooter.pos.y + eyeHeight(shooter.crouched), shooter.pos.z);
  const hit = resolveHit(state, colliders, _origin, _dir, shooter, def.range + 30);
  // Tracers leave the muzzle — the gun at the shooter's right side — not the eye,
  // so the player's own tracer tracks out from the viewmodel instead of the crosshair.
  const rightX = Math.cos(shooter.yaw);
  const rightZ = -Math.sin(shooter.yaw);
  state.tracers.push({
    fromX: _origin.x + rightX * 0.22 + _dir.x * 0.4,
    fromY: _origin.y - 0.12 + _dir.y * 0.4,
    fromZ: _origin.z + rightZ * 0.22 + _dir.z * 0.4,
    toX: hit.point.x, toY: hit.point.y, toZ: hit.point.z,
    t: state.time, life: state.shotMode ? 4 : 0.07,
  });
  if (state.tracers.length > 24) state.tracers.shift();
  if (hit.kind === 'wall') {
    state.impacts.push({ x: hit.point.x, y: hit.point.y, z: hit.point.z, t: state.time, life: state.shotMode ? 4 : 0.4 });
    if (state.impacts.length > 32) state.impacts.shift();
  }
  state.noises.push({
    x: shooter.pos.x, z: shooter.pos.z, radius: def.noise, t: state.time,
    id: ++_noiseId, team: shooter.team,
  });
  if (state.noises.length > 16) state.noises.shift();
  pushEvent(state, { kind: 'shot', who: shooter.id, weapon: def.id, x: shooter.pos.x, z: shooter.pos.z });
  applyRecoil(shooter, def, state.rng);
  if (shooter.isPlayer) state.stats.shots += 1;
  if (hit.kind === 'body') {
    const dmg = damageFor(def, hit.part, hit.dist);
    if (shooter.isPlayer) {
      state.stats.hits += 1;
      if (hit.part === 'head') state.stats.headshots += 1;
    }
    damageCombatant(state, hit.body, dmg, shooter, hit.part);
  }
  return true;
}

// damageCombatant: armour halves damage and wears down; death pays the killer,
// drops the surge charge, and writes the kill feed. Used by bullets and grenades.
export function damageCombatant(state, target, amount, attacker, part) {
  if (!target.alive) return;
  let dmg = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, dmg * 0.5);
    target.armor -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  target.hurtAt = state.time;
  target.lastAttacker = attacker;
  if (attacker && attacker.isPlayer) {
    pushEvent(state, { kind: 'hitmark', kill: target.hp <= 0, head: part === 'head' });
  }
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  target.deaths += 1;
  target.deadAt = state.time;
  target.channel = null;
  if (attacker && attacker !== target) {
    attacker.kills += 1;
    attacker.money = Math.min(16000, attacker.money + 300);
  }
  if (state.bomb.holder === target.id) {
    state.bomb.holder = null;
    state.bomb.state = 'dropped';
    state.bomb.pos.copy(target.pos);
    state.bomb.pos.y = 0.15;
    pushFeed(state, 'Surge charge dropped', null);
  }
  pushFeed(state, `${attacker ? attacker.name : '—'} ▸ ${target.name}${part === 'head' ? ' (headshot)' : ''}`, attacker ? attacker.team : null);
  pushEvent(state, { kind: 'death', who: target.id, by: attacker ? attacker.id : null });
}
