// Chrome rejects extension files whose names start with "_" (reserved). Vite's
// CommonJS interop emits chunks like `_commonjsHelpers.js`, and the
// web-extension plugin overrides Rollup's chunkFileNames, so we fix it here as
// a post-build step: rename offending files and rewrite every reference to them.
import { readdirSync, statSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const DIST = 'dist';
const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.map', '.css', '.json']);
// System-reserved names Chrome DOES allow — never touch these.
const ALLOWED = new Set(['_locales', '_metadata']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST);
const renames = [];
for (const full of files) {
  const name = basename(full);
  if (name.startsWith('_') && !ALLOWED.has(name)) {
    const newName = name.replace(/^_+/, 'cjs-');
    renames.push({ full, name, newName, newFull: join(dirname(full), newName) });
  }
}

if (renames.length === 0) {
  console.log('fix-underscore: nothing to rename.');
  process.exit(0);
}

// Rewrite references (by basename token) across all text files first.
for (const full of files) {
  if (!TEXT_EXT.has(full.slice(full.lastIndexOf('.')))) continue;
  let content = readFileSync(full, 'utf8');
  let changed = false;
  for (const r of renames) {
    if (content.includes(r.name)) {
      content = content.split(r.name).join(r.newName);
      changed = true;
    }
  }
  if (changed) writeFileSync(full, content);
}

// Then rename the files on disk.
for (const r of renames) {
  renameSync(r.full, r.newFull);
  console.log(`fix-underscore: ${r.name} → ${r.newName}`);
}
