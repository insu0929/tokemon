const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_DEPTH = 6;
const CHUNK = 4 * 1024 * 1024;

// *.jsonl files under the roots that changed at or after `since` (ms). Missing roots are fine.
async function listLogs(roots, since = 0) {
  const found = new Map();
  async function walk(directory, depth) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (depth < MAX_DEPTH) await walk(file, depth + 1); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const stat = await statLog(file);
      if (stat && stat.mtimeMs >= since) found.set(stat.key, stat);
    }
  }
  for (const root of roots) await walk(root, 0);
  return [...found.values()];
}

async function statLog(file) {
  try {
    const stat = await fs.stat(file);
    // Overlapping roots may reach one file through differently-cased Windows paths.
    return { file, key: file.toLowerCase(), size: stat.size, mtimeMs: stat.mtimeMs };
  } catch { return undefined; }
}

// Reads only the lines appended since the previous call. Logs are append-only JSONL.
class LogTail {
  constructor(file, offset = 0) {
    this.file = file;
    this.offset = offset;
  }

  // `onLine` gets a Buffer that is only valid during the call.
  async read(size, onLine) {
    if (size < this.offset) this.offset = 0; // truncated or replaced: start over
    if (size === this.offset) return;
    const handle = await fs.open(this.file, 'r');
    try {
      const chunk = Buffer.allocUnsafe(Math.min(CHUNK, size - this.offset));
      let carry = Buffer.alloc(0);
      let position = this.offset;
      while (position < size) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position);
        if (!bytesRead) break;
        position += bytesRead;
        const data = carry.length ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
        let start = 0;
        for (let end = data.indexOf(10, start); end !== -1; end = data.indexOf(10, start)) {
          if (end > start) onLine(data.subarray(start, end));
          start = end + 1;
        }
        carry = Buffer.from(data.subarray(start));
      }
      // A line still being written stays unread until its newline arrives.
      this.offset = position - carry.length;
    } finally { await handle.close(); }
  }
}

module.exports = { listLogs, statLog, LogTail };
