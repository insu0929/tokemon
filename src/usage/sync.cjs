const fs = require('node:fs/promises');
const path = require('node:path');
const tuning = require('../tuning.cjs');
const { listLogs, statLog, LogTail } = require('./files.cjs');

const LIMITS_TAIL_BYTES = 512 * 1024;
const LIMITS_FILES = 3;

// Turns new log entries of the selected source into EXP. Only numeric usage fields are
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
    const result = { source, name: providers[source]?.name, tokensPerExp: tuning.tokensPerExp[source], hp: null };
    if (!limits) return result;
    const window = limits.windows.find(item => item.windowMinutes === tuning.hpWindowMinutes) || limits.windows[0];
    // The log only changes while the tool is used, so an elapsed window means a full bar.
    const expired = window.resetsAt !== undefined && window.resetsAt <= now();
    const used = expired ? 0 : Math.max(0, Math.min(100, window.usedPercent));
    result.hp = { remaining: Math.round(100 - used), resetsAt: expired ? undefined : window.resetsAt, windowMinutes: window.windowMinutes };
    return result;
  }

  function publish() {
    const next = status();
    const text = JSON.stringify(next);
    if (text !== lastStatus) { lastStatus = text; onStatus(next); }
  }

  function accept(parsed) {
    if (parsed?.limits && (!limits || parsed.limits.time >= limits.time)) limits = parsed.limits;
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
          if (parsed?.limits && (!limits || parsed.limits.time >= limits.time)) limits = parsed.limits;
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
    // Linking always starts from now: usage from while another source was selected never counts.
    select: source => enqueue(async () => {
      if (source !== 'demo' && !Object.hasOwn(providers, source)) throw new Error('Unknown usage source');
      if (source === state.source) return status();
      forget();
      state.source = source;
      if (source !== 'demo') {
        state.linked[source] = { since: now(), horizon: now(), seen: {} };
        await primeLimits(providers[source]);
      }
      await save();
      publish();
      return status();
    }),
    start() {
      void enqueue(async () => {
        if (providers[state.source]) await primeLimits(providers[state.source]);
      }).then(() => this.poll()).catch(error => console.error('Usage sync:', error.message));
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
