/**
 * fase1_benchmark.mjs — IR_BENCHMARK_V1 Phase 1: Canonical TS → LIN
 *
 * Measures:
 *   - IR_ratio (tokens and bytes)
 *   - semantic_equivalence (oracle pass)
 *   - compression ratio
 *
 * No LLM involved. Pure deterministic transformation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tsToLin, tsToLinMetrics, canonicalizeLin, countTokens, countBytes } from './ts_to_lin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..', 'cognitive_ablation');
const MANIFEST_PATH = path.join(BASE_DIR, 'MANIFEST.json');
const RUNS_DIR = path.join(__dirname, 'results');

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';

// Canonical TS solutions for T001-T010
const CANONICAL_TS = {
  T001: `function solve(input) {
  const m = { RED: 'GREEN', GREEN: 'YELLOW', YELLOW: 'RED' };
  return m[input] || 'ERROR';
}`,

  T002: `function solve(input) {
  const { buffer, item } = input;
  const newBuffer = [...buffer, item];
  if (newBuffer.length > 3) {
    return newBuffer.slice(1);
  }
  return newBuffer;
}`,

  T003: `function solve(input) {
  const { stack, action, value, history } = input;

  if (action === "push") {
    const newStack = [...stack, value];
    const newHistory = [...history, newStack];
    return { stack: newStack, history: newHistory };
  }

  if (action === "pop") {
    const newStack = stack.slice(0, -1);
    const newHistory = [...history, newStack];
    return { stack: newStack, history: newHistory };
  }

  if (action === "rollback") {
    const prevStack = history.length > 1 ? history[history.length - 2] : stack;
    const prevHistory = history.slice(0, -1);
    return { stack: prevStack, history: prevHistory };
  }

  return { stack, history };
}`,

  T004: `function solve(input) {
  const intervals = input;
  if (intervals.length === 0) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    if (sorted[i][0] <= last[1]) {
      result[result.length - 1] = [last[0], Math.max(last[1], sorted[i][1])];
    } else {
      result[result.length] = sorted[i];
    }
  }
  return result;
}`,

  T005: `function solve(input) {
  const sum = input.current + input.step;
  if (sum <= input.max) return sum;
  return input.max;
}`,

  T006: `function solve(input) {
  const s = input;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") {
      stack[stack.length] = c;
    } else {
      if (stack.length === 0) return false;
      const top = stack[stack.length - 1];
      stack.length = stack.length - 1;
      if (c === ")" && top !== "(") return false;
      if (c === "]" && top !== "[") return false;
      if (c === "}" && top !== "{") return false;
    }
  }
  return stack.length === 0;
}`,

  T007: `function solve(input) {
  const arr = input;
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      const flat = solve(arr[i]);
      for (let j = 0; j < flat.length; j++) {
        result[result.length] = flat[j];
      }
    } else {
      result[result.length] = arr[i];
    }
  }
  return result;
}`,

  T008: `function solve(input) {
  const s = input;
  if (s.length === 0) return "";
  let result = "";
  let count = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1]) {
      count = count + 1;
    } else {
      result = result + count + s[i - 1];
      count = 1;
    }
  }
  result = result + count + s[s.length - 1];
  return result;
}`,

  T009: `function solve(input) {
  const result = {};
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = input[key];
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const inner = solve(val);
      const innerKeys = Object.keys(inner);
      for (let j = 0; j < innerKeys.length; j++) {
        result[key + "." + innerKeys[j]] = inner[innerKeys[j]];
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}`,

  T010: `function solve(input) {
  const s = input;
  if (s.length === 0) return {};
  const result = {};
  const pairs = s.split("&");
  for (let i = 0; i < pairs.length; i++) {
    const eqIdx = pairs[i].indexOf("=");
    if (eqIdx >= 0) {
      const key = pairs[i].slice(0, eqIdx);
      const val = pairs[i].slice(eqIdx + 1);
      result[key] = val;
    }
  }
  return result;
}`,
};

async function loadTask(taskId) {
  const taskPath = path.join(BASE_DIR, 'tasks', `${taskId}.json`);
  return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
}

async function loadOracle(taskId) {
  const oraclePath = path.join(BASE_DIR, 'oracles', `oracle_${taskId}.mjs`);
  const mod = await import(`file://${oraclePath}`);
  return mod.oracle;
}

async function verifySemanticEquivalence(task, oracleFn, tsCode, linCode) {
  const tsCandidate = { candidate_code: tsCode, raw_output: tsCode, candidate_hash: 'ts_canonical' };
  const linCandidate = { candidate_code: linCode, raw_output: linCode, candidate_hash: 'lin_canonical' };

  let tsPass = false;
  let linPass = false;
  let tsError = null;
  let linError = null;

  try {
    const tsRes = await oracleFn(task, tsCandidate);
    tsPass = tsRes.passed;
    if (!tsPass) tsError = tsRes.hint;
  } catch (e) {
    tsError = e.message;
  }

  try {
    const linRes = await oracleFn(task, linCandidate);
    linPass = linRes.passed;
    if (!linPass) linError = linRes.hint;
  } catch (e) {
    linError = e.message;
  }

  return {
    ts_pass: tsPass,
    lin_pass: linPass,
    semantic_equivalence: tsPass && linPass,
    ts_error: tsError,
    lin_error: linError,
  };
}

async function main() {
  console.log('🔬 IR_BENCHMARK_V1 — Phase 1: Canonical TS → LIN');
  console.log('================================================\n');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  if (manifest.global_sha256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error('MANIFEST INTEGRITY VIOLATION');
  }

  // Filter to tasks with canonical solutions
  const targetTasks = Object.keys(CANONICAL_TS);

  console.log(`Tasks: ${targetTasks.join(', ')}`);
  console.log(`Method: Deterministic canonicalizer (no LLM)\n`);

  const results = [];
  let totalTsTokens = 0;
  let totalLinTokens = 0;
  let totalTsBytes = 0;
  let totalLinBytes = 0;
  let semanticPassCount = 0;

  for (const taskId of targetTasks) {
    const tsCode = CANONICAL_TS[taskId];
    const task = await loadTask(taskId);
    const oracleFn = await loadOracle(taskId);

    // Convert TS → LIN
    const metrics = tsToLinMetrics(tsCode, { addHeader: false });

    // Verify semantic equivalence
    const semResult = await verifySemanticEquivalence(task, oracleFn, tsCode, metrics.lin_code);

    if (semResult.semantic_equivalence) semanticPassCount++;

    totalTsTokens += metrics.ts_tokens;
    totalLinTokens += metrics.lin_tokens;
    totalTsBytes += metrics.ts_bytes;
    totalLinBytes += metrics.lin_bytes;

    const result = {
      task_id: taskId,
      family: task.family,
      difficulty: task.difficulty,
      ts_tokens: metrics.ts_tokens,
      lin_tokens: metrics.lin_tokens,
      ts_bytes: metrics.ts_bytes,
      lin_bytes: metrics.lin_bytes,
      ir_ratio_tokens: metrics.ir_ratio_tokens,
      ir_ratio_bytes: metrics.ir_ratio_bytes,
      semantic_equivalence: semResult.semantic_equivalence,
      ts_pass: semResult.ts_pass,
      lin_pass: semResult.lin_pass,
      ts_error: semResult.ts_error,
      lin_error: semResult.lin_error,
    };

    results.push(result);

    // Console output
    const eq = semResult.semantic_equivalence ? '✅' : '❌';
    const comp = metrics.ir_ratio_bytes < 1
      ? `${((1 - metrics.ir_ratio_bytes) * 100).toFixed(1)}% smaller`
      : `${((metrics.ir_ratio_bytes - 1) * 100).toFixed(1)}% larger`;

    console.log(`${taskId}: ${eq} IR=${metrics.ir_ratio_bytes.toFixed(3)} (${comp})  TS=${metrics.ts_tokens}tok LIN=${metrics.lin_tokens}tok`);

    if (!semResult.semantic_equivalence) {
      console.log(`  ⚠️  TS pass: ${semResult.ts_pass}, LIN pass: ${semResult.lin_pass}`);
      if (semResult.ts_error) console.log(`  TS error: ${semResult.ts_error}`);
      if (semResult.lin_error) console.log(`  LIN error: ${semResult.lin_error}`);
    }
  }

  // Aggregate metrics
  const avgIrTokens = results.reduce((s, r) => s + r.ir_ratio_tokens, 0) / results.length;
  const avgIrBytes = results.reduce((s, r) => s + r.ir_ratio_bytes, 0) / results.length;
  const semanticEqRate = semanticPassCount / results.length;

  console.log('\n📊 AGGREGATE');
  console.log('='.repeat(60));
  console.log(`  Tasks:              ${results.length}`);
  console.log(`  Semantic Eq Rate:   ${(semanticEqRate * 100).toFixed(1)}% (${semanticPassCount}/${results.length})`);
  console.log(`  Avg IR (tokens):    ${avgIrTokens.toFixed(3)}`);
  console.log(`  Avg IR (bytes):     ${avgIrBytes.toFixed(3)}`);
  console.log(`  Total TS tokens:    ${totalTsTokens}`);
  console.log(`  Total LIN tokens:   ${totalLinTokens}`);
  console.log(`  Total TS bytes:     ${totalTsBytes}`);
  console.log(`  Total LIN bytes:    ${totalLinBytes}`);
  console.log(`  Global compression: ${((1 - totalLinBytes / totalTsBytes) * 100).toFixed(1)}%`);

  // Save results
  const runId = `IR_FASE1_${Date.now()}`;
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'IR_BENCHMARK_V1 Phase 1',
    method: 'Deterministic canonicalizer (no LLM)',
    tasks: results.length,
    semantic_eq_rate: semanticEqRate,
    avg_ir_ratio_tokens: avgIrTokens,
    avg_ir_ratio_bytes: avgIrBytes,
    total_ts_tokens: totalTsTokens,
    total_lin_tokens: totalLinTokens,
    total_ts_bytes: totalTsBytes,
    total_lin_bytes: totalLinBytes,
    global_compression: 1 - totalLinBytes / totalTsBytes,
    task_results: results,
  };

  fs.writeFileSync(path.join(runDir, 'REPORT.json'), JSON.stringify(report, null, 2));

  // Print per-task details
  console.log('\n📋 PER-TASK DETAILS');
  console.log('='.repeat(60));
  console.table(results.map(r => ({
    'Task': r.task_id,
    'TS tok': r.ts_tokens,
    'LIN tok': r.lin_tokens,
    'IR tok': r.ir_ratio_tokens.toFixed(3),
    'TS B': r.ts_bytes,
    'LIN B': r.lin_bytes,
    'IR B': r.ir_ratio_bytes.toFixed(3),
    'Eq': r.semantic_equivalence ? '✅' : '❌',
  })));

  // Verdict
  console.log('\n🔑 VERDICT');
  if (semanticEqRate === 1.0 && avgIrBytes < 0.8) {
    console.log('  ✅ H_IR-01 PRELIMINARY SUPPORT: LIN is semantically equivalent AND >20% smaller');
  } else if (semanticEqRate === 1.0) {
    console.log('  ⚠️  PARTIAL: Semantic equivalence holds, but compression <20%');
  } else {
    console.log('  ❌ FAILURE: Semantic equivalence broken');
  }

  console.log(`\n💾 ${runDir}`);
}

main().catch(err => { console.error('❌ FATAL:', err); process.exit(1); });
