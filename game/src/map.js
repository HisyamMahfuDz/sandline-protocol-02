// HELIOS YARD: an original dusk desert solar farm / container yard. Three lanes
// (A long, mid, B lane) with connectors, two reactor sites, crates and sandbags for
// cover. All geometry is procedural; colliders are axis-aligned boxes, and the
// waypoint graph below is what bots navigate. Nothing here touches the network.
import * as THREE from 'three';

export const SKY = 0x1c2438;
export const SAND = 0xd9a066;
export const SAND_DARK = 0xb98a52;
export const TERRA = 0xb4552d;
export const TEAL = 0x2fa8a0;
export const CONCRETE = 0x8f8578;
export const METAL = 0x5a6b73;
export const PANEL = 0x27435c;

export const BOUNDS = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };

export const SITES = {
  A: { x: 20, z: -16, r: 6 },
  B: { x: 20, z: 16, r: 6 },
};

export const SPAWNS = {
  VG: [
    { x: -29, z: -2, yaw: -Math.PI / 2 },
    { x: -29, z: 2, yaw: -Math.PI / 2 },
    { x: -27, z: -3.5, yaw: -Math.PI / 2 },
    { x: -27, z: 3.5, yaw: -Math.PI / 2 },
  ],
  WD: [
    { x: 29, z: -2, yaw: Math.PI / 2 },
    { x: 29, z: 2, yaw: Math.PI / 2 },
    { x: 27, z: -3.5, yaw: Math.PI / 2 },
    { x: 27, z: 3.5, yaw: Math.PI / 2 },
  ],
};

// Waypoint graph: nodes with positions, links both ways. Bots pathfind with BFS.
export const WAYPOINTS = [
  { x: -28, z: 0, links: [1, 2, 3] },
  { x: -24, z: -10, links: [0, 4, 25] },
  { x: -24, z: 0, links: [0] },
  { x: -24, z: 10, links: [0, 14, 26] },
  { x: -12, z: -18, links: [1, 5, 25] },
  { x: 2, z: -18, links: [4, 6, 12] },
  { x: 12, z: -18, links: [5, 7, 23] },
  { x: 16, z: -14, links: [6, 8, 23] },
  { x: 24, z: -12, links: [7, 20, 22] },
  { x: -8, z: 0, links: [25, 26, 10] },
  { x: 0, z: -2.5, links: [9, 11] },
  { x: 8, z: -2.5, links: [10, 12, 13] },
  { x: 8, z: -8, links: [11, 5, 23] },
  { x: 8, z: 8, links: [11, 15, 24] },
  { x: -12, z: 18, links: [3, 15] },
  { x: 2, z: 18, links: [14, 16, 13] },
  { x: 12, z: 18, links: [15, 17, 24] },
  { x: 16, z: 14, links: [16, 18, 24] },
  { x: 24, z: 12, links: [17, 21, 22] },
  { x: 28, z: 0, links: [20, 21, 22] },
  { x: 26, z: -10, links: [19, 8, 22] },
  { x: 26, z: 10, links: [19, 18, 22] },
  { x: 24, z: 0, links: [19, 20, 21, 8, 18] },
  { x: 14, z: -10, links: [6, 7, 12] },
  { x: 14, z: 10, links: [16, 17, 13] },
  { x: -14, z: -8, links: [1, 4, 9] },
  { x: -18, z: 7, links: [3, 9] },
];

// Solid props: [x, z, width(x), depth(z), height, kind]. Every one is a collider;
// the builder turns each into styled geometry. Kinds: wall, container, crate,
// sandbag, reactor, panel, barrel.
const PROPS = [
  [0, -24.5, 66, 1, 4, 'wall'], [0, 24.5, 66, 1, 4, 'wall'],
  [-32.5, 0, 1, 50, 4, 'wall'], [32.5, 0, 1, 50, 4, 'wall'],
  [0, -5.5, 6, 2.4, 2.6, 'container'], [0, 5.5, 6, 2.4, 2.6, 'container'],
  [0, 0, 3, 1, 1.1, 'sandbag'],
  [6.5, 2, 1.2, 1.2, 1.2, 'crate'],
  [-9, -10.5, 6, 2, 2.2, 'panel'], [-9, 10.5, 6, 2, 2.2, 'panel'],
  [-14, -21.5, 6, 2.4, 2.6, 'container'], [0, -21.5, 6, 2.4, 2.6, 'container'],
  [14, -21.5, 6, 2.4, 2.6, 'container'],
  [-8, -16.5, 1.2, 1.2, 1.2, 'crate'], [6, -16.5, 1.2, 1.2, 1.2, 'crate'],
  [10, -13, 1, 5, 3, 'wall'],
  [20, -16, 3.4, 3.4, 3, 'reactor'],
  [18, -11.5, 1.2, 1.2, 1.2, 'crate'], [24, -19, 1.2, 1.2, 1.2, 'crate'],
  [23, -14, 1.2, 1.2, 1.2, 'crate'], [18, -19.5, 3, 1, 1.1, 'sandbag'],
  [27, -16, 2.4, 6, 2.6, 'container'],
  [-14, 21.5, 6, 2.4, 2.6, 'container'], [0, 21.5, 6, 2.4, 2.6, 'container'],
  [14, 21.5, 6, 2.4, 2.6, 'container'],
  [-8, 16.5, 1.2, 1.2, 1.2, 'crate'], [6, 16.5, 1.2, 1.2, 1.2, 'crate'],
  [10, 13, 1, 5, 3, 'wall'],
  [20, 16, 3.4, 3.4, 3, 'reactor'],
  [18, 11.5, 1.2, 1.2, 1.2, 'crate'], [24, 19, 1.2, 1.2, 1.2, 'crate'],
  [23, 14, 1.2, 1.2, 1.2, 'crate'], [18, 19.5, 3, 1, 1.1, 'sandbag'],
  [27, 16, 2.4, 6, 2.6, 'container'],
  [3, -11, 1, 6, 3, 'wall'], [3, 11, 1, 6, 3, 'wall'],
  [-30, -3.5, 1.2, 1.2, 1.2, 'crate'], [-30, 3.5, 1.2, 1.2, 1.2, 'crate'],
  [30, -3.5, 1.2, 1.2, 1.2, 'crate'], [30, 3.5, 1.2, 1.2, 1.2, 'crate'],
  [-18, -3, 1, 1, 1.1, 'barrel'], [18, 3, 1, 1, 1.1, 'barrel'],
  // Spawn walls: each spawn exits around a wall, so no sightline runs from mid
  // straight into a spawn. Routes detour around them via the waypoint graph.
  [-21, 0, 1, 12, 3.5, 'wall'], [21, 0, 1, 12, 3.5, 'wall'],
];

// Ray vs one axis-aligned box. Returns entry distance, or Infinity on a miss.
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  if (Math.abs(dx) < 1e-9) {
    if (ox < x0 || ox > x1) return Infinity;
  } else {
    let t1 = (x0 - ox) / dx;
    let t2 = (x1 - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < y0 || oy > y1) return Infinity;
  } else {
    let t1 = (y0 - oy) / dy;
    let t2 = (y1 - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < z0 || oz > z1) return Infinity;
  } else {
    let t1 = (z0 - oz) / dz;
    let t2 = (z1 - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function rayWalls(colliders, origin, dir, maxDist) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const d = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      c.x0, c.y0, c.z0, c.x1, c.y1, c.z1, best);
    if (d < best) best = d;
  }
  return best;
}

export function overlapsBox(colliders, x, z, radius, y0, y1) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (c.y1 <= y0 + 0.01 || c.y0 >= y1) continue;
    if (x + radius > c.x0 && x - radius < c.x1 && z + radius > c.z0 && z - radius < c.z1) return c;
  }
  return null;
}

// moveBody: axis-separated AABB collision for a feet-anchored body. Horizontal axes
// slide along walls; vertical resolves landing on tops and head bumps. Returns whether
// the body stands on something. Mutates pos and vel in place.
export function moveBody(pos, vel, dt, colliders, radius, height) {
  let onGround = false;
  const nx = pos.x + vel.x * dt;
  if (!overlapsBox(colliders, nx, pos.z, radius, pos.y, pos.y + height)) {
    pos.x = nx;
  } else {
    vel.x = 0;
  }
  const nz = pos.z + vel.z * dt;
  if (!overlapsBox(colliders, pos.x, nz, radius, pos.y, pos.y + height)) {
    pos.z = nz;
  } else {
    vel.z = 0;
  }
  pos.x = Math.max(BOUNDS.minX + radius, Math.min(BOUNDS.maxX - radius, pos.x));
  pos.z = Math.max(BOUNDS.minZ + radius, Math.min(BOUNDS.maxZ - radius, pos.z));
  const prevY = pos.y;
  pos.y += vel.y * dt;
  if (pos.y <= 0) {
    pos.y = 0;
    vel.y = 0;
    onGround = true;
  } else if (vel.y <= 0) {
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (prevY >= c.y1 - 0.01 && pos.y <= c.y1
        && pos.x + radius > c.x0 && pos.x - radius < c.x1
        && pos.z + radius > c.z0 && pos.z - radius < c.z1) {
        pos.y = c.y1;
        vel.y = 0;
        onGround = true;
        break;
      }
    }
  } else {
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (prevY + height <= c.y0 + 0.01 && pos.y + height >= c.y0
        && pos.x + radius > c.x0 && pos.x - radius < c.x1
        && pos.z + radius > c.z0 && pos.z - radius < c.z1) {
        pos.y = c.y0 - height;
        vel.y = 0;
        break;
      }
    }
  }
  return onGround;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// BFS route over the waypoint graph. Returns node indices from start to goal.
export function routeBetween(from, to, out) {
  out.length = 0;
  if (from === to) { out.push(to); return out; }
  const prev = new Int16Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === to) break;
    const links = WAYPOINTS[cur].links;
    for (let i = 0; i < links.length; i += 1) {
      const next = links[i];
      if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
    }
  }
  if (prev[to] === -1) { out.push(to); return out; }
  const path = [];
  let cur = to;
  while (cur !== from) { path.push(cur); cur = prev[cur]; }
  path.push(from);
  path.reverse();
  for (let i = 0; i < path.length; i += 1) out.push(path[i]);
  return out;
}

function sandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9a066';
  ctx.fillRect(0, 0, 256, 256);
  let s = 1234567;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 2600; i += 1) {
    const g = 150 + Math.floor(rnd() * 70);
    ctx.fillStyle = `rgb(${g},${Math.floor(g * 0.72)},${Math.floor(g * 0.45)})`;
    ctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 2, 2);
  }
  for (let i = 0; i < 26; i += 1) {
    ctx.strokeStyle = 'rgba(120,84,46,0.25)';
    ctx.beginPath();
    const y = rnd() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + rnd() * 8 - 4, 170, y + rnd() * 8 - 4, 256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ribTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, 0, 3, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 3, 0, 2, 64);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillRect(0, 60, 128, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// buildMap: turns PROPS into meshes plus the collider list the simulation uses.
// Returns { colliders } — waypoints, sites and spawns are exported constants.
export function buildMap(scene) {
  const colliders = [];
  const mats = new Map();
  const rib = ribTexture();
  function mat(color, tex) {
    const key = `${color}|${tex ? 'rib' : 'flat'}`;
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshLambertMaterial({ color, map: tex ?? null }));
    }
    return mats.get(key);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  const group = new THREE.Group();
  group.name = 'helios-yard';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.maxX - BOUNDS.minX + 2, BOUNDS.maxZ - BOUNDS.minZ + 2),
    new THREE.MeshLambertMaterial({ map: sandTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Darker packed-earth strips along the three lanes, so the map reads at a glance.
  const laneMat = new THREE.MeshLambertMaterial({ color: 0xc08d54 });
  const laneGeo = new THREE.PlaneGeometry(1, 1);
  for (const [x, z, w, d] of [[-2, -18, 58, 5], [-2, 0, 58, 5], [-2, 18, 58, 5], [8, -9, 5, 13], [8, 9, 5, 13]]) {
    const strip = new THREE.Mesh(laneGeo, laneMat);
    strip.rotation.x = -Math.PI / 2;
    strip.scale.set(w, d, 1);
    strip.position.set(x, 0.01, z);
    strip.receiveShadow = true;
    group.add(strip);
  }

  const containerColors = [0x3f7d78, 0xa85f38, 0x7d8a94, 0x94683f];
  let containerIndex = 0;
  for (const [x, z, w, d, h, kind] of PROPS) {
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: h });
    if (kind === 'reactor') {
      const base = new THREE.Mesh(cylGeo, mat(CONCRETE));
      base.scale.set(2.1, 0.4, 2.1);
      base.position.set(x, 0.2, z);
      const drum = new THREE.Mesh(cylGeo, mat(METAL));
      drum.scale.set(1.7, 2.6, 1.7);
      drum.position.set(x, 1.5, z);
      const core = new THREE.Mesh(
        cylGeo,
        new THREE.MeshBasicMaterial({ color: TEAL }),
      );
      core.scale.set(0.7, 3.1, 0.7);
      core.position.set(x, 1.6, z);
      const cap = new THREE.Mesh(cylGeo, mat(TERRA));
      cap.scale.set(1.9, 0.25, 1.9);
      cap.position.set(x, 2.9, z);
      for (const m of [base, drum, core, cap]) { m.castShadow = true; group.add(m); }
      const glow = new THREE.PointLight(TEAL, 12, 13, 1.8);
      glow.position.set(x, 2.6, z);
      group.add(glow);
      continue;
    }
    if (kind === 'panel') {
      const frame = new THREE.Mesh(boxGeo, mat(METAL));
      frame.scale.set(w, 0.5, d);
      frame.position.set(x, 0.25, z);
      const face = new THREE.Mesh(boxGeo, mat(PANEL));
      face.scale.set(w, 0.12, d + 0.7);
      face.position.set(x, 1.55, z);
      face.rotation.x = -0.5;
      const post = new THREE.Mesh(boxGeo, mat(METAL));
      post.scale.set(0.3, 1.6, 0.3);
      post.position.set(x, 0.8, z);
      for (const m of [frame, face, post]) { m.castShadow = true; group.add(m); }
      continue;
    }
    if (kind === 'barrel') {
      const barrel = new THREE.Mesh(cylGeo, mat(TERRA));
      barrel.scale.set(0.5, h, 0.5);
      barrel.position.set(x, h / 2, z);
      barrel.castShadow = true;
      group.add(barrel);
      continue;
    }
    const color = kind === 'container'
      ? containerColors[containerIndex++ % containerColors.length]
      : kind === 'crate' ? 0x9a7a4e : kind === 'sandbag' ? 0xbfa06a : CONCRETE;
    const mesh = new THREE.Mesh(boxGeo, mat(color, kind === 'container' ? rib : null));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (kind === 'crate') {
      const lid = new THREE.Mesh(boxGeo, mat(0x7d6240));
      lid.scale.set(w + 0.06, 0.1, d + 0.06);
      lid.position.set(x, h + 0.03, z);
      group.add(lid);
    }
  }

  // Site markings: a painted letter and ring on the ground at each reactor site.
  for (const [key, site] of Object.entries(SITES)) {
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({
        map: letterTexture(key, key === 'A' ? '#2fa8a0' : '#e0703c'),
        transparent: true, opacity: 0.85, depthWrite: false,
      }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.03, site.z + 3.4);
    group.add(letter);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({
        color: key === 'A' ? TEAL : TERRA, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
  }

  // Dunes and a low sun outside the walls: the yard sits in open desert.
  const duneMat = new THREE.MeshLambertMaterial({ color: SAND_DARK });
  const duneGeo = new THREE.ConeGeometry(1, 1, 7);
  for (const [x, z, r, h] of [[-46, -30, 18, 7], [10, -42, 24, 9], [48, -18, 16, 6], [-48, 26, 20, 8], [44, 34, 22, 9], [-8, 44, 26, 8]]) {
    const dune = new THREE.Mesh(duneGeo, duneMat);
    dune.scale.set(r, h, r * 0.7);
    dune.position.set(x, h / 2 - 0.5, z);
    group.add(dune);
  }
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  sun.position.set(-60, 26, -70);
  sun.lookAt(0, 4, 0);
  group.add(sun);

  // Floodlight poles at each site: thin masts with a lit head.
  for (const site of Object.values(SITES)) {
    const mast = new THREE.Mesh(boxGeo, mat(METAL));
    mast.scale.set(0.25, 6, 0.25);
    mast.position.set(site.x + 5, 3, site.z - 4);
    const head = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
    head.scale.set(0.9, 0.3, 0.5);
    head.position.set(site.x + 5, 6.1, site.z - 4);
    group.add(mast, head);
  }

  scene.add(group);
  return { colliders };
}
