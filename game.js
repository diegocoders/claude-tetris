'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const SKINS = {
  retro: {
    label: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#9e9e9e'],
    grid: null, // usa --grid-line del tema
    draw: drawRetroBlock,
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff8c00', '#c0c0ff'],
    grid: '#16162a',
    draw: drawNeonBlock,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6f0', '#fdf1a7', '#d9c2f0', '#bfe8c4', '#f7b8c0', '#bcd4f6', '#fdd2a8', '#d6d6dc'],
    grid: null,
    draw: drawPastelBlock,
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#e40058', '#0078f8', '#f87858', '#a4a4a4'],
    grid: null,
    draw: drawPixelBlock,
  },
};

let skin = SKINS.retro;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10;

const RECORDS_KEY = 'tetris-records';
const PLAYER_KEY = 'tetris-player';
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, started = false, pendingRecord = false;
let records = loadRecords();
// Al reanudar se ignoran las teclas que siguen pulsadas (autorepeat) hasta soltarlas
let resumeGuard = false;
let startLevel = Number(localStorage.getItem('tetris-start-level')) || 1;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = speedFor(level);
    updateHUD();
  }
}

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, skin.colors[colorIndex], size);
  context.restore();
}

function drawRetroBlock(context, px, py, color, size) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, color, size) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0;
  context.fillStyle = color;
  context.globalAlpha *= 0.25;
  context.fillRect(px + 4, py + 4, size - 8, size - 8);
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastelBlock(context, px, py, color, size) {
  const r = size * 0.22;
  roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.7)';
  context.lineWidth = 1.5;
  context.stroke();
  // brillo suave
  roundRectPath(context, px + 5, py + 5, size - 10, (size - 10) / 2.5, r / 2);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
}

// Patrón 8×8: 1 = luz, 2 = sombra, 0 = color base
const PIXEL_PATTERN = [
  [1,1,1,1,1,1,1,2],
  [1,0,0,0,0,0,0,2],
  [1,0,1,0,0,0,0,2],
  [1,0,0,0,0,0,0,2],
  [1,0,0,0,0,2,0,2],
  [1,0,0,0,2,0,0,2],
  [1,0,0,0,0,0,0,2],
  [2,2,2,2,2,2,2,2],
];

function drawPixelBlock(context, px, py, color, size) {
  const n = PIXEL_PATTERN.length;
  const p = size / n;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = PIXEL_PATTERN[r][c];
      if (!v) continue;
      context.fillStyle = v === 1 ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
      context.fillRect(Math.floor(px + c * p), Math.floor(py + r * p), Math.ceil(p), Math.ceil(p));
    }
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Records ----
function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.scores)) {
      return { scores: data.scores, bestCombo: data.bestCombo || 0, maxLines: data.maxLines || 0 };
    }
  } catch {}
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch {}
}

function rankFor(s) {
  const idx = records.scores.findIndex(r => s > r.score);
  return idx === -1 ? records.scores.length : idx;
}

function qualifies(s) {
  return s > 0 && rankFor(s) < MAX_RECORDS;
}

function addScore(name) {
  const idx = rankFor(score);
  records.scores.splice(idx, 0, { name, score, lines });
  records.scores.length = Math.min(records.scores.length, MAX_RECORDS);
  saveRecords();
  return idx;
}

function renderRecords(highlight = -1, newCombo = false, newLines = false) {
  recordsList.replaceChildren();
  if (!records.scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    recordsList.append(li);
  }
  records.scores.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.classList.add('highlight');
    for (const [cls, text] of [['rec-rank', `${i + 1}.`], ['rec-name', r.name], ['rec-score', r.score.toLocaleString()], ['rec-lines', `${r.lines}L`]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.append(span);
    }
    recordsList.append(li);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.classList.toggle('is-new', newCombo);
  maxLinesEl.classList.toggle('is-new', newLines);
}

function savePendingRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const name = nameInput.value.trim() || 'Jugador';
  try { localStorage.setItem(PLAYER_KEY, name); } catch {}
  const idx = addScore(name);
  nameForm.classList.add('hidden');
  newRecordEl.textContent = `¡Récord guardado! Puesto #${idx + 1}`;
  renderRecords(idx, bestComboEl.classList.contains('is-new'), maxLinesEl.classList.contains('is-new'));
}

function showOverlay(mode, title, text) {
  overlay.dataset.mode = mode;
  overlayTitle.textContent = title;
  overlayScore.textContent = text;
  recordsEl.classList.remove('hidden');
  newRecordEl.classList.add('hidden');
  nameForm.classList.add('hidden');
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  overlay.classList.remove('hidden');
}

function showStartScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  renderRecords();
  showOverlay('start', 'TETRIS', 'Pulsa Jugar o Enter para empezar');
  restartBtn.focus();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  const newCombo = maxCombo > records.bestCombo;
  const newLines = lines > records.maxLines;
  if (newCombo) records.bestCombo = maxCombo;
  if (newLines) records.maxLines = lines;
  if (newCombo || newLines) saveRecords();

  showOverlay('gameover', 'GAME OVER',
    `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo: ${maxCombo}`);
  renderRecords(-1, newCombo, newLines);

  pendingRecord = qualifies(score);
  if (pendingRecord) {
    newRecordEl.textContent = `¡Nuevo récord! Puesto #${rankFor(score) + 1}`;
    newRecordEl.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    try { nameInput.value = localStorage.getItem(PLAYER_KEY) || ''; } catch { nameInput.value = ''; }
    nameInput.focus();
    nameInput.select();
  }
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  setControlsVisible(false);
  startLevelSelect.value = startLevel;
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  document.activeElement?.blur();
}

function resume() {
  if (!paused) return;
  closePauseMenu();
  paused = false;
  resumeGuard = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function restartFromMenu() {
  closePauseMenu();
  resumeGuard = true;
  init();
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

function setStartLevel(value) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, value));
  localStorage.setItem('tetris-start-level', startLevel);
}

// Navegación del menú con ↑/↓ entre sus elementos enfocables
function moveMenuFocus(dir) {
  const items = [...pauseMenu.querySelectorAll('button, select')];
  const idx = items.indexOf(document.activeElement);
  const nextIdx = (idx + dir + items.length) % items.length;
  items[idx === -1 ? 0 : nextIdx].focus();
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  savePendingRecord();
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return;
  if (!started) {
    if (e.code === 'Enter') { e.preventDefault(); init(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (paused) resume(); else openPauseMenu();
    return;
  }
  // Con el menú abierto el juego no recibe inputs; solo se navega el menú
  if (paused) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      if (document.activeElement === startLevelSelect) return;
      e.preventDefault();
      moveMenuFocus(e.code === 'ArrowDown' ? 1 : -1);
    }
    return;
  }
  if (gameOver) return;
  if (resumeGuard) {
    if (e.repeat) { e.preventDefault(); return; }
    resumeGuard = false;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', () => { resumeGuard = false; });

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resume);
pauseRestartBtn.addEventListener('click', restartFromMenu);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});

for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
  startLevelSelect.add(new Option(lvl, lvl));
}
setStartLevel(startLevel);
startLevelSelect.addEventListener('change', () => setStartLevel(Number(startLevelSelect.value)));

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingRecord();
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  try { localStorage.removeItem(RECORDS_KEY); } catch {}
  if (pendingRecord) newRecordEl.textContent = '¡Nuevo récord! Puesto #1';
  renderRecords();
});

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

const skinSelect = document.getElementById('skin-select');

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.body.dataset.skin = name;
  skinSelect.value = name;
  if (current) draw();
  else if (!started) { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGrid(); }
  if (next) drawNext();
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem('tetris-skin', skinSelect.value);
  skinSelect.blur(); // devuelve las flechas al juego
});

applySkin(localStorage.getItem('tetris-skin'));

showStartScreen();
