// Run against the actual portable artifact, with network disabled in Chromium.
const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { version } = require('../package.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = 19387;
const child = spawn(path.resolve(`dist/Tokemon-${version}-win-x64.exe`), [
  `--remote-debugging-port=${port}`, '--host-resolver-rules=MAP * ~NOTFOUND',
], { stdio: 'ignore' });
let socket;
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 10000);
    pending.set(key, message => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
(async () => {
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = pages.find(item => item.type === 'page' && item.url.startsWith('file:'));
      if (page) break;
    } catch {}
    await delay(500);
  }
  assert.ok(page, 'Packaged app exposes its window');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const result = await send('Runtime.evaluate', {
    expression: `(async () => {
      const assets = await window.pet.assets();
      for (let i = 0; i < 100 && !ready; i++) await new Promise(r => setTimeout(r, 100));
      if (!ready || player.frames.length < 2) throw new Error('Sprite not decoded');
      if (!assets.sprite.startsWith('data:image/gif') || !assets.cry.startsWith('data:audio/ogg')) throw new Error('Bundled assets missing');
      applyRemaining(0, false);
      if (state !== 'fainted' || player.timer !== undefined) throw new Error('Faint failed');
      applyRemaining(100, false);
      if (state !== 'lively' || player.timer === undefined) throw new Error('Recovery failed');
      const raichu = await window.pet.assets('raichu');
      const probe = new SpritePlayer(document.createElement('canvas'));
      await probe.load(raichu.sprite);
      if (probe.frames.length < 2 || !raichu.cry.startsWith('data:audio/ogg')) throw new Error('Raichu assets missing');
      probe.dispose();
      if (!growth || growth.level < 1 || !document.querySelector('.exp-track')) throw new Error('EXP HUD missing');
      return 'PASS: portable exe, both species offline, EXP HUD, animation, faint and recovery';
    })()`, awaitPromise: true, returnByValue: true,
  });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  console.log(result.result.value);
  await send('Runtime.evaluate', { expression: 'setTimeout(() => window.close(), 100); true' });
  socket.close();
})().catch(error => {
  console.error(error);
  socket?.close();
  if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exitCode = 1;
});
