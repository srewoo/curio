// Package dist/ into a Chrome Web Store upload zip: release/curio-<version>.zip.
// Uses the system `zip` (present on macOS/Linux). Fails soft with a clear note
// if `zip` is unavailable (e.g. Windows) so the build itself still succeeds.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

if (!existsSync('dist')) {
  console.error('zip: dist/ not found — run the build first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const outRel = `release/curio-${pkg.version}.zip`;
mkdirSync('release', { recursive: true });
if (existsSync(outRel)) rmSync(outRel);

try {
  // -r recurse, -X strip extra file attrs (cleaner store upload).
  execFileSync('zip', ['-r', '-X', `../${outRel}`, '.'], { cwd: 'dist', stdio: 'ignore' });
  console.log(`zip: created ${outRel}`);
} catch {
  console.warn('zip: system `zip` unavailable — skipped store package (dist/ is still ready to load unpacked).');
}
