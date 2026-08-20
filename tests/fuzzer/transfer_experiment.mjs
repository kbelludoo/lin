/**
 * Simultaneous 4-Target Transfer Experiment
 *
 * Tests whether fixing a shared root cause in the LIN core
 * transfers improvements to multiple emit backends simultaneously.
 *
 * TransferRate = targets_improved_without_specific_patch / targets_audited
 *
 * Run: node tests/fuzzer/transfer_experiment.mjs
 */
import assert from 'node:assert/strict';
import { compileLia } from '../../src/multi_emit.mjs';
import { MINIMAL_PROGRAMS } from './lin_corpus.mjs';
import { STRESS_PROGRAMS, CONSTANT_TABLE_PROGRAMS, COMPLEX_CONTROL_PROGRAMS } from './transfer_corpus.mjs';

const TARGETS = ['kotlin', 'swift', 'cpp', 'cs'];

const ALL_PROGRAMS = [
  ...MINIMAL_PROGRAMS.map((p) => ({ lin: p, desc: p.match(/!(\w+)/)?.[1] || 'anon' })),
  ...STRESS_PROGRAMS,
  ...CONSTANT_TABLE_PROGRAMS,
  ...COMPLEX_CONTROL_PROGRAMS,
];

// ── Helpers ─────────────────────────────────────────────────────────
function emitSafe(liaText, target) {
  try {
    const result = compileLia(liaText, { target, formalGate: false, skipRefineProof: true });
    return { ok: true, code: result.code };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}



// ── Phase 1: Baseline ──────────────────────────────────────────────
console.log('═══ Transfer Experiment — Phase 1: Baseline ═══\n');
const baseline = {};
for (const target of TARGETS) {
  baseline[target] = { pass: [], fail: [] };
}

for (const item of ALL_PROGRAMS) {
  const name = item.desc || item.lin.match(/!(\w+)/)?.[1] || 'anon';
  for (const target of TARGETS) {
    const result = emitSafe(item.lin, target);
    if (result.ok) {
      baseline[target].pass.push(name);
    } else {
      baseline[target].fail.push({ name, error: result.error });
    }
  }
}

console.log('── Baseline Results ──');
const baselineTable = {};
for (const target of TARGETS) {
  const b = baseline[target];
  const rate = ((b.pass.length / ALL_PROGRAMS.length) * 100).toFixed(1);
  console.log(`  ${target.padEnd(8)} ${String(b.pass.length).padStart(3)}/${ALL_PROGRAMS.length} (${rate}%)`);
  baselineTable[target] = rate;
}

// ── Identify shared failures ────────────────────────────────────────
console.log('\n── Shared Failures (same program fails on 2+ targets) ──');
const failureMap = {};
for (const target of TARGETS) {
  for (const f of baseline[target].fail) {
    if (!failureMap[f.name]) failureMap[f.name] = {};
    failureMap[f.name][target] = f.error;
  }
}
const sharedFailures = Object.entries(failureMap)
  .filter(([_, targets]) => Object.keys(targets).length >= 2)
  .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length);

if (sharedFailures.length > 0) {
  for (const [name, targets] of sharedFailures) {
    const targetList = Object.keys(targets).join(', ');
    const firstError = Object.values(targets)[0].slice(0, 80);
    console.log(`  [${targetList}] ${name}: ${firstError}`);
  }
} else {
  console.log('  (none)');
}

// ── Identify target-specific failures ───────────────────────────────
console.log('\n── Target-Specific Failures ──');
for (const target of TARGETS) {
  const specific = baseline[target].fail.filter((f) => !failureMap[f.name] || Object.keys(failureMap[f.name]).length === 1);
  if (specific.length > 0) {
    console.log(`  ${target}: ${specific.map((f) => f.name).join(', ')}`);
  }
}

// ── Emit quality comparison ─────────────────────────────────────────
console.log('\n── Emit Quality Sample (clamp function) ──');
const clampProg = '@LIN:L1c:0.2\n^schema_once\n!clamp(x,lo,hi){?(x<lo){^(lo)}:{};?(x>hi){^(hi)}:{};^(x)}\n=ex{clamp}';
for (const target of TARGETS) {
  const result = emitSafe(clampProg, target);
  if (result.ok) {
    console.log(`\n  ── ${target} ──`);
    console.log(result.code.split('\n').slice(0, 10).map((l) => '  ' + l).join('\n'));
  }
}

// ── Phase 2: Find and fix shared root cause ────────────────────────
console.log('\n═══ Transfer Experiment — Phase 2: Root Cause Analysis ═══\n');

// Common shared root causes:
// 1. Regex `$` in LIN source — affects any backend whose .lin file uses regex
// 2. String concat `'x'+'::'+'y'` — parser may choke on complex patterns
// 3. Deeply nested closures — closure variable resolution breaks
// 4. `$K` constant table — constant inlining path differs per backend

console.log('── Root Cause Hypotheses ──');
console.log('  1. $-regex-in-lin: $ inside regex literals in .lin source (known bug)');
console.log('  2. closure-nesting: nested closures with walk=/walk() pattern');
console.log('  3. $K-constant-table: constant table expansion differences');
console.log('  4. deep-recursion: deep recursive calls overwhelm JS emit path');
console.log('  5. shared-infra: shared helper (emitCond/rewriteExpr) edge cases');

// ── Phase 3: Fix shared root cause and measure transfer ─────────────
console.log('\n═══ Transfer Experiment — Phase 3: Transfer Measurement ═══\n');

// For each fix, we measure: how many targets improved?
const experiments = [
  {
    name: 'Fix: Remove $-regex from cpp backend (known)',
    desc: 'Replace /pattern$/ with character-by-character checks',
    targets: ['cpp'],
    fix: 'emit_cpp.lin already fixed — no $ in regex',
    preTarget: 'cpp',
  },
  {
    name: 'Fix: Add cpp case to rewriteExpr/emitCond in emit_shared.mjs',
    desc: 'Add explicit "cpp" case to shared expression/condition rewriting',
    targets: ['cpp'],
    fix: 'add cpp to emit_shared.mjs rewrite switch',
    preTarget: 'cpp',
  },
];

for (const exp of experiments) {
  console.log(`  Experiment: ${exp.name}`);
  console.log(`    Fix: ${exp.fix}`);
  console.log(`    Direct target: ${exp.preTarget}`);
  console.log(`    Transfer to other targets: measuring...\n`);
}

// ── Report ──────────────────────────────────────────────────────────
console.log('═══ Transfer Experiment Summary ═══');
console.log(`  Programs tested: ${ALL_PROGRAMS.length}`);
console.log(`  Targets: ${TARGETS.join(', ')}`);
console.log(`  Shared failure programs: ${sharedFailures.length}`);
console.log(`  Target-specific failures:`);
for (const target of TARGETS) {
  const specific = baseline[target].fail.filter((f) => !failureMap[f.name] || Object.keys(failureMap[f.name]).length === 1);
  console.log(`    ${target}: ${specific.length}`);
}
console.log(`  Baseline rates: ${TARGETS.map((t) => `${t}:${baselineTable[t]}%`).join(' ')}`);
console.log('\n  Next: Apply fixes, rerun, compute TransferRate');
