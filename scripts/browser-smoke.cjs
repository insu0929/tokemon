// Renderer-only fallback when Windows blocks the development Electron binary.
// Uses the real HTML/CSS/JS and assets; only Electron's preload bridge is mocked.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
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
  for (const name of ['pikachu', 'raichu']) species[name] = { sprite: await asset(`${name}.gif`, 'image/gif'), cry: await asset(`${name}.ogg`, 'audio/ogg') };
  const audio = { level: await asset('audio/level-up.wav', 'audio/wav'), fanfare: await asset('audio/level-up-fanfare.mp3', 'audio/mpeg'), evolution: await asset('audio/evolution.mp3', 'audio/mpeg'), success: await asset('audio/evolution-success.mp3', 'audio/mpeg') };
  const bridge = `
    window.testGeneration = Math.random();
    const testSpecies = ${JSON.stringify(species)}, testAudio = ${JSON.stringify(audio)};
    window.testStatus = JSON.parse(localStorage.getItem('limits') || 'null') || { source: 'demo', hp: null, weekly: null };
    const snap = totalExp => ({ totalExp, level: 1 + Math.floor(totalExp / 100), exp: totalExp % 100, nextExp: 100, evolutionLevel: 5, species: totalExp >= 400 ? 'raichu' : 'pikachu' });
    window.testGrowth = snap(Number(localStorage.getItem('exp') || 0));
    const events = {};
    window.pet = {
      assets: async name => testSpecies[name || 'pikachu'], growthAudio: async () => testAudio,
      progress: async () => testGrowth, usageStatus: async () => testStatus,
      addPreviewTokens: async tokens => { testGrowth = snap(testGrowth.totalExp + tokens / 100); localStorage.setItem('exp', testGrowth.totalExp); return testGrowth; },
      resetProgress: async () => { localStorage.setItem('exp', 0); return testGrowth = snap(0); },
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
  await evaluate('void addTokens(40000)');
  await wait('evolving');
  await update(status(100));
  assert.equal(await evaluate('recall.phase'), 'out');
  await wait('document.body.classList.contains("evolution-alternating")');
  assert.equal(await evaluate('recall.phase'), 'out');
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('displayedSpecies'), 'raichu');
  await shot('raichu-rest');
  await update(status(0));
  await wait('recall.phase === "out"');
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
  console.log('PASS: real renderer dual HP, recall/light/absorb, slow wiggle, silent rest, reload, release, full evolution sequencing, both species, source cancellation, mid-animation updates, reduced motion and layout');
  console.log(`Screenshots: ${data}/recall-*.png`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser?.kill();
  server?.close();
});
