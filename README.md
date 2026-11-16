# SANDLINE PROTOCOL — a tactical FPS in three.js

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/HisyamMahfuDz/sandline-protocol-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/HisyamMahfuDz/sandline-protocol-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A complete round-based tactical shooter set in **Helios Yard**, a dusk desert solar
farm. Vanguard (attackers) plant the surge charge at reactor site A or B; Wardens
(defenders) hold the sites, retake, and defuse. First to 5 rounds takes the match
(max 9), with a halftime side swap so you play both sides.

4v4: you plus three ally bots against four enemy bots. Every bot sees, hears,
routes, holds, pushes, plants, and defuses through the same simulation you play in.

## How to run

```sh
node serve.ts --port 8080
```

Then open http://localhost:8080/ in a desktop browser with WebGL2. No build step,
no network requests at runtime — three.js 0.187.0 is vendored under
`game/vendor/three/`, and all art is procedural geometry plus canvas textures.
Audio is synthesized with WebAudio; there are no audio files.

## Controls

| Key | Action |
| --- | ------ |
| Mouse | Look · Click: fire |
| W A S D | Move |
| R | Reload |
| Space | Jump |
| Ctrl / C | Crouch |
| Shift | Walk quietly (slower, quieter) |
| B | Buy menu (during the buy phase) |
| 1 / 2 | Primary / sidearm |
| Q / 3–5 | Cycle / select grenade |
| G | Throw grenade |
| E | Plant / defuse (hold, standing still) |
| Tab | Scoreboard |
| Esc | Pause |

## What is in the game

- **Gunplay.** Hitscan combat with body-part hitboxes (head ×4, torso ×1, limbs
  ×0.75), armour that absorbs damage, recoil and bloom, spread that punishes
  firing on the move, crouch accuracy, acceleration/friction movement, AABB
  collision, and weapons that run dry and reload.
- **Tactics.** Plant (3.5 s) / defuse (5 s) channels, a 35 s fuse, money and a
  buy menu (3 primaries, kevlar, HE / smoke / flash grenades), bots that follow
  waypoint routes, hold posts, react to sight and sound, retake planted sites,
  and defuse.
- **Map.** Helios Yard is an original three-lane map: north lane, mid cross, and
  south lane, with containers, solar panels, crates, sandbags, and spawn walls
  that block mid-to-spawn sightlines. The palette is sand, terracotta, and teal
  under a deep dusk sky.
- **Match flow.** Buy phase → live round → plant/defuse/elimination/timeout →
  economy payout → next round → halftime swap → match end with a stats summary
  and restart. HUD shows health, kevlar, ammo, money, round timer, score,
  charge status, kill feed, and banners.

## Layout

```
main.ts            entrypoint: copies game/ + screenshots/ to the output dir
                   and writes dossier.json via vendor/makefun-threejs.ts
serve.ts           static dev server (node serve.ts --port 8080)
game/index.html    import map, HUD DOM, styles
game/src/          one-job ES modules, no build step
  state.js         single store: combatants, bomb, rounds, economy, RNG
  simulation.js    fixed-step round machine, channels, economy, win checks
  player.js        movement, collision, look, recoil
  bots.js          perception (sight/sound/smoke), FSM, BFS routes, bursts
  weapons.js       weapon defs, ray-vs-body-part hits, damage, spread
  grenades.js      bouncing projectiles; HE damage, smoke vision block, flash
  map.js           props/colliders, raycasts, waypoint graph, textures
  render.js        view-only sync: rigs, viewmodel, tracers, effects
  hud.js           cached DOM updates, buy menu, scoreboard, banners
  input.js         pointer lock, keys, look draining
  audio.js         synthesized SFX
  shots.js         deterministic staged frames for screenshots (?shot=…)
game/vendor/three/ three.js 0.187.0, byte-for-byte from the kit
screenshots/       4 captured frames (1280×720 JPEG)
```

## Architecture notes

- The simulation runs at a fixed 60 Hz, decoupled from rendering; the renderer
  only syncs the view from state and never mutates it.
- One firing path (`shootBullet`) serves the player and every bot, so the rules
  the player feels are the rules the bots play by.
- Hot loops reuse module-level scratch vectors and pooled meshes; there is no
  per-frame allocation in the sim or the view sync.
- Bots pathfind with BFS over a 27-node waypoint graph whose every link was
  verified walkable against the colliders; perception checks field of view,
  line of sight, smoke, distance, and noise.

## Screenshots

The four frames in `screenshots/` were captured from the running game in headless
Chrome (SwiftShader, WebGL2) via deterministic staged scenes:

- `1-combat.jpg` — mid firefight: tracer, hitmarker, enemy bot, full HUD
- `2-objective.jpg` — planting the surge charge at site A (ring + letter + bar)
- `3-buy.jpg` — buy menu during the buy phase
- `4-match-end.jpg` — match won, final score and stats, play again

The same scenes can be reproduced live with `?shot=play|objective|buy|end&seed=7`
(see `shots.json` and `game/src/shots.js`).

## License

MIT — see LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0a6j83jv&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
