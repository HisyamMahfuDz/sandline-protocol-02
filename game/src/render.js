// The view: three.js scene sync from the state, and nothing else. No game logic
// lives here — rigs, the weapon viewmodel, tracers, impacts, smoke and the camera
// all mirror the simulation state each frame. Effect meshes are fixed pools, so
// rendering allocates nothing per frame either.
import * as THREE from 'three';
import { SKY, TEAL, TERRA } from './map.js';
import { WEAPONS, eyeHeight } from './weapons.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function limb(w, h, d, color, pivotTop) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) geo.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.castShadow = true;
  return mesh;
}

function buildRig(team) {
  const uniform = team === 'VG' ? 0x2f5d58 : 0x7a4a2e;
  const dark = team === 'VG' ? 0x22443f : 0x59331f;
  const accent = team === 'VG' ? TEAL : TERRA;
  const group = new THREE.Group();
  const legL = limb(0.17, 0.8, 0.2, dark, true);
  legL.position.set(-0.13, 0.82, 0);
  const legR = limb(0.17, 0.8, 0.2, dark, true);
  legR.position.set(0.13, 0.82, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.32),
    new THREE.MeshLambertMaterial({ color: uniform }));
  torso.position.y = 1.14;
  torso.castShadow = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06),
    new THREE.MeshLambertMaterial({ color: accent }));
  plate.position.set(0, 1.16, -0.18);
  const armL = limb(0.14, 0.58, 0.16, uniform, true);
  armL.position.set(-0.36, 1.42, 0);
  const armR = limb(0.14, 0.58, 0.16, uniform, true);
  armR.position.set(0.36, 1.42, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshLambertMaterial({ color: 0xc9a17e }));
  head.position.y = 1.63;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38),
    new THREE.MeshLambertMaterial({ color: accent }));
  helmet.position.y = 1.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x10151c }));
  visor.position.set(0, 1.64, -0.18);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.62),
    new THREE.MeshLambertMaterial({ color: 0x23282e }));
  gun.position.set(0.18, 1.22, -0.34);
  group.add(legL, legR, torso, plate, armL, armR, head, helmet, visor, gun);
  return {
    group, legL, legR, armL, armR, head, torso, gun,
    fall: 0, fallDir: 1, flash: null, flashUntil: 0,
  };
}

function buildViewmodel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3d454e });
  const accent = new THREE.MeshLambertMaterial({ color: TEAL });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.38), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), mid);
  barrel.position.set(0, 0.02, -0.31);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), mid);
  mag.position.set(0, -0.11, 0.02);
  mag.rotation.x = 0.15;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), dark);
  grip.position.set(0, -0.09, 0.16);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.07), accent);
  sight.position.set(0, 0.07, -0.05);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.14), dark);
  stock.position.set(0, -0.01, 0.25);
  group.add(body, barrel, mag, grip, sight, stock);
  group.position.set(0.25, -0.23, -0.52);
  return { group, barrel, mag, body };
}

export function createView(scene, camera, state) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(new THREE.Color(SKY), 34, 95);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x8a6a4a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98a, 2.0);
  sun.position.set(28, 34, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(camera);

  const dot = dotTexture();
  for (const bot of state.bots) {
    bot.rig = buildRig(bot.team);
    scene.add(bot.rig.group);
  }

  const vm = buildViewmodel();
  camera.add(vm.group);
  const muzzleLight = new THREE.PointLight(0xffc46b, 0, 7, 2);
  muzzleLight.position.set(0.26, -0.18, -0.8);
  camera.add(muzzleLight);
  const muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dot, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false,
  }));
  muzzleSprite.scale.set(0.26, 0.26, 1);
  muzzleSprite.position.set(0.26, -0.2, -0.85);
  camera.add(muzzleSprite);

  const tracerGeo = new THREE.BoxGeometry(0.015, 0.015, 1);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push(mesh);
  }

  const impactMat = new THREE.SpriteMaterial({
    map: dot, color: 0xffb056, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const impacts = [];
  for (let i = 0; i < 32; i += 1) {
    const sprite = new THREE.Sprite(impactMat.clone());
    sprite.visible = false;
    scene.add(sprite);
    impacts.push(sprite);
  }

  const bombGroup = new THREE.Group();
  const bombBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x23282e }));
  const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: TEAL }));
  bombLight.position.set(0, 0.14, 0);
  bombGroup.add(bombBox, bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);

  const smokeMat = new THREE.MeshLambertMaterial({
    color: 0xd8d4cc, transparent: true, opacity: 0.6, depthWrite: false,
  });
  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);
  const smokePool = [];
  for (let i = 0; i < 4; i += 1) {
    const cloud = new THREE.Group();
    const cloudMat = smokeMat.clone();
    cloud.userData.mat = cloudMat;
    for (let j = 0; j < 5; j += 1) {
      const puff = new THREE.Mesh(smokeGeo, cloudMat);
      puff.position.set((j - 2) * 1.1, (j % 2) * 0.8, ((j * 7) % 3 - 1) * 1.1);
      puff.scale.setScalar(1.4 + (j % 3) * 0.4);
      cloud.add(puff);
    }
    cloud.visible = false;
    scene.add(cloud);
    smokePool.push(cloud);
  }

  const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const nadeMat = new THREE.MeshLambertMaterial({ color: 0x2c3430 });
  const nadePool = [];
  for (let i = 0; i < 6; i += 1) {
    const mesh = new THREE.Mesh(nadeGeo, nadeMat);
    mesh.visible = false;
    scene.add(mesh);
    nadePool.push(mesh);
  }

  const flashes = [];
  for (let i = 0; i < 4; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dot, color: 0xffc46b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, t0: -99, big: false });
  }

  return {
    camera, vm, muzzleLight, muzzleSprite, tracers, impacts, bombGroup, bombLight,
    smokePool, nadePool, flashes, dot,
    kick: 0, shake: 0, muzzleUntil: 0, deathDrop: 0, lastShotSeen: 0,
  };
}

function syncBot(bot, dt, time) {
  const rig = bot.rig;
  if (!rig) return;
  rig.group.position.copy(bot.pos);
  if (!bot.alive) {
    rig.fall = Math.min(1, rig.fall + dt * 3.2);
    rig.group.rotation.x = rig.fall * (Math.PI / 2) * rig.fallDir;
    rig.group.position.y = bot.pos.y + 0.18 * rig.fall;
    return;
  }
  rig.fall = 0;
  rig.group.rotation.set(0, bot.yaw, 0);
  rig.group.scale.y = bot.crouched ? 0.76 : 1;
  const swing = bot.moving > 0.5 && bot.onGround ? Math.sin(bot.walkPhase) * 0.55 : 0;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.4 - 0.5;
  rig.armR.rotation.x = swing * 0.4 - 0.5;
  rig.head.rotation.x = bot.pitch * 0.5;
}

export function syncView(view, state, dt) {
  const p = state.player;
  const time = state.time;

  for (const event of state.events) {
    if (event.kind === 'shot') {
      if (event.who === 'player') {
        view.muzzleUntil = time + 0.045;
        view.kick = Math.min(0.09, view.kick + 0.035);
      } else {
        const bot = state.bots.find((b) => b.id === event.who);
        if (bot && bot.rig) bot.rig.flashUntil = time + 0.05;
      }
    } else if (event.kind === 'explosion') {
      const slot = view.flashes.find((f) => time - f.t0 > 0.6) ?? view.flashes[0];
      slot.t0 = time;
      slot.big = !!event.big;
      slot.sprite.position.set(event.x, event.y, event.z);
      slot.sprite.visible = true;
      const dist = Math.hypot(p.pos.x - event.x, p.pos.z - event.z);
      view.shake = Math.min(1, view.shake + Math.max(0, 1 - dist / 18) * (event.big ? 1 : 0.5));
    } else if (event.kind === 'death') {
      const bot = state.bots.find((b) => b.id === event.who);
      if (bot && bot.rig) bot.rig.fallDir = state.rng() < 0.5 ? 1 : -1;
    }
  }

  for (const bot of state.bots) syncBot(bot, dt, time);

  // Tracers mirror the simulation's tracer records, fading with their life.
  for (let i = 0; i < view.tracers.length; i += 1) {
    const mesh = view.tracers[i];
    const rec = state.tracers[i];
    if (!rec) { mesh.visible = false; continue; }
    mesh.visible = true;
    _v1.set(rec.fromX, rec.fromY, rec.fromZ);
    _v2.set(rec.toX, rec.toY, rec.toZ);
    const len = _v1.distanceTo(_v2);
    mesh.position.copy(_v1).add(_v2).multiplyScalar(0.5);
    mesh.lookAt(_v2);
    mesh.scale.set(1, 1, Math.max(0.1, len));
    mesh.material.opacity = 0.9 * (1 - (time - rec.t) / rec.life);
  }
  for (let i = 0; i < view.impacts.length; i += 1) {
    const sprite = view.impacts[i];
    const rec = state.impacts[i];
    if (!rec) { sprite.visible = false; continue; }
    const age = (time - rec.t) / rec.life;
    sprite.visible = true;
    sprite.position.set(rec.x, rec.y, rec.z);
    sprite.scale.setScalar(0.28 + age * 0.3);
    sprite.material.opacity = 0.9 * (1 - age);
  }

  const bomb = state.bomb;
  const showBomb = bomb.state === 'dropped' || bomb.state === 'planted';
  view.bombGroup.visible = showBomb;
  if (showBomb) {
    view.bombGroup.position.copy(bomb.pos);
    const blink = bomb.state === 'planted'
      ? (Math.sin(time * (bomb.fuse < 5 ? 18 : 7)) > 0 ? 1 : 0.15)
      : 0.8;
    view.bombLight.material.color.setHex(TEAL);
    view.bombLight.scale.setScalar(0.7 + blink * 0.6);
  }

  for (let i = 0; i < view.smokePool.length; i += 1) {
    const cloud = view.smokePool[i];
    const rec = state.smokes[i];
    if (!rec) { cloud.visible = false; continue; }
    const age = time - rec.t0;
    cloud.visible = true;
    cloud.position.set(rec.x, rec.y, rec.z);
    const grow = Math.min(1, age / 1.2);
    const fade = age > rec.life - 3 ? Math.max(0, (rec.life - age) / 3) : 1;
    cloud.scale.setScalar(grow * rec.radius * 0.55);
    cloud.userData.mat.opacity = 0.6 * fade;
  }

  for (let i = 0; i < view.nadePool.length; i += 1) {
    const mesh = view.nadePool[i];
    const g = state.grenades[i];
    if (!g) { mesh.visible = false; continue; }
    mesh.visible = true;
    mesh.position.copy(g.pos);
  }

  for (const flash of view.flashes) {
    const age = time - flash.t0;
    if (age > 0.6) { flash.sprite.visible = false; continue; }
    flash.sprite.visible = true;
    flash.sprite.scale.setScalar((flash.big ? 9 : 4.5) * (0.4 + age * 1.6));
    flash.sprite.material.opacity = Math.max(0, 0.95 - age * 1.6);
  }

  // Weapon viewmodel: per-weapon length, reload dip, recoil kick, walk sway.
  const def = WEAPONS[p.weapon];
  const vm = view.vm;
  vm.barrel.scale.z = def.id === 'marksman' ? 1.5 : def.id === 'sidearm' ? 0.5 : 1;
  vm.mag.scale.y = def.id === 'smg' ? 1.4 : 1;
  let dip = 0;
  if (p.reloading > 0 && p.reloadTotal > 0) {
    const prog = 1 - p.reloading / p.reloadTotal;
    dip = Math.sin(prog * Math.PI) * 0.35;
  }
  view.kick = Math.max(0, view.kick - dt * 0.5);
  const sway = p.moving > 0.5 && p.onGround ? Math.sin(p.walkPhase) * 0.008 : 0;
  const bob = p.moving > 0.5 && p.onGround ? Math.abs(Math.cos(p.walkPhase)) * 0.012 : 0;
  vm.group.position.set(0.26 + sway, -0.24 - dip + bob, -0.48 + view.kick);
  vm.group.rotation.x = -dip * 0.8 + view.kick * 1.4;
  vm.group.rotation.z = sway * 1.5;
  const muzzleOn = time < view.muzzleUntil;
  view.muzzleSprite.material.opacity = muzzleOn ? 0.95 : 0;
  view.muzzleLight.intensity = muzzleOn ? 14 : 0;

  // Camera: eye position, yaw/pitch plus recovering recoil, walk bob, blast shake,
  // and a drop to the ground when the player is down.
  view.shake = Math.max(0, view.shake - dt * 2.2);
  const shakeX = view.shake > 0 ? (Math.random() * 2 - 1) * 0.02 * view.shake : 0;
  const shakeY = view.shake > 0 ? (Math.random() * 2 - 1) * 0.02 * view.shake : 0;
  if (!p.alive) view.deathDrop = Math.min(1, view.deathDrop + dt * 1.8);
  else view.deathDrop = 0;
  const eye = eyeHeight(p.crouched) - view.deathDrop * 1.1;
  view.camera.position.set(
    p.pos.x + sway * 0.4,
    p.pos.y + eye + bob * 0.5,
    p.pos.z,
  );
  view.camera.rotation.set(
    p.pitch + p.recoilP + shakeX,
    p.yaw + p.recoilY + shakeY,
    view.deathDrop * 0.35,
    'YXZ',
  );
}
