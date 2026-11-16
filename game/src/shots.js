// Staged screenshots: deterministic scenes built from the real game state, the
// real simulation and the real HUD — no pointer lock, no fake overlays. ?shot=
// start|buy|play|objective|end with &seed=N picks the scene; the main loop settles
// the simulation a few fixed steps, applies the final cosmetic state, renders
// twice and freezes with window.__shotReady set.
import * as THREE from 'three';
import { SITES } from './map.js';
import { WEAPONS, shootBullet } from './weapons.js';
import { eyePos, forwardOf } from './player.js';
import { setBanner } from './state.js';

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

function aimAt(shooter, target, height) {
  eyePos(shooter, _eye);
  _dir.set(target.x, target.y + height, target.z).sub(_eye).normalize();
  shooter.yaw = Math.atan2(-_dir.x, -_dir.z);
  shooter.pitch = Math.asin(Math.max(-1, Math.min(1, _dir.y)));
  return _dir;
}

function place(bot, x, z, yaw, walkPhase) {
  bot.pos.set(x, 0, z);
  bot.yaw = yaw;
  bot.pitch = 0;
  bot.walkPhase = walkPhase ?? 0;
  bot.vel.set(0, 0, 0);
  if (bot.ai) {
    bot.ai.target = null;
    bot.ai.mode = 'hold';
    bot.ai.holdYaw = yaw;
  }
}

// stageShot: positions and scripted actions, applied before the settle steps.
export function stageShot(state, name, colliders) {
  const p = state.player;
  const bots = state.bots;
  if (name === 'start' || name === 'buy') {
    state.round.phase = 'buy';
    state.round.timer = 8.4;
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    if (name === 'buy') {
      p.money = 3200;
      p.weapon = 'rifle';
      p.mag = WEAPONS.rifle.mag;
      p.reserve = WEAPONS.rifle.reserve;
      p.primary = 'rifle';
      p.armor = 100;
    }
    return;
  }
  if (name === 'play') {
    state.round.phase = 'live';
    state.round.timer = 63;
    state.round.wins = { VG: 2, WD: 1 };
    p.pos.set(-2, 0, 2);
    p.hp = 100;
    p.armor = 50;
    p.money = 2400;
    p.kills = 2;
    p.deaths = 1;
    p.weapon = 'rifle';
    p.primary = 'rifle';
    p.mag = 24;
    p.reserve = 90;
    p.nades = { he: 1, smoke: 1, flash: 0 };
    place(bots[3], 10, -1, Math.PI / 2, 1.2);
    bots[3].hp = 62;
    bots[3].weapon = 'rifle';
    place(bots[4], 13, 3, Math.PI / 2 + 0.4, 2.6);
    place(bots[0], -6, -2, -Math.PI / 2, 0.6);
    bots[0].weapon = 'rifle';
    place(bots[5], 20, -13, Math.PI * 0.75, 0);
    aimAt(p, bots[3].pos, 1.35);
    forwardOf(p.yaw, p.pitch, _dir);
    shootBullet(state, colliders, p, _dir, 0);
    aimAt(bots[3], p.pos, 1.0);
    forwardOf(bots[3].yaw, bots[3].pitch, _dir);
    shootBullet(state, colliders, bots[3], _dir, 0.02);
    setBanner(state, '', '', 0);
    return;
  }
  if (name === 'objective') {
    state.round.phase = 'live';
    state.round.timer = 54;
    state.round.wins = { VG: 1, WD: 1 };
    state.bomb.holder = 'player';
    state.bomb.state = 'held';
    p.pos.set(15.8, 0, -12.3);
    p.hp = 100;
    p.money = 1750;
    p.weapon = 'rifle';
    p.primary = 'rifle';
    p.mag = 30;
    p.reserve = 90;
    aimAt(p, new THREE.Vector3(SITES.A.x, 0, SITES.A.z), 0.6);
    place(bots[1], 13.5, -14, Math.PI * 0.6, 0.4);
    bots[1].weapon = 'smg';
    place(bots[5], 24, -11, Math.PI * 0.8, 1.8);
    place(bots[4], 26, -17, Math.PI / 2, 0);
    setBanner(state, '', '', 0);
    return;
  }
  if (name === 'end') {
    state.round.phase = 'ended';
    state.round.wins = { VG: 5, WD: 3 };
    state.round.n = 8;
    state.over = true;
    state.winner = 'VG';
    p.pos.set(6, 0, -4);
    p.hp = 64;
    p.money = 3100;
    p.kills = 11;
    p.deaths = 6;
    state.stats.shots = 120;
    state.stats.hits = 52;
    state.stats.plants = 2;
    state.stats.headshots = 4;
    p.weapon = 'rifle';
    p.primary = 'rifle';
    p.mag = 18;
    p.reserve = 60;
    bots[0].kills = 7; bots[0].deaths = 5;
    bots[1].kills = 5; bots[1].deaths = 7;
    bots[2].kills = 4; bots[2].deaths = 6;
    bots[3].kills = 8; bots[3].deaths = 8;
    bots[4].kills = 6; bots[4].deaths = 7;
    bots[5].kills = 5; bots[5].deaths = 8;
    bots[6].kills = 3; bots[6].deaths = 7;
    place(bots[0], 2, -6, -Math.PI / 2, 0.8);
    place(bots[3], 12, -8, Math.PI / 2, 0);
    bots[3].alive = false;
    bots[3].hp = 0;
    place(bots[5], 14, -2, Math.PI * 0.7, 2.1);
    aimAt(p, new THREE.Vector3(14, 0, -8), 1.3);
    setBanner(state, 'Vanguard take the match', '5 — 3 · Helios Yard', 60);
  }
}

// finishShot: cosmetic state applied after the settle steps, so the frozen frame
// shows exactly the staged moment (the settle would otherwise clear the channel).
export function finishShot(state, name) {
  if (name === 'objective') {
    state.player.channel = { kind: 'plant', t: 2.1 };
  }
  if (name === 'play') {
    state.player.mag = 24;
  }
}
