/**
 * oracle_audit.mjs — Canonical solution oracle audit
 *
 * Tests:
 *   canonical_ts_code → oracle → PASS/FAIL
 *   canonical_ts_code → LIN verifier → oracle → PASS/FAIL
 *   canonical_lin_code → LIN verifier → oracle → PASS/FAIL
 *
 * This isolates: is the oracle correct? Is the verifier blocking valid code?
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LinVerifierAdapter } from './lin_verifier_adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..');

const VERIFIER = new LinVerifierAdapter();

// ============================================================
// Canonical TS solutions
// ============================================================

const CANONICAL_TS = {
  T001: `function solve(input) {
  const m = { RED: 'GREEN', GREEN: 'YELLOW', YELLOW: 'RED' };
  return m[input] || 'ERROR';
}`,

  T003: `function solve(input) {
  const { stack, action, value, history } = input;

  if (action === 'push') {
    const newStack = [...stack, value];
    const newHistory = [...history, newStack];
    return { stack: newStack, history: newHistory };
  }

  if (action === 'pop') {
    const newStack = stack.slice(0, -1);
    const newHistory = [...history, newStack];
    return { stack: newStack, history: newHistory };
  }

  if (action === 'rollback') {
    const prevStack = history.length > 1 ? history[history.length - 2] : stack;
    const prevHistory = history.slice(0, -1);
    return { stack: prevStack, history: prevHistory };
  }

  return { stack, history };
}`,
};

// ============================================================
// Canonical LIN solutions (valid LIN syntax)
// ============================================================

const CANONICAL_LIN = {
  T001: `@LIN:1.0
!solve(input){
  ?(input === "RED"){ ^"GREEN" }
  ?(input === "GREEN"){ ^"YELLOW" }
  ?(input === "YELLOW"){ ^"RED" }
  ^"ERROR"
}`,

  T003: `@LIN:1.0
!solve(input){
  ?(input.action === "push"){
    ^{ stack: [...input.stack, input.value], history: [...input.history, [...input.stack, input.value]] }
  }
  ?(input.action === "pop"){
    ^{ stack: input.stack.slice(0, -1), history: [...input.history, input.stack.slice(0, -1)] }
  }
  ?(input.action === "rollback"){
    ^{ stack: input.history.length > 1 ? input.history[input.history.length - 2] : input.stack, history: input.history.slice(0, -1) }
  }
}`,
};

// ============================================================
// Oracle loaders (inline, same logic as the oracle files)
// ============================================================

function loadOracle(taskId) {
  const oraclePath = path.join(BASE_DIR, 'oracles', `oracle_${taskId}.mjs`);
  return import(`file://${oraclePath}`).then(m => m.oracle);
}

function loadTask(taskId) {
  const taskPath = path.join(BASE_DIR, 'tasks', `${taskId}.json`);
  return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
}

// ============================================================
// Audit runner
// ============================================================

async function auditTask(taskId) {
  const task = loadTask(taskId);
  const oracleFn = await loadOracle(taskId);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TASK ${taskId}: ${task.family} (${task.difficulty})`);
  console.log(`Spec: ${task.specification}`);
  console.log(`${'='.repeat(60)}`);

  const results = [];

  // --- Test 1: Canonical TS → Oracle ---
  console.log('\n--- Test 1: Canonical TS → Oracle ---');
  try {
    const res1 = await oracleFn(task, { candidate_code: CANONICAL_TS[taskId] });
    console.log(`  Result: ${res1.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!res1.passed) console.log(`  Hint: ${res1.hint}`);
    results.push({ test: 'TS→Oracle', passed: res1.passed, hint: res1.hint || null });
  } catch (e) {
    console.log(`  Result: ❌ ERROR: ${e.message}`);
    results.push({ test: 'TS→Oracle', passed: false, hint: e.message });
  }

  // --- Test 2: Canonical TS → LIN Verifier → Oracle ---
  console.log('\n--- Test 2: Canonical TS → LIN Verifier → Oracle ---');
  const vRes = await VERIFIER.verify(task, { candidate_code: CANONICAL_TS[taskId] }, 1);
  console.log(`  Verifier: ${vRes.passed ? '✅ PASS' : '❌ FAIL'} (stage=${vRes.stage})`);
  if (!vRes.passed) {
    console.log(`  Violation: ${vRes.violation_class} — ${vRes.remedy_hint}`);
    results.push({ test: 'TS→Verifier→Oracle', passed: false, verifier_passed: false, hint: `Verifier blocked: ${vRes.violation_class}` });
  } else {
    try {
      const res2 = await oracleFn(task, { candidate_code: CANONICAL_TS[taskId] });
      console.log(`  Oracle: ${res2.passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!res2.passed) console.log(`  Hint: ${res2.hint}`);
      results.push({ test: 'TS→Verifier→Oracle', passed: res2.passed, verifier_passed: true, hint: res2.hint || null });
    } catch (e) {
      console.log(`  Oracle: ❌ ERROR: ${e.message}`);
      results.push({ test: 'TS→Verifier→Oracle', passed: false, verifier_passed: true, hint: e.message });
    }
  }

  // --- Test 3: Canonical LIN → LIN Verifier → Oracle ---
  console.log('\n--- Test 3: Canonical LIN → LIN Verifier → Oracle ---');
  const vRes3 = await VERIFIER.verify(task, { candidate_code: CANONICAL_LIN[taskId] }, 1);
  console.log(`  Verifier: ${vRes3.passed ? '✅ PASS' : '❌ FAIL'} (stage=${vRes3.stage})`);
  if (!vRes3.passed) {
    console.log(`  Violation: ${vRes3.violation_class} — ${vRes3.remedy_hint}`);
    results.push({ test: 'LIN→Verifier→Oracle', passed: false, verifier_passed: false, hint: `Verifier blocked: ${vRes3.violation_class}` });
  } else {
    try {
      const res3 = await oracleFn(task, { candidate_code: CANONICAL_LIN[taskId] });
      console.log(`  Oracle: ${res3.passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!res3.passed) console.log(`  Hint: ${res3.hint}`);
      results.push({ test: 'LIN→Verifier→Oracle', passed: res3.passed, verifier_passed: true, hint: res3.hint || null });
    } catch (e) {
      console.log(`  Oracle: ❌ ERROR: ${e.message}`);
      results.push({ test: 'LIN→Verifier→Oracle', passed: false, verifier_passed: true, hint: e.message });
    }
  }

  // --- Test 4: Canonical LIN raw → Oracle (no verifier) ---
  console.log('\n--- Test 4: Canonical LIN raw → Oracle (no verifier) ---');
  try {
    const res4 = await oracleFn(task, { candidate_code: CANONICAL_LIN[taskId] });
    console.log(`  Result: ${res4.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!res4.passed) console.log(`  Hint: ${res4.hint}`);
    results.push({ test: 'LIN→Oracle (raw)', passed: res4.passed, hint: res4.hint || null });
  } catch (e) {
    console.log(`  Result: ❌ ERROR: ${e.message}`);
    results.push({ test: 'LIN→Oracle (raw)', passed: false, hint: e.message });
  }

  // --- Summary ---
  const allPass = results.every(r => r.passed);
  console.log(`\n  SUMMARY: ${results.every(r => r.passed) ? '✅ ALL PASS' : '⚠️  SOME FAILURES'}`);
  for (const r of results) {
    console.log(`    ${r.passed ? '✅' : '❌'} ${r.test}${r.hint ? ` — ${r.hint}` : ''}`);
  }

  return { taskId, results, allPass };
}

async function main() {
  console.log('🔍 Oracle Audit: Canonical Solutions');
  console.log('====================================');

  const taskIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['T001', 'T003'];

  const auditResults = [];
  for (const tid of taskIds) {
    const res = await auditTask(tid);
    auditResults.push(res);
  }

  console.log('\n\n📊 OVERALL AUDIT SUMMARY');
  console.log('========================');
  for (const ar of auditResults) {
    console.log(`  ${ar.allPass ? '✅' : '⚠️ '} ${ar.taskId}: ${ar.results.filter(r => r.passed).length}/${ar.results.length} pass`);
  }

  const globalPass = auditResults.every(r => r.allPass);
  console.log(`\n  Global: ${globalPass ? '✅ ORACLE CORRECT' : '⚠️  ISSUES FOUND — investigate'}`);
}

main().catch(err => { console.error('❌ FATAL:', err); process.exit(1); });
