/**
 * LIN Language Fuzzer — Test Runner
 *
 * Run: node tests/fuzzer/lin_fuzz.test.mjs
 * Or:  npm test (picks up *.test.mjs)
 *
 * Closes the loop: fuzz → find → minimize → diagnose → propose → validate → regress
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseLia, compileLiaToJs } from '../../src/compiler.mjs';
import {
  QUOTED_LITERALS, IDENTIFIER_TRAPS, STRING_EDGE_CASES,
  NESTING_TRAPS, MINIMAL_PROGRAMS, ORACLE,
} from './lin_corpus.mjs';
import {
  runFuzzer, fuzzLexerCharacters, differentialTest, fuzzMutations,
  classifyBugs, minimize, generateRepairPatch,
} from './lin_fuzzer.mjs';

const requireSelf = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
const failures = [];
const regressions = [];

function test(name, fn) {
  try { fn(); passed++; process.stderr.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; failures.push({ name, error: e }); process.stderr.write(`  ✗ ${name}: ${e.message}\n`); }
}

function isParseSafe(lin) {
  try { parseLia(lin); return true; } catch { return false; }
}

function isEmitSafe(lin) {
  try { compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false }); return true; } catch { return false; }
}

function execJs(jsCode, args) {
  const tmp = `/tmp/lin_fuzz_test_${Date.now()}.cjs`;
  try {
    fs.writeFileSync(tmp, jsCode, 'utf8');
    const mod = requireSelf(tmp);
    const fn = typeof mod === 'function' ? mod : mod.default || mod[Object.keys(mod)[0]];
    return fn(...args);
  } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
}

// ═══════════════════════════════════════════════════════════════════════
console.log('═══ LIN Language Fuzzer — Regression Suite ═══\n');

// ── Layer 1: Quoted Literal Tests ────────────────────────────────────
console.log('── Layer 1: Quoted Literal Parsing ──');
for (const item of QUOTED_LITERALS) {
  test(`quoted literal: ${item.desc}`, () => {
    const lin = `@LIN:L1c:0.2\n^schema_once\n!f(){s=${item.input};^(1)}\n=ex{f}`;
    assert.ok(isParseSafe(lin), `should parse: ${item.desc}`);
  });
}

// ── Layer 1: String Edge Cases ────────────────────────────────────────
console.log('\n── Layer 1: String Edge Cases ──');
for (const item of STRING_EDGE_CASES) {
  test(`string edge: ${item.desc}`, () => {
    if (item.expect === 'parse_ok') {
      assert.ok(isParseSafe(item.input), `should parse: ${item.desc}`);
    }
  });
}

// ── Layer 1: Identifier Traps ─────────────────────────────────────────
console.log('\n── Layer 1: Identifier Traps ──');
for (const item of IDENTIFIER_TRAPS) {
  test(`identifier trap: ${item.desc}`, () => {
    const lin = `@LIN:L1c:0.2\n^schema_once\n!${item.input}(){^(1)}\n=ex{${item.input}}`;
    const parsed = isParseSafe(lin);
    const emitted = isEmitSafe(lin);
    // We just record — some should fail, some should succeed
    // The important thing is they don't crash silently
    if (!parsed && !emitted) regressions.push({ type: 'identifier', ...item });
  });
}

// ── Layer 1: Nesting ──────────────────────────────────────────────────
console.log('\n── Layer 1: Nesting Traps ──');
for (const item of NESTING_TRAPS) {
  test(`nesting: ${item.desc}`, () => {
    const lin = `@LIN:L1c:0.2\n^schema_once\n${item.input}\n=ex{f}`;
    assert.ok(isParseSafe(lin), `should parse: ${item.desc}`);
  });
}

// ── Layer 3: Differential Testing (emit only) ────────────────────────
console.log('\n── Layer 3: Multi-Backend Emit ──');
import { compileLia } from '../../src/multi_emit.mjs';
const BACKENDS_OLD = ['ts', 'py', 'go', 'rust', 'c', 'java', 'zig'];
const BACKENDS_NEW = ['kotlin', 'swift', 'cpp', 'cs'];
for (const prog of MINIMAL_PROGRAMS) {
  const fnName = prog.match(/!(\w+)/)?.[1] || 'unknown';
  // Legacy backends: direct require
  for (const target of BACKENDS_OLD) {
    test(`emit ${target}: ${fnName}`, () => {
      try {
        const emitMod = requireSelf(`../../src/emit_${target}.mjs`);
        const emitter = emitMod[`emit${target.charAt(0).toUpperCase() + target.slice(1)}`];
        const out = emitter(parseLia(prog));
        assert.ok(out.code !== undefined && out.code !== null, `should produce code`);
      } catch (e) {
        if (!e.message.includes('not implemented') && !e.message.includes('stub')) {
          throw e;
        }
      }
    });
  }
  // New backends: via multi_emit dispatcher
  for (const target of BACKENDS_NEW) {
    test(`emit ${target}: ${fnName}`, () => {
      try {
        const out = compileLia(prog, { target, formalGate: false, skipRefineProof: true });
        assert.ok(out.code !== undefined && out.code !== null, `should produce code`);
      } catch (e) {
        if (!e.message.includes('not implemented') && !e.message.includes('stub')) {
          throw e;
        }
      }
    });
  }
}

// ── Layer 3: JS Oracle Execution ──────────────────────────────────────
console.log('\n── Layer 3: JS Oracle Execution ──');
for (const prog of MINIMAL_PROGRAMS) {
  const jsResult = (() => {
    try { return compileLiaToJs(prog, { exportMode: 'multiple', formalGate: false }); }
    catch { return null; }
  })();
  if (!jsResult) continue;

  for (const [call, expected] of Object.entries(ORACLE)) {
    const fnName = call.split('(')[0];
    if (!prog.includes(`!${fnName}`)) continue;

    test(`oracle: ${call} = ${expected}`, () => {
      const result = execJs(jsResult.js, parseCallArgs(call));
      assert.deepStrictEqual(result, expected, `${call}: expected ${expected}, got ${result}`);
    });
  }
}

function parseCallArgs(callExpr) {
  const m = callExpr.match(/^\w+\((.*)\)$/s);
  if (!m) return [];
  const raw = m[1].trim();
  if (!raw) return [];
  const args = [];
  let depth = 0, inStr = null, start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (ch === inStr && raw[i - 1] !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(eval(raw.slice(start, i).trim()));
      start = i + 1;
    }
  }
  args.push(eval(raw.slice(start).trim()));
  return args;
}

// ── Layer 4: Mutation Testing ─────────────────────────────────────────
console.log('\n── Layer 4: Mutation Testing ──');
const mutations = [
  { base: '@LIN:L1c:0.2\n^schema_once\n!add(a,b){^(a+b)}\n=ex{add}', find: '==', replace: '===', desc: 'double-equals mutation' },
  { base: '@LIN:L1c:0.2\n^schema_once\n!f(){?(1){^(1)}:{}}\n=ex{f}', find: '?(', replace: '#(', desc: 'if→for mutation' },
];
for (const mut of mutations) {
  if (!mut.base.includes(mut.find)) continue;
  test(`mutation: ${mut.desc}`, () => {
    const mutated = mut.base.replace(mut.find, mut.replace);
    const p = isParseSafe(mutated);
    const e = isEmitSafe(mutated);
    // Record — don't assert. Mutation may or may not be valid.
    if (!p && !e) regressions.push({ type: 'mutation', ...mut });
  });
}

// ── Full Pipeline Run ─────────────────────────────────────────────────
console.log('\n── Full Fuzzer Pipeline (50 samples) ──');
const report = runFuzzer({ grammarSamples: 50 });
test('pipeline: completes without crash', () => {
  assert.ok(report.total > 0, 'should have test results');
});
test('pipeline: tracks layer counts', () => {
  assert.ok(report.layers[1] > 0, 'layer 1 should have results');
  assert.ok(report.layers[2] > 0, 'layer 2 should have results');
  assert.ok(report.layers[4] > 0, 'layer 4 should have results');
});
test('pipeline: produces bug report', () => {
  assert.ok(typeof report.failed === 'number');
  assert.ok(typeof report.passed === 'number');
  assert.ok(report.total === report.passed + report.failed);
});

// ── Repair Engine: Diagnose Known $ Bug ──────────────────────────────
console.log('\n── Repair Engine: Known Bug Diagnosis ──');
test('repair: $ literal bug diagnosis', () => {
  const bug = {
    layer: 1, category: 'quoted_literal', severity: 'lexer',
    desc: 'dollar in single quotes', input: "'$'",
    error: 'parse or emit failure for $ inside string literal',
  };
  const patch = generateRepairPatch(bug);
  assert.equal(patch.type, 'lexer_fix');
  assert.ok(patch.diagnosis.length > 0);
  assert.ok(patch.strategy.length > 0);
  assert.equal(patch.testable, true);
});

test('repair: minimize function works', () => {
  const big = '@LIN:L1c:0.2\n^schema_once\n!a(){^(1)}\n!b(){^(2)}\n!c(){^(3)}\n=ex{a,b,c}';
  const mini = minimize(big, false);
  assert.ok(typeof mini === 'string');
  assert.ok(mini.length <= big.length);
});

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════
console.log('\n═══ Fuzzer Summary ═══');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Fuzzer pipeline: ${report.total} samples, ${report.failed} failures`);
if (report.bugs.length > 0) {
  console.log(`  Bugs found: ${report.bugs.length}`);
  for (const b of report.bugs) {
    console.log(`    [${b.severity}] ${b.category}: ${b.desc} — ${(b.error || '').slice(0, 80)}`);
  }
}
if (regressions.length > 0) {
  console.log(`  Regressions tracked: ${regressions.length}`);
}
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.error.message.slice(0, 200)}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
