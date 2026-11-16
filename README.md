# IRONLINE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/yesyesyesokoko/ironline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/yesyesyesokoko/ironline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

IRONLINE is a tactical breach FPS in three.js: a night raid on a hostile compound. Clear each sector, hack the relay, reach extraction — three rounds, no backup. Built by an AI agent for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## Play it

```sh
python3 -m http.server --directory game 8080
```

Then open http://localhost:8080. Click DEPLOY, then click the game to lock the mouse.

## How it plays

- **Move** WASD, **aim** mouse (pointer lock), **fire** click, **aim down sights** right-click, **reload** R, **sprint** Shift, **jump** Space, **crouch** C, **hack / interact** E, **pause** P, **mute** M.
- **Rifle**: 30-round magazine, recoil, muzzle flash, tracers, headshots deal double damage. Ammo drops from fallen hostiles.
- **Three hostile types**: Raiders charge with SMGs, Deadeyes hold long sightlines, Boomers lob grenades. They take cover behind crates and barriers, peek, fire bursts, and reposition to flank.
- **Objectives**: each round — eliminate all hostiles, hold E at the relay to hack it, then reach the extraction pad. Clear all three rounds to win.
- **HUD**: compass with objective and threat markers, health, ammo, score, hit markers, damage direction indicator, kill feed. Best score is saved locally.

## Tech

- three.js (vendored, WebGL2), zero network requests, all art procedural (geometry, materials, lighting — no external assets), all sound synthesized with WebAudio.
- `main.ts` (Node 22) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` via the vendored make.fun library.

Referral: `wep134xq` — https://make.fun/r/wep134xq
