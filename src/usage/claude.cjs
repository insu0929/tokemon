const os = require('node:os');
const path = require('node:path');

// Claude Code transcripts. The format is internal to Claude Code and may change between
// versions, so everything here is defensive: an unreadable line is skipped, never fatal.
function roots(env = process.env, home = os.homedir()) {
  const list = [];
  for (const directory of (env.CLAUDE_CONFIG_DIR || '').split(',')) {
    if (directory.trim()) list.push(path.join(directory.trim(), 'projects'));
  }
  list.push(path.join(home, '.config', 'claude', 'projects'), path.join(home, '.claude', 'projects'));
  return list;
}

const count = value => (Number.isSafeInteger(value) && value > 0 ? value : 0);

// One assistant message is logged several times while it streams, with growing output
// counts, and subagent messages live in separate files. The caller merges entries that
// share an id by taking the largest value of each kind.
function createParser() {
  return line => {
    if (!line.includes('"usage"')) return undefined;
    let entry;
    try { entry = JSON.parse(line.toString('utf8')); } catch { return undefined; }
    const message = entry?.type === 'assistant' ? entry.message : undefined;
    const usage = message?.usage;
    const time = Date.parse(entry?.timestamp);
    if (!usage || typeof message.id !== 'string' || !Number.isFinite(time)) return undefined;
    return { usage: { id: message.id, time, tokens: {
      input: count(usage.input_tokens),
      cacheWrite: count(usage.cache_creation_input_tokens),
      cacheRead: count(usage.cache_read_input_tokens),
      output: count(usage.output_tokens),
    } } };
  };
}

module.exports = { name: 'Claude', roots, createParser };
