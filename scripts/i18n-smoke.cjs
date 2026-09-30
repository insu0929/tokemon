// Exercise native menu selection, IPC, renderer updates, and saved preferences.
const { app, BrowserWindow, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..', '.local');
fs.mkdirSync(root, { recursive: true });
process.env.TOKEMON_TEST_DATA_DIR = fs.mkdtempSync(path.join(root, 'i18n-smoke-'));
fs.writeFileSync(path.join(process.env.TOKEMON_TEST_DATA_DIR, 'settings.json'), JSON.stringify({ language: 'ja' }));
process.env.TOKEMON_TEST_CLAUDE_LOGS = path.join(process.env.TOKEMON_TEST_DATA_DIR, 'claude');
process.env.TOKEMON_TEST_CODEX_LOGS = path.join(process.env.TOKEMON_TEST_DATA_DIR, 'codex');
let menu;
const buildMenu = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = template => {
  // Electron also calls this for its default application menu at startup.
  // Always return a real Menu; intercept only Tokemon's context menu popup.
  const nativeMenu = buildMenu(template);
  if (template.some(item => item.label?.includes('/ Language'))) {
    menu = template;
    nativeMenu.popup = () => {};
  }
  return nativeMenu;
};
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
require('../src/main.cjs');
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', event => console.log('Renderer:', event.message));
  contents.on('render-process-gone', (_event, details) => console.error('Renderer exited:', details));
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => app.exit(1), 60000);
app.whenReady().then(async () => {
  let window;
  const wait = async fn => {
    for (let i = 0; i < 200; i++) { if (await fn().catch(() => false)) return; await delay(100); }
    throw new Error('Timed out');
  };
  await wait(async () => {
    window = BrowserWindow.getAllWindows()[0];
    return window && window.webContents.executeJavaScript('typeof ready !== "undefined" && ready');
  });
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  assert.equal(await evaluate('I18n.language'), 'ja', 'Startup restores the saved language');
  const before = await evaluate('JSON.stringify(growth)');
  for (const [code, label, name, bag] of [
    ['en', 'English', 'Pikachu', 'Bag'], ['ja', '日本語', 'ピカチュウ', 'バッグ'],
    ['zh-CN', '简体中文', '皮卡丘', '背包'], ['ko', '한국어', '피카츄', '가방'],
  ]) {
    menu = null;
    await evaluate('window.pet.menu()');
    await wait(async () => !!menu);
    const languages = menu.find(item => item.label?.includes('/ Language')).submenu;
    languages.find(item => item.label === label).click();
    await wait(async () => await evaluate('document.documentElement.lang') === code);
    assert.equal(await evaluate('document.querySelector("#species-label").textContent'), name);
    assert.equal(await evaluate('document.querySelector("#open-bag").textContent'), bag);
    assert.equal(await evaluate('JSON.stringify(growth)'), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.TOKEMON_TEST_DATA_DIR, 'settings.json'))).language, code);
    await evaluate('openCommerce("shop")');
    assert.equal(await evaluate('document.querySelectorAll(".item-card").length'), Object.keys(require('../src/items.cjs').items).length);
    if (code !== 'ko') assert.equal(await evaluate('/[가-힣]/.test(document.body.innerText)'), false);
    await delay(150);
    fs.writeFileSync(path.join(root, `i18n-${code}-shop.png`), (await window.webContents.capturePage()).toPNG());
    await evaluate('commerce.close()');
    window.webContents.reload();
    await delay(200);
    await wait(async () => await evaluate('typeof ready !== "undefined" && ready'));
    assert.equal(await evaluate('I18n.language'), code);
  }
  // Keep the Poké Ball resting while changing the UI language.
  await evaluate('slider.value = "0"; applyRemaining(0)');
  await wait(async () => await evaluate('recall.phase === "resting"'));
  await evaluate('applyLanguage("en")');
  assert.equal(await evaluate('recall.phase'), 'resting');
  assert.equal(await evaluate('document.querySelector("#state-label").textContent'), 'Resting in ball');
  await evaluate('slider.value = "100"; applyRemaining(100)');
  await wait(async () => await evaluate('!recall.busy'));
  window.webContents.send('mute', true);
  await evaluate('(async () => { growth = await window.pet.setDemoBalance(100000); growth = await window.pet.buyItem("thunder-stone"); openCommerce("bag"); void commerceAction("thunder-stone"); })()');
  await wait(async () => await evaluate('evolving'));
  await evaluate('applyLanguage("zh-CN")');
  assert.equal(await evaluate('evolving'), true, 'Language switch does not cancel evolution');
  await wait(async () => await evaluate('!addingTokens && displayedSpecies === "raichu"'));
  assert.equal(await evaluate('document.querySelector("#species-label").textContent'), '雷丘');
  assert.equal(await evaluate('growth.inventory["thunder-stone"]'), 0);
  console.log('PASS: four native language menu choices, translated shops and names, saved startup/reload language, unchanged progress, rest and evolution');
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
