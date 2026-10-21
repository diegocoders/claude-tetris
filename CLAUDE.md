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

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`), a shared overlay `#overlay` for both PAUSE and GAME OVER states (contains `#gameover-records`, hidden during pause), and the `#start-screen` overlay.
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
| Speed | `dropInterval = max(100, 1000 − (level−1) × 90)` ms; level = `floor(lines/10) + 1` |
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| State flags | `paused`, `gameOver`, `animId` (RAF handle) |
| Combo | `combo` / `maxCombo` — consecutive locks clearing ≥1 line (`clearLines()` returns `cleared`); reset in `init()` |
| Records | `localStorage['tetris-records']` = `{ top: [{name, score, lines, level, date}] (max 5, desc), bestCombo, maxLines }`; `loadRecords()` (tolerates corrupt JSON), `saveRecords()`, `qualifiesForTop()` (score > 0), `renderRecordsList()` (textContent only, `.record-highlight` for the new entry) |
| Game-over records | `showGameOverRecords()` (called from `endGame()`; updates `bestCombo`/`maxLines` always, shows `#name-form` if score qualifies), `saveEntry()` (guarded by `entrySaved`) |
| Start screen | `#start-screen` overlay shown on load (`renderStartScreen()`); `startGame()` via `#play-btn` or Enter; `#reset-records-btn` clears records after `confirm()` |

### Game flow

Page load → `renderStartScreen()`; the game starts only from `startGame()`. Keydown is ignored while `#player-name` is focused.

`init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()`.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array indexed 1–7), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
