const fs = require('node:fs/promises');
const path = require('node:path');
const tuning = require('../tuning.cjs');
const { listLogs, statLog, LogTail } = require('./files.cjs');

const LIMITS_TAIL_BYTES = 512 * 1024;
const LIMITS_FILES = 3;

// Imports available history on first link, then credits only new usage. Only numeric usage fields are
// read, nothing leaves the machine, and a broken log can never stop the app.
function createUsageSync({ directory, providers, progress, now = Date.now, onGrowth = () => {}, onStatus = () => {} }) {
  const filename = path.join(directory, 'usage.json');
  let state = { version: 1, source: 'demo', linked: {} };
  let queue = Promise.resolve();
  let timer;
  let busy = false;
  let lastStatus;
  // Rebuilt from the logs on every launch; only what was credited is persisted.
  let tails = new Map();
  let merged = new Map();
  let pending = new Set();
  let hot = [];
  let walkedAt = -Infinity;
  let limits;

  const loaded = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (saved.version === 1 && (saved.source === 'demo' || Object.hasOwn(providers, saved.source))) state = saved;
    } catch { /* First launch or unreadable settings: start unlinked. */ }
    if (state.source !== 'demo' && !state.linked[state.source]) state.source = 'demo';
    // Hydrate before the renderer's first status request so a resting pet starts
    // inside its ball instead of replaying recall after every application launch.
    if (providers[state.source]) await primeLimits(providers[state.source]);
  })();

  function enqueue(task) {
    const operation = queue.then(async () => { await loaded; return task(); });
    queue = operation.catch(() => {});
    return operation;
  }

  async function save() {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(`${filename}.tmp`, JSON.stringify(state));
    await fs.rename(`${filename}.tmp`, filename);
  }

  function forget() {
    tails = new Map();
    merged = new Map();
    pending = new Set();
    hot = [];
    walkedAt = -Infinity;
    limits = undefined;
  }

  function status() {
    const source = state.source;
    const result = { source, name: providers[source]?.name, tokensPerExp: tuning.tokensPerExp[source], hp: null, weekly: null };
    if (!limits) return result;
    const snapshot = window => {
      if (!window) return null;
      const expired = window.resetsAt !== undefined && window.resetsAt <= now();
      const used = expired ? 0 : Math.max(0, Math.min(100, window.usedPercent));
      // Any positive remainder stays visible; rounding must not imply exhaustion.
      return { remaining: Math.ceil(100 - used), resetsAt: expired ? undefined : window.resetsAt,
        windowMinutes: window.windowMinutes, exhausted: used >= 100, estimated: expired };
    };
    // A weekly-only snapshot must never be presented as five-hour HP.
    result.hp = snapshot(limits.windows.find(item => item.windowMinutes === tuning.hpWindowMinutes));
    result.weekly = snapshot(limits.windows.find(item => item.windowMinutes === 7 * 24 * 60));
    result.observedAt = limits.time;
    return result;
  }

  function publish() {
    const next = status();
    const text = JSON.stringify(next);
    if (text !== lastStatus) { lastStatus = text; onStatus(next); }
  }

  function acceptLimits(next) {
    if (!next) return;
    const windows = new Map((limits?.windows || []).map(window => [window.windowMinutes, window]));
    for (const window of next.windows) {
      const previous = windows.get(window.windowMinutes);
      if (!previous || next.time >= previous.observedAt) windows.set(window.windowMinutes, { ...window, observedAt: next.time });
    }
    // A short-window-only update must not erase a known exhausted weekly window.
    limits = { time: Math.max(limits?.time || 0, next.time), windows: [...windows.values()] };
  }

  function accept(parsed) {
    acceptLimits(parsed?.limits);
    const usage = parsed?.usage;
    if (!usage) return;
    const known = merged.get(usage.id);
    if (!known) merged.set(usage.id, usage);
    else {
      known.time = Math.min(known.time, usage.time);
      for (const kind of Object.keys(usage.tokens)) known.tokens[kind] = Math.max(known.tokens[kind] || 0, usage.tokens[kind]);
    }
    pending.add(usage.id);
  }

  // Rate limits are wanted right after linking, before any new usage has been logged.
  async function primeLimits(provider) {
    if (!provider.hasLimits) return;
    const recent = (await listLogs(provider.roots())).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, LIMITS_FILES);
    for (const log of recent) {
      const parse = provider.createParser(log.file);
      try {
        await new LogTail(log.file, Math.max(0, log.size - LIMITS_TAIL_BYTES)).read(log.size, line => {
          const parsed = parse(line);
          acceptLimits(parsed?.limits);
        });
      } catch { /* An unreadable log only means no HP yet. */ }
    }
  }

  async function poll() {
    const source = state.source;
    const provider = providers[source];
    if (!provider) { publish(); return; }
    const link = state.linked[source];
    if (now() - walkedAt >= tuning.walkMs) {
      hot = await listLogs(provider.roots(), link.horizon - 60000);
      walkedAt = now();
    } else hot = (await Promise.all(hot.map(log => statLog(log.file)))).filter(Boolean);
    for (const log of hot) {
      let tail = tails.get(log.key);
      if (!tail) {
        tail = new LogTail(log.file);
        tail.parse = provider.createParser(log.file);
        tails.set(log.key, tail);
      }
      try { await tail.read(log.size, line => accept(tail.parse(line))); } catch { /* Locked or removed: retry next time. */ }
    }

    let tokens = 0;
    const credit = new Map();
    // Anything older than the horizon was credited earlier and is no longer remembered,
    // so it must not be counted again when a long-running log is read from the start.
    const from = Math.max(link.since, link.horizon);
    for (const id of pending) {
      const usage = merged.get(id);
      if (!usage || usage.time < from) continue;
      const amount = tuning.countable[source].reduce((sum, kind) => sum + (usage.tokens[kind] || 0), 0);
      const credited = link.seen[id]?.[1] ?? 0;
      if (amount > credited) { tokens += amount - credited; credit.set(id, [usage.time, amount]); }
    }
    if (tokens > 0) {
      // Entries stay pending if saving fails, so nothing is lost or counted twice.
      const growth = await progress.add(tokens, source);
      for (const [id, value] of credit) link.seen[id] = value;
      pending.clear();
      prune(link);
      await save();
      onGrowth({ growth, tokens, source, name: provider.name });
    } else {
      pending.clear();
      if (prune(link)) await save();
    }
    publish();
  }

  function prune(link) {
    const horizon = now() - tuning.horizonHours * 3600000;
    if (horizon <= link.horizon) return false;
    link.horizon = horizon;
    let changed = false;
    for (const id of Object.keys(link.seen)) if (link.seen[id][0] < horizon) { delete link.seen[id]; changed = true; }
    for (const [id, usage] of merged) if (usage.time < horizon) merged.delete(id);
    const active = new Set(hot.map(log => log.key));
    for (const key of tails.keys()) if (!active.has(key)) tails.delete(key);
    return changed;
  }

  return {
    status: () => enqueue(() => status()),
    poll: () => enqueue(poll),
    // A first link starts at time zero so the whole history is imported once. After that each
    // provider keeps its ledger across source switches, or a relink would credit history again.
    select: source => enqueue(async () => {
      if (source !== 'demo' && !Object.hasOwn(providers, source)) throw new Error('Unknown usage source');
      if (source === state.source) return status();
      forget();
      state.source = source;
      if (source !== 'demo') {
        state.linked[source] ??= { since: 0, horizon: 0, seen: {} };
        await primeLimits(providers[source]);
      }
      await save();
      publish();
      if (source !== 'demo') {
        await poll();
        // The import listed every log; list again next poll so only recent ones stay watched.
        walkedAt = -Infinity;
      }
      return status();
    }),
    start() {
      void this.poll().catch(error => console.error('Usage sync:', error.message));
      timer = setInterval(() => {
        // A slow first read of large logs must not pile up further polls behind it.
        if (busy) return;
        busy = true;
        this.poll().catch(error => console.error('Usage sync:', error.message)).finally(() => { busy = false; });
      }, tuning.pollMs);
    },
    stop() { clearInterval(timer); },
  };
}

module.exports = { createUsageSync };
