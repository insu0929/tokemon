// Integration check using a real Electron window and synthetic pointer events.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
require('node:fs').mkdirSync(path.join(__dirname, '..', '.local'), { recursive: true });
process.env.TOKEMON_TEST_DATA_DIR = require('node:fs').mkdtempSync(path.join(__dirname, '..', '.local', 'smoke-'));
require('../src/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Smoke test timed out'); app.exit(1); }, 60000);

app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 200; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) {
      const loaded = await window.webContents.executeJavaScript('typeof ready !== "undefined" && ready').catch(() => false);
      if (loaded) break;
    }
    await delay(200);
  }
  assert.ok(window, 'Window exists');
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  assert.equal(await evaluate('ready && player.frames.length > 1 && sprite.width > 0'), true, 'Animated sprite decoded');
  assert.equal(await evaluate('typeof require'), 'undefined', 'Renderer has no Node access');
  assert.equal(window.isAlwaysOnTop(), true);
  await evaluate('speak()');
  assert.equal(await evaluate('!cry.paused'), true, 'Click action plays audio');
  await evaluate('cry.pause(); cry.currentTime = 0');

  const originalCursor = screen.getCursorScreenPoint;
  const originalPosition = window.getPosition();
  const area = screen.getPrimaryDisplay().workArea;
  window.setPosition(area.x + 180, area.y + 160);
  const [startX, startY] = window.getPosition();
  let cursor = { x: startX + 90, y: startY + 90 };
  screen.getCursorScreenPoint = () => cursor;
  // Pointer capture requires a native pointer; stub only capture in this test.
  await evaluate('button.setPointerCapture = () => {}; button.hasPointerCapture = () => false; void 0;');
  await evaluate('button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }))');
  await delay(100);
  cursor = { x: cursor.x - 100, y: cursor.y - 80 };
  await delay(100);
  await evaluate('button.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 1 }))');
  await delay(200);
  assert.deepEqual(window.getPosition(), [startX - 100, startY - 80], 'Drag moves native window');
  assert.equal(await evaluate('cry.paused'), true, 'Drag does not play cry');

  await evaluate('button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 2 }))');
  await delay(50);
  await evaluate('button.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 2 }))');
  await delay(80);
  assert.equal(await evaluate('!cry.paused'), true, 'Pointer click plays cry');
  window.webContents.send('mute', true);
  await delay(50);
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true, 'Mute prevents sound');
  screen.getCursorScreenPoint = originalCursor;
  for (const [value, expected] of [[100, 'lively'], [70, 'lively'], [69, 'normal'], [50, 'normal'], [49, 'weak'], [10, 'weak'], [9, 'fainted'], [0, 'fainted']]) {
    await evaluate(`slider.value = ${value}; slider.dispatchEvent(new Event('input'));`);
    assert.equal(await evaluate('state'), expected, `State at ${value}%`);
    assert.equal(await evaluate('document.querySelector(".health-track").getAttribute("aria-valuenow")'), String(value));
  }
  const frozenFrame = await evaluate('player.index');
  await delay(400);
  assert.equal(await evaluate('player.index'), frozenFrame, 'Fainted frame stays frozen');
  assert.equal(await evaluate('player.timer === undefined'), true, 'Fainted playback timer stopped');
  window.webContents.send('mute', false);
  await delay(50);
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true, 'Fainted click stays silent');
  await evaluate('applyRemaining(30, false); speak()');
  assert.equal(await evaluate('cry.playbackRate < 1 && !cry.preservesPitch && !cry.paused'), true, 'Weak cry is slowed and pitched down');
  await evaluate('cry.pause(); applyRemaining(0, false); speak(true)');
  assert.equal(await evaluate('cry.playbackRate === .65 && !cry.paused'), true, 'Fainting transition plays modified cry');
  window.webContents.send('mute', true);
  await delay(50);
  for (const [value, label] of [[100, 'lively'], [60, 'normal'], [30, 'weak'], [5, 'fainted']]) {
    await evaluate(`applyRemaining(${value}, false); message(profiles[state].text);`);
    await delay(650);
    const frame = await window.webContents.capturePage();
    await fs.writeFile(path.join(app.getPath('userData'), `${label}.png`), frame.toPNG());
  }
  await evaluate('applyRemaining(100, false)');
  assert.equal(await evaluate('player.timer !== undefined'), true, 'Recovery resumes animation');
  await evaluate('message("피카!")');
  await delay(400);
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(path.join(app.getPath('userData'), 'smoke.png'), screenshot.toPNG());
  assert.equal(await evaluate('growth.level'), 1);
  await evaluate('addTokens(9999)');
  assert.equal(await evaluate('growth.exp'), 99);
  await evaluate('addTokens(1)');
  assert.equal(await evaluate('growth.level'), 2, 'Exact level boundary');
  await evaluate('addTokens(29900)');
  assert.equal(await evaluate('displayedSpecies'), 'pikachu', 'Before evolution threshold');
  await evaluate('void addTokens(100)');
  await delay(100);
  assert.equal(await evaluate('evolving'), true, 'Evolution sequence starts');
  await evaluate('addTokens(1000)');
  await delay(2400);
  assert.equal(await evaluate('growth.totalTokens'), 40000, 'Duplicate action ignored during evolution');
  assert.equal(await evaluate('displayedSpecies'), 'raichu');
  assert.equal(await evaluate('document.querySelector("#species-label").textContent'), 'RAICHU');
  assert.equal(await evaluate('growth.level'), 5);
  assert.equal(await evaluate('player.frames.length > 1'), true, 'Raichu animation decoded');
  await evaluate('addTokens(12345)');
  assert.equal(await evaluate('growth.level'), 6);
  assert.equal(await evaluate('growth.exp'), 23, 'Overflow carried into next level');
  await window.webContents.reload();
  for (let i = 0; i < 100; i++) {
    if (await evaluate('typeof ready !== "undefined" && ready').catch(() => false)) break;
    await delay(100);
  }
  assert.equal(await evaluate('displayedSpecies'), 'raichu', 'Evolution restored after reload');
  assert.equal(await evaluate('growth.totalTokens'), 52345, 'Progress persists');
  await evaluate('speak()');
  assert.equal(await evaluate('!cry.paused'), true, 'Raichu cry plays');
  await evaluate('cry.pause()');
  await evaluate('applyRemaining(100, false); message("라이츄로 진화했어요!");');
  await delay(200);
  await fs.writeFile(path.join(__dirname, '..', '.local', 'evolution.png'), (await window.webContents.capturePage()).toPNG());
  const layout = await evaluate('JSON.stringify({ bottom: document.querySelector(".preview").getBoundingClientRect().bottom, height: innerHeight, top: document.querySelector("#status").getBoundingClientRect().top })');
  const bounds = JSON.parse(layout);
  assert.ok(bounds.bottom <= bounds.height && bounds.top >= 0, 'HUD and bubble fit in window');
  console.log('PASS: drag/click, audio, HP states, EXP boundaries, evolution, overflow, persistence, layout');
  await fs.writeFile(path.join(app.getPath('userData'), 'position.json'), JSON.stringify({ x: originalPosition[0], y: originalPosition[1] }));
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
