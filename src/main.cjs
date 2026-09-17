const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { species, createProgression } = require('./progression.cjs');

// Packaged apps use Electron's writable per-user data directory.
if (!app.isPackaged) app.setPath('userData', process.env.TOKEMON_TEST_DATA_DIR || path.join(__dirname, '..', '.local'));
const progress = createProgression(app.getPath('userData'));
// Keep startup read failures observable through IPC without an unhandled rejection.
progress.get().catch(error => console.error('Progress load:', error.message));
let pet;
let drag;
let dragTimer;
const assetPromises = new Map();
let muted = false;
const SIZE = 192;
const HEIGHT = 460;

async function cachedAsset(filename, url, mime) {
  const directory = path.join(app.getPath('userData'), 'assets');
  const file = path.join(directory, filename);
  let bytes;
  const bundled = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'assets', filename);
  try { bytes = await fs.readFile(bundled).catch(() => fs.readFile(file)); } catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Asset download: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, bytes);
  }
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function getAssets(kind = 'pikachu') {
  if (!Object.hasOwn(species, kind)) throw new Error('Unknown species');
  const id = species[kind].id;
  // Fixed PokeAPI assets: no credentials, log access, or arbitrary remote URLs.
  if (!assetPromises.has(kind)) assetPromises.set(kind, Promise.all([
    cachedAsset(`${kind}.gif`, `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`, 'image/gif'),
    cachedAsset(`${kind}.ogg`, `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`, 'audio/ogg'),
  ]).then(([sprite, cry]) => ({ sprite, cry })).catch(error => {
    assetPromises.delete(kind);
    console.error(error.message);
    throw new Error('이미지·소리를 받지 못했어요. 인터넷 연결 후 다시 눌러 주세요.');
  }));
  return assetPromises.get(kind);
}

function homePosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - SIZE - 48, y: area.y + area.height - HEIGHT - 32 };
}

function constrain(position) {
  const area = screen.getDisplayMatching({ ...position, width: SIZE, height: HEIGHT }).workArea;
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + area.width - SIZE))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + area.height - HEIGHT))),
  };
}

async function savePosition() {
  if (!pet || pet.isDestroyed()) return;
  const [x, y] = pet.getPosition();
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(path.join(app.getPath('userData'), 'position.json'), JSON.stringify({ x, y }));
  } catch (error) { console.error('Position save:', error.message); }
}

function updateDrag() {
  if (!drag || pet.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const dx = cursor.x - drag.cursor.x;
  const dy = cursor.y - drag.cursor.y;
  if (Math.hypot(dx, dy) >= 5) drag.moved = true;
  if (drag.moved) pet.setPosition(drag.x + dx, drag.y + dy);
}

function stopDrag() {
  if (!drag) return false;
  updateDrag();
  const moved = drag.moved;
  drag = undefined;
  clearInterval(dragTimer);
  const [x, y] = pet.getPosition();
  const position = constrain({ x, y });
  pet.setPosition(position.x, position.y);
  void savePosition();
  return moved;
}

function trusted(event) { return pet && event.sender === pet.webContents && event.senderFrame === pet.webContents.mainFrame; }

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { pet?.show(); });
  app.whenReady().then(async () => {
    let position = homePosition();
    try {
      const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'position.json'), 'utf8'));
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = constrain({ x: saved.x, y: saved.y });
    } catch { /* First launch. */ }
    pet = new BrowserWindow({
      ...position, width: SIZE, height: HEIGHT, title: 'Tokemon · 피카츄',
      transparent: true, frame: false, resizable: false, maximizable: false,
      alwaysOnTop: true, skipTaskbar: false, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    pet.setMenu(null);
    pet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pet.webContents.on('will-navigate', event => event.preventDefault());
    pet.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ipcMain.handle('assets', (event, kind) => { if (trusted(event)) return getAssets(kind); });
    ipcMain.handle('progress', event => { if (trusted(event)) return progress.get(); });
    ipcMain.handle('preview-tokens', (event, tokens) => { if (trusted(event)) return progress.add(tokens); });
    ipcMain.handle('reset-progress', event => { if (trusted(event)) return progress.reset(); });
    ipcMain.on('drag-start', event => {
      if (!trusted(event) || drag) return;
      const [x, y] = pet.getPosition();
      drag = { x, y, cursor: screen.getCursorScreenPoint(), moved: false };
      dragTimer = setInterval(updateDrag, 16);
    });
    ipcMain.handle('drag-end', event => trusted(event) ? stopDrag() : true);
    ipcMain.on('drag-cancel', event => { if (trusted(event)) stopDrag(); });
    ipcMain.on('menu', event => {
      if (!trusted(event)) return;
      stopDrag();
      Menu.buildFromTemplate([
        { label: 'Tokemon · 드래그로 이동 / 클릭하면 울음소리', enabled: false },
        { type: 'separator' },
        { label: '음소거', type: 'checkbox', checked: muted, click: item => { muted = item.checked; pet.webContents.send('mute', muted); } },
        { label: '위치 초기화', click: () => { const p = homePosition(); pet.setPosition(p.x, p.y); void savePosition(); } },
        { label: '성장 초기화 · Lv.1 피카츄로', click: () => pet.webContents.send('reset-progress-request') },
        { label: '종료', click: () => app.quit() },
      ]).popup({ window: pet });
    });
    pet.on('blur', () => stopDrag());
    pet.on('closed', () => clearInterval(dragTimer));
    await pet.loadFile(path.join(__dirname, 'index.html'));
    pet.showInactive();
  }).catch(error => { console.error(error); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
