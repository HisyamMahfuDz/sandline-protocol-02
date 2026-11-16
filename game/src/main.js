// SANDLINE PROTOCOL — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. The game is a complete round-based tactical FPS:
// two teams, plant/defuse objective, money and a buy menu, bots that see, hear and
// shoot back, on an original three-lane map. ?shot=start|buy|play|objective|end
// with &seed=N stages a deterministic frame for capture and freezes it.
import * as THREE from 'three';
import { createState, TEAM_NAME } from './state.js';
import { buildMap } from './map.js';
import { stepSimulation, startMatch, tryBuy } from './simulation.js';
import { createView, syncView } from './render.js';
import { createHud, BUY_ITEMS } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot, finishShot } from './shots.js';
import { applyLook } from './player.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);

const { colliders } = buildMap(scene);
const state = createState(seed);
state.shotMode = shot;
const view = createView(scene, camera, state);
const audio = createAudio();
const hud = createHud({
  onBuy: (item) => {
    if (tryBuy(state, state.player, item)) audio.click();
  },
  onCloseBuy: () => {
    hud.closeBuy();
    input.state.menuOpen = false;
    input.requestLock();
  },
});
const input = createInput(renderer.domElement, onLockChange);

let started = false;
let lastHp = 100;

startMatch(state);

function endSummary() {
  const p = state.player;
  const acc = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;
  return `Final score — Vanguard ${state.round.wins.VG} : ${state.round.wins.WD} Wardens. `
    + `You: ${p.kills} kills, ${p.deaths} deaths, ${acc}% accuracy, ${state.stats.plants} plants, ${state.stats.headshots} headshots.`;
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.overlayKind = 'playing';
    hud.hideOverlay();
  } else if (!hud.buyOpen) {
    if (state.over) hud.showOverlay('end', { winner: state.winner, playerTeam: state.playerTeam, summary: endSummary() });
    else hud.showOverlay(started ? 'paused' : 'start');
  }
}

document.getElementById('play').addEventListener('click', () => {
  audio.resume();
  if (state.over) {
    startMatch(state);
    lastHp = 100;
  }
  hud.overlayKind = 'playing';
  hud.hideOverlay();
  input.requestLock();
});

renderer.domElement.addEventListener('click', () => {
  if (started && !input.state.locked && !hud.buyOpen && !state.over && hud.overlayKind !== 'start') {
    input.requestLock();
  }
});

function toggleBuy() {
  if (state.round.phase !== 'buy') {
    hud.flashHint('Buying is closed — wait for the next round');
    return;
  }
  if (hud.buyOpen) {
    hud.closeBuy();
    input.state.menuOpen = false;
    input.requestLock();
  } else {
    hud.openBuy();
    input.state.menuOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function distToPlayer(x, z) {
  return Math.hypot(state.player.pos.x - x, state.player.pos.z - z);
}

function drainEvents() {
  for (const event of state.events) {
    switch (event.kind) {
      case 'shot':
        audio.shot(event.weapon, event.who === 'player' ? 0 : distToPlayer(event.x, event.z));
        break;
      case 'dry': audio.dry(); break;
      case 'reload': audio.reload(); break;
      case 'hitmark': audio.hit(event.kill, event.head); break;
      case 'explosion': audio.explosion(distToPlayer(event.x, event.z)); break;
      case 'flashpop': audio.flashpop(distToPlayer(event.x, event.z)); break;
      case 'beep': audio.beep(event.final); break;
      case 'planted': audio.plant(); break;
      case 'roundEnd': if (event.playerWon) audio.win(); else audio.lose(); break;
      case 'bought': case 'pickup': audio.click(); break;
      case 'toggleBuy': toggleBuy(); break;
      case 'closeBuy':
        if (hud.buyOpen) {
          hud.closeBuy();
          input.state.menuOpen = false;
          if (started && !shot) input.requestLock();
        }
        break;
      case 'matchEnd':
        if (document.pointerLockElement) document.exitPointerLock();
        hud.showOverlay('end', { winner: state.winner, playerTeam: state.playerTeam, summary: endSummary() });
        break;
      default: break;
    }
  }
  if (state.player.hp < lastHp && state.player.alive) audio.hurt();
  lastHp = state.player.hp;
}

function handleBuyKeys() {
  if (!hud.buyOpen) return;
  for (let i = 0; i < BUY_ITEMS.length; i += 1) {
    if (input.consumePressed(`Digit${i + 1}`) && tryBuy(state, state.player, BUY_ITEMS[i].item)) {
      audio.click();
    }
  }
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  const look = input.takeLook();
  if (input.state.locked) applyLook(state, look.x, look.y);
  handleBuyKeys();
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    stepSimulation(state, FIXED_STEP, input, colliders);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  input.endStep();
  syncView(view, state, dt);
  hud.sync(state, input);
  drainEvents();
  state.events.length = 0;
  renderer.render(scene, camera);
}

const dummyInput = {
  state: { keys: new Set(), firing: false, firePressed: false, locked: false, menuOpen: false },
  consumePressed: () => false,
};

function runShot(name) {
  stageShot(state, name, colliders);
  const settles = { start: 20, buy: 20, play: 6, objective: 6, end: 1 };
  const count = settles[name] ?? 10;
  for (let i = 0; i < count; i += 1) stepSimulation(state, FIXED_STEP, dummyInput, colliders);
  finishShot(state, name);
  for (let i = 0; i < 20; i += 1) syncView(view, state, FIXED_STEP);
  if (name === 'start') hud.showOverlay('start');
  else if (name === 'buy') { hud.hideOverlay(); hud.openBuy(); }
  else if (name === 'end') hud.showOverlay('end', { winner: state.winner, playerTeam: state.playerTeam, summary: endSummary() });
  else hud.hideOverlay();
  hud.sync(state, dummyInput);
  let painted = 0;
  (function paint() {
    requestAnimationFrame(paint);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }());
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for play-testing: read the live state from the console or CDP.
window.__sandline = { state, startMatch, stepSimulation, colliders };

if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
