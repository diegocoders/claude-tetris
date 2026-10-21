# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly or serve with any static server:

```bash
open index.html                  # macOS direct open
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`), a shared overlay `#overlay` for START and GAME OVER states (mode in `data-mode`), which also hosts the records table (`#records`) and the name form (`#name-form`), and a `#pause-menu` overlay (Reanudar / Reiniciar / Ver controles / Nivel inicial).
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~305 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–7` = piece color index |
| Piece representation | `{ type, shape, x, y }` where `shape` is a 2-D matrix |
| Rotation | `rotateCW(shape)` — transpose + reverse; `tryRotate()` applies wall kicks `[0,±1,±2]` |
| Collision | `collide(shape, ox, oy)` — checks bounds and board occupancy |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` tracks elapsed ms against `dropInterval` |
| Line clear | `clearLines()` — iterates board bottom-up, splices full rows, prepends empty row |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `dropInterval = max(100, 1000 − (level−1) × 90)` ms; level = `max(startLevel, floor(lines/10) + 1)` |
| Skins | `SKINS` — `{ retro, neon, pastel, pixel }`, each `{ colors, grid, draw }`; `drawBlock()` delegates to `skin.draw`; `applySkin(name)` redraws, persisted in `localStorage['tetris-skin']` |
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| State flags | `paused`, `gameOver`, `started`, `pendingRecord`, `animId` (RAF handle) |
| Records | `records` persisted in `localStorage['tetris-records']` as `{ scores: [{name, score, lines}], bestCombo, maxLines }`; top `MAX_RECORDS` (5). `combo` = consecutive line-clearing locks |
| Pause menu | `openPauseMenu()` / `resume()` / `restartFromMenu()`; `P`/`Esc` toggle, ↑/↓ navigate. Game input is blocked while open; `resumeGuard` drops key auto-repeat after resuming until keyup |
| Start level | `startLevel` (1–`MAX_START_LEVEL`, persisted in `localStorage` `tetris-start-level`), applied on next `init()`; level = `max(startLevel, floor(lines/10)+1)` |

### Game flow

`showStartScreen()` → (Jugar/Enter) `init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()`, which updates best combo/max lines and, if the score enters the top 5, asks for a name (saved on submit or on restart).

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `SKINS[*].colors` (arrays indexed 1–8), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
