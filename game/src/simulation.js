// stepSimulation: the fixed-step heart of the game. One function owns the round
// machine (buy → live → planted → ended), the plant/defuse channels, the economy,
// the player's weapon and grenade actions, and the win checks. Movement, bots and
// grenades are stepped from here; rendering only ever reads the state it writes.
import * as THREE from 'three';
import { SITES, SPAWNS } from './map.js';
import { WEAPONS, NADES, ARMOR_PRICE, shootBullet } from './weapons.js';
import { stepPlayer, startReload, eyePos, forwardOf } from './player.js';
import { stepBots, assignRoundRoles, botBuy } from './bots.js';
import { stepGrenades, throwGrenade } from './grenades.js';
import {
  TEAM, TEAM_NAME, BUY_TIME, ROUND_TIME, FUSE_TIME, PLANT_TIME, DEFUSE_TIME,
  WIN_ROUNDS, MAX_ROUNDS, START_MONEY,
  aliveOf, pushEvent, pushFeed, setBanner,
} from './state.js';

const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();

function resetCombatant(state, c, spawn) {
  c.pos.set(spawn.x, 0, spawn.z);
  c.vel.set(0, 0, 0);
  c.yaw = spawn.yaw;
  c.pitch = 0;
  c.hp = 100;
  c.alive = true;
  c.reloading = 0;
  c.bloom = 0;
  c.recoilP = 0;
  c.recoilY = 0;
  c.flash = 0;
  c.channel = null;
  c.crouched = false;
  c.ammo = c.ammo ?? {};
  const def = WEAPONS[c.weapon];
  c.ammo[c.weapon] = { mag: def.mag, reserve: def.reserve };
  c.mag = def.mag;
  c.reserve = def.reserve;
}

export function startRound(state, roundNumber) {
  state.round.n = roundNumber;
  state.round.phase = 'buy';
  state.round.timer = BUY_TIME;
  state.bomb.state = 'held';
  state.bomb.site = null;
  state.bomb.fuse = 0;
  state.grenades.length = 0;
  state.smokes.length = 0;
  state.tracers.length = 0;
  state.impacts.length = 0;
  state.noises.length = 0;
  const vgSpawns = [...SPAWNS.VG];
  const wdSpawns = [...SPAWNS.WD];
  const all = [state.player, ...state.bots];
  for (const c of all) {
    const list = c.team === TEAM.VG ? vgSpawns : wdSpawns;
    resetCombatant(state, c, list.shift() ?? list[0]);
  }
  for (const bot of state.bots) botBuy(state, bot);
  assignRoundRoles(state);
  setBanner(state, `Round ${roundNumber}`, state.playerTeam === TEAM.VG
    ? 'Plant the surge charge at site A or B'
    : 'Defend the reactor sites', 3.5);
  pushEvent(state, { kind: 'roundStart' });
}

export function startMatch(state) {
  state.round.wins = { VG: 0, WD: 0 };
  state.over = false;
  state.winner = null;
  state.playerTeam = TEAM.VG;
  state.player.team = TEAM.VG;
  state.bots[0].team = TEAM.VG;
  state.bots[1].team = TEAM.VG;
  state.bots[2].team = TEAM.VG;
  state.bots[3].team = TEAM.WD;
  state.bots[4].team = TEAM.WD;
  state.bots[5].team = TEAM.WD;
  state.bots[6].team = TEAM.WD;
  const all = [state.player, ...state.bots];
  for (const c of all) {
    c.money = START_MONEY;
    c.kills = 0;
    c.deaths = 0;
    c.weapon = 'sidearm';
    c.primary = null;
    c.ammo = {};
    c.nades = { he: 0, smoke: 0, flash: 0 };
    c.armor = 0;
  }
  state.feed.length = 0;
  state.stats.shots = 0;
  state.stats.hits = 0;
  state.stats.headshots = 0;
  state.stats.plants = 0;
  state.stats.defuses = 0;
  startRound(state, 1);
}

function switchWeapon(state, c, id) {
  if (c.weapon === id || c.reloading > 0) return;
  const def = WEAPONS[id];
  if (!def) return;
  c.ammo = c.ammo ?? {};
  c.ammo[c.weapon] = { mag: c.mag, reserve: c.reserve };
  const saved = c.ammo[id] ?? { mag: def.mag, reserve: def.reserve };
  c.ammo[id] = saved;
  c.weapon = id;
  c.mag = saved.mag;
  c.reserve = saved.reserve;
  pushEvent(state, { kind: 'switch', who: c.id, weapon: id });
}

export function tryBuy(state, c, item) {
  if (state.round.phase !== 'buy' || !c.alive) return false;
  const def = WEAPONS[item] ?? NADES[item];
  const price = item === 'armor' ? ARMOR_PRICE : def ? def.price : -1;
  if (price < 0 || c.money < price) return false;
  if (WEAPONS[item]) {
    if (WEAPONS[item].slot === 'primary') c.primary = item;
    c.money -= price;
    c.ammo = c.ammo ?? {};
    c.ammo[item] = { mag: def.mag, reserve: def.reserve };
    c.reloading = 0;
    switchWeapon(state, c, item);
  } else if (NADES[item]) {
    c.money -= price;
    c.nades[item] += 1;
    c.nadeSel = item;
  } else if (item === 'armor') {
    if (c.armor >= 100) return false;
    c.money -= price;
    c.armor = 100;
  }
  pushEvent(state, { kind: 'bought', who: c.id, item });
  return true;
}

function inSite(pos, site) {
  const dx = pos.x - site.x;
  const dz = pos.z - site.z;
  return dx * dx + dz * dz < site.r * site.r;
}

function updateChannel(state, c, dt, want, kind) {
  if (!want) {
    c.channel = null;
    return;
  }
  if (!c.channel || c.channel.kind !== kind) c.channel = { kind, t: 0 };
  if (c.moving > 1.5) {
    c.channel = null;
    return;
  }
  c.channel.t += dt;
  const need = kind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
  if (c.channel.t >= need) {
    c.channel = null;
    if (kind === 'plant') completePlant(state, c);
    else completeDefuse(state, c);
  }
}

function completePlant(state, c) {
  const siteKey = inSite(c.pos, SITES.A) ? 'A' : 'B';
  state.bomb.state = 'planted';
  state.bomb.site = siteKey;
  state.bomb.holder = null;
  state.bomb.pos.copy(c.pos);
  state.bomb.pos.y = 0.15;
  state.bomb.fuse = FUSE_TIME;
  state.bomb.plantedAt = state.time;
  state.round.phase = 'planted';
  c.money = Math.min(16000, c.money + 400);
  if (c.isPlayer) state.stats.plants += 1;
  pushFeed(state, `${c.name} planted the surge charge at site ${siteKey}`, c.team);
  setBanner(state, 'Surge charge planted', `Site ${siteKey} — ${FUSE_TIME}s fuse`, 3);
  pushEvent(state, { kind: 'planted', x: c.pos.x, z: c.pos.z });
}

function completeDefuse(state, c) {
  state.bomb.state = 'gone';
  if (c.isPlayer) state.stats.defuses += 1;
  c.money = Math.min(16000, c.money + 300);
  pushFeed(state, `${c.name} defused the surge charge`, c.team);
  endRound(state, TEAM.WD, 'Charge defused');
}

function endRound(state, winner, reason) {
  if (state.round.phase === 'ended' || state.over) return;
  state.round.phase = 'ended';
  state.round.endAt = state.time + 4;
  state.round.wins[winner] += 1;
  const all = [state.player, ...state.bots];
  for (const c of all) {
    c.money = Math.min(16000, c.money + (c.team === winner ? 1400 : 900));
  }
  setBanner(state, `${TEAM_NAME[winner]} take the round`, reason, 4);
  pushEvent(state, { kind: 'roundEnd', winner, playerWon: state.playerTeam === winner });
  pushFeed(state, `${TEAM_NAME[winner]} win the round — ${reason}`, winner);
}

function checkRoundEnd(state) {
  if (state.round.phase !== 'live' && state.round.phase !== 'planted') return;
  const planted = state.bomb.state === 'planted';
  const vgAlive = aliveOf(state, TEAM.VG);
  const wdAlive = aliveOf(state, TEAM.WD);
  if (vgAlive === 0 && !planted) {
    endRound(state, TEAM.WD, 'Vanguard eliminated');
  } else if (wdAlive === 0) {
    endRound(state, TEAM.VG, 'Wardens eliminated');
  } else if (state.round.phase === 'live' && state.round.timer <= 0) {
    endRound(state, TEAM.WD, 'Time expired');
  }
}

function playerActions(state, input, colliders) {
  const p = state.player;
  if (!p.alive) return;
  if (input.consumePressed('KeyB')) pushEvent(state, { kind: 'toggleBuy' });
  if (input.consumePressed('KeyR') && startReload(state, p)) {
    pushEvent(state, { kind: 'reload', who: p.id });
  }
  if (!input.state.menuOpen) {
    if (input.consumePressed('Digit1') && p.primary) switchWeapon(state, p, p.primary);
    if (input.consumePressed('Digit2')) switchWeapon(state, p, 'sidearm');
    if (input.consumePressed('Digit3')) p.nadeSel = 'he';
    if (input.consumePressed('Digit4')) p.nadeSel = 'smoke';
    if (input.consumePressed('Digit5')) p.nadeSel = 'flash';
    if (input.consumePressed('KeyQ')) {
      const order = ['he', 'smoke', 'flash'];
      p.nadeSel = order[(order.indexOf(p.nadeSel) + 1) % order.length];
    }
    if (input.consumePressed('KeyG')) throwGrenade(state, p, p.nadeSel);
  }
  if (state.round.phase !== 'live' && state.round.phase !== 'planted') return;
  const def = WEAPONS[p.weapon];
  const wantFire = def.auto ? input.state.firing : input.state.firePressed;
  if (wantFire && input.state.locked) {
    eyePos(p, _eye);
    forwardOf(p.yaw + p.recoilY, p.pitch + p.recoilP, _dir);
    shootBullet(state, colliders, p, _dir, 0);
  }
}

function playerChannel(state, input, dt) {
  const p = state.player;
  if (!p.alive || (state.round.phase !== 'live' && state.round.phase !== 'planted')) {
    p.channel = null;
    return;
  }
  const holding = input.state.keys.has('KeyE');
  if (state.bomb.holder === 'player' && state.bomb.state === 'held'
    && (inSite(p.pos, SITES.A) || inSite(p.pos, SITES.B))) {
    updateChannel(state, p, dt, holding, 'plant');
    return;
  }
  if (state.bomb.state === 'planted' && p.team === TEAM.WD) {
    const dx = p.pos.x - state.bomb.pos.x;
    const dz = p.pos.z - state.bomb.pos.z;
    if (dx * dx + dz * dz < 2.6) {
      updateChannel(state, p, dt, holding, 'defuse');
      return;
    }
  }
  p.channel = null;
}

function botChannels(state, dt) {
  for (const bot of state.bots) {
    if (!bot.alive || !bot.channel) continue;
    const kind = bot.channel.kind;
    bot.channel.t += dt;
    const need = kind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
    if (bot.channel.t >= need) {
      bot.channel = null;
      if (kind === 'plant') completePlant(state, bot);
      else completeDefuse(state, bot);
    }
  }
}

function bombPickup(state) {
  if (state.bomb.state !== 'dropped') return;
  const all = [state.player, ...state.bots];
  for (const c of all) {
    if (!c.alive || c.team !== TEAM.VG) continue;
    const dx = c.pos.x - state.bomb.pos.x;
    const dz = c.pos.z - state.bomb.pos.z;
    if (dx * dx + dz * dz < 1.7) {
      state.bomb.holder = c.id;
      state.bomb.state = 'held';
      pushFeed(state, `${c.name} picked up the surge charge`, c.team);
      pushEvent(state, { kind: 'pickup', who: c.id });
      return;
    }
  }
}

export function stepSimulation(state, dt, input, colliders) {
  state.time += dt;
  state.tick += 1;

  if (state.over) return;
  if (state.round.phase === 'buy') {
    state.round.timer -= dt;
    if (state.round.timer <= 0) {
      state.round.phase = 'live';
      state.round.timer = ROUND_TIME;
      setBanner(state, 'Go', state.playerTeam === TEAM.VG ? 'Plant the charge' : 'Hold the sites', 2);
      pushEvent(state, { kind: 'closeBuy' });
    }
  } else if (state.round.phase === 'live') {
    state.round.timer -= dt;
  } else if (state.round.phase === 'planted') {
    state.bomb.fuse -= dt;
    const prevBeep = Math.ceil((state.bomb.fuse + dt) / 1);
    if (Math.ceil(state.bomb.fuse / 1) !== prevBeep) {
      pushEvent(state, { kind: 'beep', final: state.bomb.fuse < 5 });
    }
    if (state.bomb.fuse <= 0) {
      state.bomb.state = 'gone';
      pushEvent(state, {
        kind: 'explosion', x: state.bomb.pos.x, y: 1, z: state.bomb.pos.z, big: true,
      });
      endRound(state, TEAM.VG, 'Surge charge detonated');
    }
  } else if (state.round.phase === 'ended' && state.time >= state.round.endAt) {
    const wins = state.round.wins;
    if (wins.VG >= WIN_ROUNDS || wins.WD >= WIN_ROUNDS || state.round.n >= MAX_ROUNDS) {
      state.over = true;
      state.winner = wins.VG === wins.WD ? null : wins.VG > wins.WD ? TEAM.VG : TEAM.WD;
      pushEvent(state, { kind: 'matchEnd' });
    } else {
      if (state.round.n === 4) {
        // Halftime: sides swap, so the player attacks and defends in one match.
        state.playerTeam = state.playerTeam === TEAM.VG ? TEAM.WD : TEAM.VG;
        const all = [state.player, ...state.bots];
        for (const c of all) c.team = c.team === TEAM.VG ? TEAM.WD : TEAM.VG;
        setBanner(state, 'Halftime — sides swap', state.playerTeam === TEAM.VG ? 'You attack' : 'You defend', 3.5);
      }
      startRound(state, state.round.n + 1);
    }
    return;
  }

  if (state.round.phase !== 'ended') {
    playerActions(state, input, colliders);
    stepPlayer(state, dt, input.state, colliders);
    stepBots(state, dt, colliders);
    stepGrenades(state, dt, colliders);
    playerChannel(state, input, dt);
    botChannels(state, dt);
    bombPickup(state);
    checkRoundEnd(state);
  }

  for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
    if (state.time - state.tracers[i].t > state.tracers[i].life) state.tracers.splice(i, 1);
  }
  for (let i = state.impacts.length - 1; i >= 0; i -= 1) {
    if (state.time - state.impacts[i].t > state.impacts[i].life) state.impacts.splice(i, 1);
  }
  for (let i = state.noises.length - 1; i >= 0; i -= 1) {
    if (state.time - state.noises[i].t > 1.2) state.noises.splice(i, 1);
  }
}
