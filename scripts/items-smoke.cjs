// Uses the real main process, IPC, renderer and persistence in an isolated profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..', '.local');
fs.mkdirSync(root, { recursive: true });
process.env.TOKEMON_TEST_DATA_DIR = fs.mkdtempSync(path.join(root, 'items-smoke-'));
process.env.TOKEMON_TEST_CLAUDE_LOGS = path.join(process.env.TOKEMON_TEST_DATA_DIR, 'claude');
process.env.TOKEMON_TEST_CODEX_LOGS = path.join(process.env.TOKEMON_TEST_DATA_DIR, 'codex');
const { usage } = require('../src/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Items smoke timed out'); app.exit(1); }, 100000);
app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 150; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && await window.webContents.executeJavaScript('typeof ready !== "undefined" && ready').catch(() => false)) break;
    await delay(100);
  }
  assert.ok(window, 'App window exists');
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const wait = async code => {
    for (let i = 0; i < 400; i++) { if (await evaluate(code)) return; await delay(100); }
    throw new Error(`Timeout: ${code}`);
  };
  const shot = async name => {
    await delay(120);
    fs.writeFileSync(path.join(root, `items-${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  await wait('ready');
  // Silence audio without shortening the actual item evolution sequence.
  window.webContents.send('mute', true);
  await evaluate('document.querySelector("#open-shop").click()');
  assert.equal(await evaluate('commerce.open'), true);
  assert.equal(await evaluate('document.querySelectorAll(".item-card").length'), 6);
  assert.equal(await evaluate('(async () => { const images = [...document.querySelectorAll(".item-symbol img")]; await Promise.all(images.map(image => image.decode())); return images.length === 6 && images.every(image => image.naturalWidth > 0 && image.src.startsWith("data:image/png;base64,")); })()'), true, 'All six bundled item images decode');
  assert.equal(await evaluate('[...document.querySelectorAll(".item-action")].every(b => b.disabled)'), true);
  await evaluate('document.querySelector("#demo-wallet-tools").open = true; document.querySelector("#demo-balance").value = "1000000"; document.querySelector("#demo-wallet").requestSubmit()');
  await wait('!addingTokens && growth.balance === 1000000');
  assert.equal(await evaluate('growth.totalExp'), 0, 'Demo wallet does not grant EXP');
  await shot('shop');
  await evaluate('document.querySelector("[data-item=thunder-stone]").click()');
  await wait('!addingTokens && growth.inventory["thunder-stone"] === 1');
  assert.equal(await evaluate('growth.balance'), 900000);
  await evaluate('document.querySelector("[data-item=moon-stone]").click()');
  await wait('!addingTokens && growth.inventory["moon-stone"] === 1');
  await evaluate('document.querySelector("#bag-tab").click()');
  assert.equal(await evaluate('document.querySelector("[data-item=moon-stone]").disabled'), true);
  assert.equal(await evaluate('document.querySelector("[data-item=thunder-stone]").disabled'), false);
  await shot('bag');
  assert.equal(await evaluate('commerce.scrollWidth <= commerce.clientWidth'), true, 'No horizontal clipping at 192px');
  await evaluate('document.querySelector("[data-item=thunder-stone]").click()');
  await wait('evolving');
  assert.equal(await evaluate('commerce.open'), false, 'Close the bag to reveal evolution');
  await wait('!addingTokens && displayedSpecies === "raichu"');
  assert.equal(await evaluate('growth.inventory["thunder-stone"]'), 0);
  assert.equal(await evaluate('growth.level'), 1);
  await shot('evolved');
  await window.webContents.reload();
  await delay(300);
  await wait('typeof ready !== "undefined" && ready');
  assert.equal(await evaluate('displayedSpecies'), 'raichu', 'Reload retains item evolution');
  assert.equal(await evaluate('growth.balance'), 800000);
  assert.equal(await evaluate('growth.inventory["moon-stone"]'), 1);
  await usage.select('codex');
  await wait('usage.source === "codex"');
  await evaluate('openCommerce("shop")');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#demo-wallet-tools")).display'), 'none');
  assert.equal(await evaluate('window.pet.setDemoBalance(1).then(() => false, () => true)'), true, 'Main process rejects demo edits in linked mode');
  assert.equal((await evaluate('window.pet.progress()')).balance, 800000);
  await usage.select('demo');
  await wait('usage.source === "demo"');
  await evaluate('document.querySelector("#close-commerce").click()');
  await evaluate('selectSpecies("eevee")');
  await evaluate('openCommerce("shop"); document.querySelector("[data-item=water-stone]").click()');
  await wait('!addingTokens && growth.inventory["water-stone"] === 1');
  await evaluate('openCommerce("bag")');
  assert.equal(await evaluate('document.querySelector("[data-item=water-stone]").textContent'), '샤미드(으)로 진화');
  await evaluate('document.querySelector("[data-item=water-stone]").click()');
  await wait('!addingTokens && displayedSpecies === "vaporeon"');
  await evaluate('selectSpecies("pikachu")');
  assert.equal(await evaluate('displayedSpecies'), 'raichu');
  console.log('PASS: real IPC, demo wallet and linked rejection, shop/bag controls, item consumption, Pikachu and Eevee evolution sequences, reload and selection persistence, narrow layout');
}).then(() => { clearTimeout(timeout); app.exit(0); }).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
