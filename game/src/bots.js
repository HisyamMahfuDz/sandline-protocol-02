// Bot brains: perception (sight with field of view, line of sight and smoke, plus
// hearing), a small mode machine (advance / hold / engage / plant / defuse / retake
// / guard), waypoint routes, and burst fire with skill-based aim error and reaction
// time. Bots use the same moveBody, shootBullet and damage path as the player.
import * as THREE from 'three';
import { WAYPOINTS, SITES, nearestWaypoint, routeBetween, rayWalls, moveBody } from './map.js';
import { WEAPONS, NADES, ARMOR_PRICE, shootBullet, eyeHeight } from './weapons.js';
import { startReload } from './player.js';
import { TEAM, pushFeed } from './state.js';

const BOT_SPEED = 4.7;
const BOT_RADIUS = 0.42;
const BOT_HEIGHT = 1.78;
const SEE_DIST = 48;
const FOV_DOT = 0.25; // ~75 degrees half-angle: generous, bots still need line of sight
const GRAVITY = 12.5;

const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _route = [];

// canSee: field of view, range, wall occlusion, smoke, and flash blindness.
export function canSee(state, colliders, viewer, target) {
  if (viewer.flash > 0.45) return false;
  _eye.set(viewer.pos.x, viewer.pos.y + eyeHeight(viewer.crouched), viewer.pos.z);
  _to.set(target.pos.x, target.pos.y + 1.3, target.pos.z).sub(_eye);
  const dist = _to.length();
  if (dist > SEE_DIST) return false;
  _to.divideScalar(dist || 1);
  _fwd.set(-Math.sin(viewer.yaw), 0, -Math.cos(viewer.yaw));
  if (_fwd.dot(_to) < FOV_DOT && dist > 3) return false;
  if (rayWalls(colliders, _eye, _to, dist - 0.2) < dist - 0.2) return false;
  for (const smoke of state.smokes) {
    if (segmentHitsSphere(_eye, target.pos, smoke.x, smoke.y, smoke.z, smoke.radius)) return false;
  }
  return true;
}

function segmentHitsSphere(a, b, cx, cy, cz, r) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz || 1;
  let t = ((cx - a.x) * abx + (cy - a.y) * aby + (cz - a.z) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + abx * t - cx;
  const dy = a.y + aby * t - cy;
  const dz = a.z + abz * t - cz;
  return dx * dx + dy * dy + dz * dz < r * r;
}

// botPerceive: refresh the bot's picture of the world — the nearest visible enemy,
// and the newest enemy noise worth investigating.
function botPerceive(state, colliders, bot) {
  const ai = bot.ai;
  let best = null;
  let bestDist = Infinity;
  const foes = [state.player, ...state.bots];
  for (let i = 0; i < foes.length; i += 1) {
    const foe = foes[i];
    if (!foe.alive || foe.team === bot.team) continue;
    const d = foe.pos.distanceToSquared(bot.pos);
    if (d >= bestDist) continue;
    if (!canSee(state, colliders, bot, foe)) continue;
    best = foe;
    bestDist = d;
  }
  if (best) {
    if (ai.target !== best) {
      ai.reactAt = state.time + (0.55 - ai.skill * 0.3) + Math.sqrt(bestDist) * 0.006;
    }
    ai.target = best;
    ai.seen.copy(best.pos);
    ai.seenAt = state.time;
  } else if (ai.target && state.time - ai.seenAt > 1.4) {
    ai.target = null;
  }
  for (let i = state.noises.length - 1; i >= 0; i -= 1) {
    const noise = state.noises[i];
    if (noise.team === bot.team || state.time - noise.t > 0.8) continue;
    const dx = noise.x - bot.pos.x;
    const dz = noise.z - bot.pos.z;
    if (dx * dx + dz * dz < noise.radius * noise.radius) {
      ai.hear.set(noise.x, 0, noise.z);
      ai.hearAt = state.time;
      break;
    }
  }
}

function planRoute(bot, destIdx) {
  routeBetween(nearestWaypoint(bot.pos.x, bot.pos.z), destIdx, _route);
  bot.ai.route.length = 0;
  for (let i = 0; i < _route.length; i += 1) bot.ai.route.push(_route[i]);
  bot.ai.wp = 0;
}

function steerTo(state, bot, x, z, dt, colliders) {
  const dx = x - bot.pos.x;
  const dz = z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return true;
  const speed = BOT_SPEED * (bot.crouched ? 0.55 : 1);
  bot.vel.x = (dx / dist) * speed;
  bot.vel.z = (dz / dist) * speed;
  bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), 6 * dt);
  bot.vel.y -= GRAVITY * dt;
  bot.onGround = moveBody(bot.pos, bot.vel, dt, colliders, BOT_RADIUS, BOT_HEIGHT);
  bot.moving = Math.hypot(bot.vel.x, bot.vel.z);
  if (bot.moving > 0.5 && bot.onGround) bot.walkPhase += dt * bot.moving * 1.6;
  return dist < 1.3;
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

function aimError(ai, dist, targetMoving) {
  const base = (1 - ai.skill) * 0.06 + 0.01;
  return base + dist * 0.0008 + (targetMoving ? 0.014 : 0);
}

// botFight: strafe, crouch at range, and fire in bursts once past reaction time.
function botFight(state, colliders, bot, dt) {
  const ai = bot.ai;
  const target = ai.target;
  const def = WEAPONS[bot.weapon];
  _eye.set(bot.pos.x, bot.pos.y + eyeHeight(bot.crouched), bot.pos.z);
  _to.set(target.pos.x, target.pos.y + 1.15, target.pos.z).sub(_eye);
  const dist = _to.length();
  _to.divideScalar(dist || 1);
  const wantYaw = Math.atan2(-_to.x, -_to.z);
  const wantPitch = Math.asin(Math.max(-1, Math.min(1, _to.y)));
  bot.yaw = turnToward(bot.yaw, wantYaw, 8 * dt);
  bot.pitch += (wantPitch - bot.pitch) * Math.min(1, 10 * dt);
  if (state.time > ai.strafeAt) {
    ai.strafe = state.rng() < 0.5 ? -1 : 1;
    ai.strafeAt = state.time + 0.7 + state.rng() * 0.7;
  }
  bot.crouched = dist > 14 && ai.skill > 0.5 && state.rng() < 0.02 ? !bot.crouched : bot.crouched;
  const strafeX = _to.z * ai.strafe;
  const strafeZ = -_to.x * ai.strafe;
  bot.vel.x = strafeX * BOT_SPEED * 0.55;
  bot.vel.z = strafeZ * BOT_SPEED * 0.55;
  bot.vel.y -= GRAVITY * dt;
  bot.onGround = moveBody(bot.pos, bot.vel, dt, colliders, BOT_RADIUS, BOT_HEIGHT);
  bot.moving = Math.hypot(bot.vel.x, bot.vel.z);
  if (state.time < ai.reactAt) return;
  if (bot.mag <= 0) { startReload(state, bot); return; }
  if (ai.burst <= 0) {
    if (state.time < ai.burstAt) return;
    ai.burst = def.id === 'marksman' ? 1 : 2 + Math.floor(state.rng() * 3);
  }
  _dir.copy(_to);
  if (shootBullet(state, colliders, bot, _dir, aimError(ai, dist, target.moving > 1))) {
    ai.burst -= 1;
    if (ai.burst <= 0) ai.burstAt = state.time + 0.28 + state.rng() * 0.35;
  }
}

function followRoute(state, bot, dt, colliders) {
  const ai = bot.ai;
  if (ai.wp >= ai.route.length) return true;
  const node = WAYPOINTS[ai.route[ai.wp]];
  if (steerTo(state, bot, node.x, node.z, dt, colliders)) ai.wp += 1;
  if (Math.hypot(bot.pos.x - ai.lastX, bot.pos.z - ai.lastZ) < 0.05 && bot.moving > 1) {
    ai.stuckAt += dt;
    if (ai.stuckAt > 1.2) { ai.wp += 1; ai.stuckAt = 0; }
  } else {
    ai.stuckAt = 0;
  }
  ai.lastX = bot.pos.x;
  ai.lastZ = bot.pos.z;
  return ai.wp >= ai.route.length;
}

function holdSpot(state, bot, dt, colliders) {
  const ai = bot.ai;
  bot.vel.x = 0;
  bot.vel.z = 0;
  bot.vel.y -= GRAVITY * dt;
  bot.onGround = moveBody(bot.pos, bot.vel, dt, colliders, BOT_RADIUS, BOT_HEIGHT);
  bot.moving = 0;
  bot.yaw = turnToward(bot.yaw, ai.holdYaw, 2.5 * dt);
}

// assignRoundRoles: attackers agree on a site and split across lanes; defenders
// spread over the sites and mid. Called once per round, before the buy phase ends.
export function assignRoundRoles(state) {
  const rng = state.rng;
  const attackSite = rng() < 0.5 ? 'A' : 'B';
  const attackers = state.bots.filter((b) => b.team === TEAM.VG);
  const defenders = state.bots.filter((b) => b.team === TEAM.WD);
  const siteNode = attackSite === 'A' ? 7 : 17;
  const lanes = attackSite === 'A' ? [1, 2, 1] : [3, 2, 3];
  attackers.forEach((bot, i) => {
    bot.ai.site = attackSite;
    bot.ai.role = i === 0 ? 'carrier' : 'entry';
    bot.ai.mode = 'advance';
    bot.ai.route.length = 0;
    bot.ai.wp = 0;
    bot.ai.target = null;
    planRoute(bot, siteNode);
  });
  const posts = attackSite === 'A'
    ? [{ node: 20, yaw: Math.PI * 0.75 }, { node: 8, yaw: Math.PI * 0.5 }, { node: 21, yaw: -Math.PI * 0.5 }, { node: 11, yaw: Math.PI }]
    : [{ node: 21, yaw: -Math.PI * 0.75 }, { node: 18, yaw: -Math.PI * 0.5 }, { node: 20, yaw: Math.PI * 0.5 }, { node: 11, yaw: Math.PI }];
  defenders.forEach((bot, i) => {
    const post = posts[i % posts.length];
    bot.ai.site = attackSite;
    bot.ai.role = i < 2 ? 'anchor' : 'roamer';
    bot.ai.mode = 'advance';
    bot.ai.holdNode = post.node;
    bot.ai.holdYaw = post.yaw;
    bot.ai.target = null;
    planRoute(bot, post.node);
  });
  // The player carries the charge while attacking; a bot carries it while defending.
  if (state.playerTeam === TEAM.VG) {
    state.bomb.holder = 'player';
  } else {
    const carrier = attackers[0];
    state.bomb.holder = carrier.id;
    carrier.ai.role = 'carrier';
  }
  state.bomb.state = 'held';
}

// botBuy: spend the round's money like a cautious teammate — rifle when affordable,
// armour next, a grenade when rich.
export function botBuy(state, bot) {
  const rng = state.rng;
  if (bot.money >= WEAPONS.rifle.price && rng() < 0.85) {
    bot.weapon = 'rifle';
  } else if (bot.money >= WEAPONS.smg.price && rng() < 0.8) {
    bot.weapon = 'smg';
  } else {
    bot.weapon = 'sidearm';
  }
  const def = WEAPONS[bot.weapon];
  bot.money = Math.max(0, bot.money - def.price);
  bot.mag = def.mag;
  bot.reserve = def.reserve;
  if (bot.money >= ARMOR_PRICE && rng() < 0.8) {
    bot.armor = 100;
    bot.money -= ARMOR_PRICE;
  }
  if (bot.money >= NADES.he.price && rng() < 0.4) {
    bot.nades.he += 1;
    bot.money -= NADES.he.price;
  }
}

export function stepBots(state, dt, colliders) {
  const bomb = state.bomb;
  const planted = bomb.state === 'planted';
  for (const bot of state.bots) {
    if (!bot.alive) continue;
    const ai = bot.ai;
    bot.bloom = Math.max(0, bot.bloom - dt * 0.09);
    bot.flash = Math.max(0, bot.flash - dt * 0.55);
    bot.recoilP = Math.max(0, bot.recoilP - dt * 3);
    if (bot.reloading > 0) {
      bot.reloading -= dt;
      if (bot.reloading <= 0) {
        const def = WEAPONS[bot.weapon];
        const take = Math.min(def.mag - bot.mag, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
        bot.reloading = 0;
      }
    }
    if (state.round.phase === 'buy') { holdSpot(state, bot, dt, colliders); continue; }
    botPerceive(state, colliders, bot);

    // Fight overrides every other mode while an enemy is visible and reacted to.
    if (ai.target && state.time >= ai.reactAt) {
      bot.channel = null;
      botFight(state, colliders, bot, dt);
      continue;
    }

    // Plant: the carrier channels at the site once inside its ring.
    if (bomb.holder === bot.id && bomb.state === 'held') {
      const site = SITES[ai.site];
      const dx = bot.pos.x - site.x;
      const dz = bot.pos.z - site.z;
      if (dx * dx + dz * dz < site.r * site.r) {
        if (!ai.target) {
          bot.channel = { kind: 'plant', t: (bot.channel && bot.channel.kind === 'plant' ? bot.channel.t : 0) };
          holdSpot(state, bot, dt, colliders);
          continue;
        }
      } else if (ai.mode !== 'advance') {
        ai.mode = 'advance';
        planRoute(bot, ai.site === 'A' ? 7 : 17);
      }
    }

    // Defuse: a defender at the planted charge channels the defuse.
    if (planted && bot.team === TEAM.WD) {
      const dx = bot.pos.x - bomb.pos.x;
      const dz = bot.pos.z - bomb.pos.z;
      if (dx * dx + dz * dz < 2.6) {
        if (!ai.target || bomb.fuse < 6) {
          bot.channel = { kind: 'defuse', t: (bot.channel && bot.channel.kind === 'defuse' ? bot.channel.t : 0) };
          holdSpot(state, bot, dt, colliders);
          continue;
        }
      } else if (ai.mode !== 'retake') {
        ai.mode = 'retake';
        planRoute(bot, nearestWaypoint(bomb.pos.x, bomb.pos.z));
      }
    }

    // Guard: attackers hold near the planted charge instead of hunting.
    if (planted && bot.team === TEAM.VG && ai.mode !== 'guard') {
      ai.mode = 'guard';
      planRoute(bot, nearestWaypoint(bomb.pos.x + 3, bomb.pos.z + 3));
    }

    if (ai.mode === 'advance' || ai.mode === 'retake' || ai.mode === 'guard') {
      const done = followRoute(state, bot, dt, colliders);
      if (done) {
        ai.mode = 'hold';
        if (!(ai.holdNode !== undefined && bot.team === TEAM.WD && !planted)) {
          ai.holdYaw = bot.yaw;
        }
      }
      // A heard noise diverts a holding bot to investigate once.
      if (ai.mode === 'hold' && state.time - ai.hearAt < 2 && !ai.target) {
        ai.mode = 'advance';
        planRoute(bot, nearestWaypoint(ai.hear.x, ai.hear.z));
        ai.hearAt = -99;
      }
      continue;
    }
    holdSpot(state, bot, dt, colliders);
    if (state.time - ai.hearAt < 2 && !ai.target) {
      ai.mode = 'advance';
      planRoute(bot, nearestWaypoint(ai.hear.x, ai.hear.z));
      ai.hearAt = -99;
    }
  }
}
