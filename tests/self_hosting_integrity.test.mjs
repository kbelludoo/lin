/**
 * Test: Self-Hosting Integrity & Real Dogfooding Gate.
 * 
 * Verifies that LIN files (.lin) in src/ are actively consumed by the runtime
 * (via Host Loaders _load.mjs or .compiled.* artifacts) and not shadowed by
 * handwritten .mjs files or left as decorative orphans.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getAllSourceFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(full));
    } else if (/\.(mjs|cjs|js|ts)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

console.log('=== Running Self-Hosting Integrity & Dogfooding Gate ===\n');

const linFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.lin'));
const allCodeFiles = getAllSourceFiles(rootDir);
const fileContents = allCodeFiles.map(f => ({
  path: f,
  rel: path.relative(rootDir, f),
  content: fs.readFileSync(f, 'utf8')
}));

const report = [];

for (const lin of linFiles.sort()) {
  const base = lin.replace(/\.lin$/, '');
  const hasLoad = fs.existsSync(path.join(srcDir, `${base}_load.mjs`));
  const hasCompiledMjs = fs.existsSync(path.join(srcDir, `${base}.compiled.mjs`));
  const hasCompiledCjs = fs.existsSync(path.join(srcDir, `${base}.compiled.cjs`));
  const hasCompiledTs = fs.existsSync(path.join(srcDir, `${base}.compiled.ts`));
  const hasHandwrittenMjs = fs.existsSync(path.join(srcDir, `${base}.mjs`));

  let refsToLoad = 0;
  let refsToCompiled = 0;
  let refsToHandwritten = 0;

  for (const f of fileContents) {
    // Skip self-referencing in the loader itself
    if (f.rel === `src/${base}_load.mjs`) continue;
    if (f.content.includes(`${base}_load`)) refsToLoad++;
    if (f.content.includes(`${base}.compiled`)) refsToCompiled++;
    if (f.content.includes(`/${base}.mjs`) || f.content.includes(`'./${base}.mjs'`) || f.content.includes(`"../src/${base}.mjs"`)) {
      refsToHandwritten++;
    }
  }

  const isActive = refsToLoad > 0 || refsToCompiled > 0;
  const isShadowed = !isActive && hasHandwrittenMjs && refsToHandwritten > 0;
  const isOrphan = !isActive && !isShadowed;

  report.push({
    file: lin,
    base,
    hasLoad,
    hasCompiled: hasCompiledMjs || hasCompiledCjs || hasCompiledTs,
    hasHandwrittenMjs,
    refsToLoad,
    refsToCompiled,
    refsToHandwritten,
    status: isActive ? 'ACTIVE' : (isShadowed ? 'SHADOWED' : 'ORPHAN')
  });
}

const active = report.filter(r => r.status === 'ACTIVE');
const shadowed = report.filter(r => r.status === 'SHADOWED');
const orphans = report.filter(r => r.status === 'ORPHAN');

const ratio = (active.length / report.length) * 100;

console.log(`Total .lin components in src/: ${report.length}`);
console.log(`  - Active in runtime (dogfooded): ${active.length} (${ratio.toFixed(1)}%)`);
console.log(`  - Shadowed by handwritten JS:    ${shadowed.length}`);
console.log(`  - Unconnected / Orphans:         ${orphans.length}\n`);

console.log('Active Core Dogfooded Components:');
active.forEach(a => console.log(`  ✓ ${a.file} (refs: loader=${a.refsToLoad}, compiled=${a.refsToCompiled})`));

if (shadowed.length > 0) {
  console.log('\nShadowed Components (needs linking to .lin):');
  shadowed.forEach(s => console.log(`  ⚠ ${s.file} (handwritten ${s.base}.mjs is imported ${s.refsToHandwritten} times)`));
}

// Gate: We must maintain at least the active set without regression
assert.ok(active.length >= 7, `Self-hosting regression: expected at least 7 active LIN components, got ${active.length}`);

console.log('\n============================================================');
console.log(`Self-Hosting Gate PASSED: ${active.length}/${report.length} components dogfooded (${ratio.toFixed(1)}%).`);
console.log('============================================================\n');
