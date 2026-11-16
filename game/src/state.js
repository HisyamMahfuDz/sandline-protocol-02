// SANDLINE PROTOCOL — the single state store. Every module reads and writes this one
// object; nothing else holds game state. Positions are THREE.Vector3 instances created
// once here and mutated in place, so the fixed-step simulation allocates nothing per tick.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

export const TEAM = { VG: 'VG', WD: 'WD' };
export const TEAM_NAME = { VG: 'Vanguard', WD: 'Wardens' };
export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const FUSE_TIME = 35;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;

// Deterministic RNG (mulberry32): staged screenshots and bot behaviour replay from a seed.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOT_NAMES = ['Nomad', 'Sable', 'Rook', 'Havoc', 'Mirage', 'Bastion', 'Wren'];

function makeCombatant(id, name, team, isPlayer) {
  return {
    id, name, team, isPlayer,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    hp: 100, armor: 0, alive: true,
    weapon: 'sidearm', mag: WEAPONS.sidearm.mag, reserve: WEAPONS.sidearm.reserve,
    reloading: 0, reloadTotal: 0,
    nades: { he: 0, smoke: 0, flash: 0 }, nadeSel: 'he',
    money: START_MONEY, kills: 0, deaths: 0, assists: 0,
    crouched: false, onGround: true, moving: 0,
    bloom: 0, recoilP: 0, recoilY: 0, nextShotAt: 0,
    flash: 0, hurtAt: -99, lastAttacker: null,
    channel: null, // {kind:'plant'|'defuse', t} while holding E
    ai: null,
    rig: null, // view objects, attached by render.js
    walkPhase: 0, deadAt: 0,
  };
}

function makeBot(id, name, team, rng) {
  const bot = makeCombatant(id, name, team, false);
  bot.ai = {
    skill: 0.35 + rng() * 0.45,
    role: 'entry', site: 'A',
    route: [], wp: 0,
    mode: 'advance', holdYaw: 0, holdUntil: 0,
    target: null, seen: new THREE.Vector3(), seenAt: -99, reactAt: 0,
    burst: 0, burstAt: 0, strafe: 1, strafeAt: 0,
    hear: new THREE.Vector3(), hearAt: -99,
    stuckAt: 0, lastX: 0, lastZ: 0, nadeAt: 0,
  };
  return bot;
}

export function createState(seed) {
  const rng = mulberry32(seed);
  const state = {
    seed, rng, time: 0, tick: 0, shotMode: null,
    round: { n: 1, phase: 'buy', timer: BUY_TIME, wins: { VG: 0, WD: 0 }, endAt: 0 },
    playerTeam: TEAM.VG,
    player: makeCombatant('player', 'You', TEAM.VG, true),
    bots: [],
    bomb: {
      holder: 'player', state: 'held', site: null,
      pos: new THREE.Vector3(), fuse: 0, plantedAt: 0,
    },
    grenades: [], smokes: [],
    tracers: [], impacts: [], noises: [],
    feed: [], banner: null, events: [],
    stats: { shots: 0, hits: 0, headshots: 0, plants: 0, defuses: 0 },
    over: false, winner: null, restartAt: 0,
  };
  for (let i = 0; i < 3; i += 1) state.bots.push(makeBot(`vg${i}`, BOT_NAMES[i], TEAM.VG, rng));
  for (let i = 0; i < 4; i += 1) state.bots.push(makeBot(`wd${i}`, BOT_NAMES[3 + i], TEAM.WD, rng));
  return state;
}

export function allCombatants(state) {
  return [state.player, ...state.bots];
}

export function aliveOf(state, team) {
  let count = 0;
  if (state.player.team === team && state.player.alive) count += 1;
  for (const bot of state.bots) if (bot.team === team && bot.alive) count += 1;
  return count;
}

export function pushEvent(state, event) {
  state.events.push(event);
}

export function pushFeed(state, text, team) {
  state.feed.unshift({ text, team: team ?? null, t: state.time });
  if (state.feed.length > 6) state.feed.length = 6;
}

export function setBanner(state, text, sub, dur) {
  state.banner = { text, sub: sub ?? '', t: state.time, dur: dur ?? 3.5 };
}
