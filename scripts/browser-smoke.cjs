// Renderer-only fallback when Windows blocks the development Electron binary.
// Uses the real HTML/CSS/JS and assets; only Electron's preload bridge is mocked.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const catalog = require('../src/species.json');
const { snapshot } = require('../src/progression.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, server;
const pending = new Map();
let sequence = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 25000);
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  const data = path.join(root, '.local');
  await fs.mkdir(data, { recursive: true });
  const profile = await fs.mkdtemp(path.join(data, 'browser-recall-'));
  const asset = async (file, mime) => `data:${mime};base64,${(await fs.readFile(path.join(root, 'assets', file))).toString('base64')}`;
  const species = {};
  for (const [name, entry] of Object.entries(catalog)) species[name] = { ...entry, evolutionName: catalog[entry.evolution?.species]?.name, sprite: await asset(`${name}.gif`, 'image/gif'), cry: await asset(`${name}.ogg`, 'audio/ogg') };
  const audio = { level: await asset('audio/level-up.wav', 'audio/wav'), fanfare: await asset('audio/level-up-fanfare.mp3', 'audio/mpeg'), evolution: await asset('audio/evolution.mp3', 'audio/mpeg'), success: await asset('audio/evolution-success.mp3', 'audio/mpeg') };
  const bridge = `
    window.testGeneration = Math.random();
    const testSpecies = ${JSON.stringify(species)}, testAudio = ${JSON.stringify(audio)};
    window.testStatus = JSON.parse(localStorage.getItem('limits') || 'null') || { source: 'demo', hp: null, weekly: null };
    const species = ${JSON.stringify(catalog)}, EXP_PER_LEVEL = 100, POINTS_PER_EXP = 1000000;
    const snapshot = ${snapshot.toString()};
    let selected = localStorage.getItem('selected') || 'pikachu', revision = 0;
    const records = JSON.parse(localStorage.getItem('records') || '{}');
    const snap = () => snapshot(records[selected] || 0, selected, ++revision);
    const save = () => { localStorage.setItem('selected', selected); localStorage.setItem('records', JSON.stringify(records)); };
    window.testGrowth = snap();
    const events = {};
    window.pet = {
      assets: async name => testSpecies[name || 'pikachu'], growthAudio: async () => testAudio,
      progress: async () => testGrowth, usageStatus: async () => testStatus,
      selectSpecies: async kind => { selected = kind; save(); return testGrowth = snap(); },
      onSelectSpecies: fn => events.select = fn,
      addPreviewTokens: async tokens => { records[selected] = (records[selected] || 0) + tokens * 10000; save(); return testGrowth = snap(); },
      resetProgress: async () => { records[selected] = 0; save(); return testGrowth = snap(); },
      onUsageStatus: fn => events.status = fn, onUsageGrowth: fn => events.growth = fn,
      onResetProgress: fn => events.reset = fn, onMute: fn => events.mute = fn,
      startDrag() {}, endDrag: async () => false, cancelDrag() {}, menu() {},
    };
    window.testSend = next => { testStatus = next; localStorage.setItem('limits', JSON.stringify(next)); events.status(next); };
    window.testMute = () => events.mute(true);
  `;
  server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/bridge.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bridge); }
      const filename = req.url === '/' ? 'index.html' : req.url.slice(1);
      if (!/^[\w.-]+$/.test(filename)) { res.writeHead(404); return res.end(); }
      let content = await fs.readFile(path.join(root, 'src', filename));
      if (filename === 'index.html') content = content.toString().replace('<script src="animation.js">', '<script src="bridge.js"></script><script src="animation.js">');
      res.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executable = process.env.TOKEMON_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let launchError;
  browser.on('error', error => { launchError = error; });
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    await delay(100);
  }
  assert.ok(port, 'Chrome started');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 192, height: 460, deviceScaleFactor: 2, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 250; i++) { if (await evaluate(expression).catch(() => false)) return; await delay(80); }
    assert.fail(`Timeout: ${expression}`);
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(data, `recall-${name}.png`), Buffer.from(result.data, 'base64'));
  };
  const status = (used, remaining = 70) => ({ source: 'codex', name: 'Codex', tokensPerExp: 10000, observedAt: Date.now(), hp: { remaining, exhausted: remaining === 0, estimated: false, windowMinutes: 300, resetsAt: Date.now() + 3600000 }, weekly: { remaining: 100 - used, exhausted: used === 100, resetsAt: Date.now() + 86400000, windowMinutes: 10080 } });
  const update = next => evaluate(`testSend(${JSON.stringify(next)})`);
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await wait('typeof ready !== "undefined" && ready');
  await evaluate('testMute()');
  // Decode every bundled animation and cry; exercise the actual selection UI handler.
  await evaluate(`window.catalogSheet = document.createElement('canvas'); catalogSheet.width = 1200; catalogSheet.height = 16 * 180;
    window.sheetContext = catalogSheet.getContext('2d'); sheetContext.fillStyle = '#edf2e6'; sheetContext.fillRect(0, 0, 1200, 2880);
    window.audioProbe = new AudioContext();`);
  let index = 0;
  for (const [kind, entry] of Object.entries(catalog)) {
    const result = await evaluate(`(async () => {
      await selectSpecies(${JSON.stringify(kind)});
      const bytes = Uint8Array.from(atob(cry.src.split(',')[1]), c => c.charCodeAt(0));
      const audio = await audioProbe.decodeAudioData(bytes.buffer);
      const x = ${index % 10} * 120, y = ${Math.floor(index / 10)} * 180;
      sheetContext.fillStyle = '#263023'; sheetContext.font = '12px sans-serif'; sheetContext.fillText(${JSON.stringify(`#${entry.id} ${entry.name}`)}, x + 4, y + 15);
      const scale = 100 / Math.max(sprite.width, sprite.height);
      sheetContext.imageSmoothingEnabled = false;
      sheetContext.drawImage(sprite, x + (120 - sprite.width * scale) / 2, y + 130 - sprite.height * scale, sprite.width * scale, sprite.height * scale);
      return { kind: displayedSpecies, ready, frames: player.frames.length, audio: audio.duration, anchor: sprite.style.translate, label: document.querySelector('#species-label').textContent };
    })()`);
    assert.equal(result.kind, kind);
    assert.equal(result.ready, true);
    assert.ok(result.frames > 0 && result.audio > 0 && !result.anchor.includes('NaN'), kind);
    assert.equal(result.label, entry.label);
    index++;
  }
  await fs.writeFile(path.join(data, 'kanto-catalog.png'), Buffer.from((await evaluate('catalogSheet.toDataURL()')).split(',')[1], 'base64'));
  await evaluate("audioProbe.close(); selectSpecies('pikachu')");
  console.log('PASS: all 151 selections, GIF decoding, cry decoding, names and sprite anchors');
  await update(status(75));
  await delay(500);
  await shot('dual-hp');
  assert.equal(await evaluate('document.querySelector(".weekly-fill").style.width'), '25%');
  await update(status(100));
  await delay(700); await shot('light');
  assert.equal(await evaluate('recall.phase === "recalling" && player.timer === undefined'), true);
  await delay(530); await shot('absorb');
  await wait('recall.phase === "resting"');
  await shot('resting');
  assert.equal(await evaluate('document.querySelector(".health-fill").style.width'), '70%');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#recall-pose")).visibility'), 'hidden');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ball-shell")).animationName'), 'ball-rest');
  const wiggles = new Set();
  for (let i = 0; i < 12; i++) { wiggles.add(await evaluate('getComputedStyle(document.querySelector(".ball-shell")).transform')); await delay(300); }
  assert.ok(wiggles.size > 3, 'Resting ball actually moves gently');
  assert.equal(await evaluate('document.querySelector(".preview").getBoundingClientRect().bottom <= innerHeight && document.querySelector("#status").getBoundingClientRect().top >= 0'), true);
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true);
  const previousDocument = await evaluate('testGeneration');
  await send('Page.reload');
  await wait(`typeof testGeneration !== "undefined" && testGeneration !== ${previousDocument} && typeof ready !== "undefined" && ready && recall.phase === "resting"`);
  await evaluate('testMute()');
  await update(status(0));
  await delay(650); await shot('release');
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('player.timer !== undefined'), true);

  // Exercise a real evolution; weekly exhaustion must wait for its full sequence.
  await update({ source: 'demo', hp: null, weekly: null });
  await evaluate("selectSpecies('caterpie')");
  await evaluate('void addTokens(60000)');
  await wait('evolving');
  await update(status(100));
  assert.equal(await evaluate('recall.phase'), 'out');
  await wait('document.body.classList.contains("evolution-alternating")');
  assert.equal(await evaluate('recall.phase'), 'out');
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('displayedSpecies'), 'metapod');
  await shot('raichu-rest');
  await update(status(0));
  await wait('recall.phase === "out"');
  await evaluate("selectSpecies('pikachu')");
  assert.equal(await evaluate('growth.totalExp'), 0, 'Switching restores separate progress');
  await evaluate("selectSpecies('caterpie')");
  assert.equal(await evaluate('displayedSpecies'), 'metapod');
  await shot('raichu-return');
  await update(status(100));
  await delay(250);
  await update({ source: 'claude', name: 'Claude', tokensPerExp: 10000, hp: null, weekly: null });
  await delay(2600);
  assert.equal(await evaluate('recall.phase'), 'out');
  assert.equal(await evaluate('document.querySelector(".weekly-track").hidden'), true);
  await update(status(100));
  await delay(150);
  await update(status(10));
  await wait('recall.phase === "out"');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await update(status(100));
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ball-shell")).animationName'), 'none');
  await update(status(0));
  await wait('recall.phase === "out"');
  assert.deepEqual(errors, [], 'No renderer exceptions');
  await update({ source: 'demo', hp: null, weekly: null });
  await evaluate("selectSpecies('caterpie')");
  await evaluate('resetGrowth()');
  await evaluate(`window.evolvedForms = []; const originalSetSpecies = setSpecies;
    setSpecies = async kind => { await originalSetSpecies(kind); evolvedForms.push(kind); };
    void addTokens(90000);`);
  await wait("evolvedForms.includes('metapod')");
  await wait("evolvedForms.includes('butterfree')");
  await wait('!addingTokens');
  assert.deepEqual(await evaluate('evolvedForms'), ['metapod', 'butterfree'], 'Large EXP gain animates both evolution stages in order');
  assert.equal(await evaluate('growth.level'), 10);
  assert.deepEqual(errors, [], 'No renderer exceptions after chained evolution');
  console.log('PASS: real renderer dual HP, recall/light/absorb, slow wiggle, silent rest, reload, release, full evolution sequencing, both species, source cancellation, mid-animation updates, reduced motion and layout');
  console.log(`Screenshots: ${data}/recall-*.png`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser?.kill();
  server?.close();
});
