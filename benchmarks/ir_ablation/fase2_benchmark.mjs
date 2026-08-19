/**
 * fase2_benchmark.mjs — IR_BENCHMARK_V1 Phase 2: LLM → LIN vs LLM → TS
 *
 * Measures end-to-end cost of LLM producing LIN vs TS.
 * Compares with Phase 1 canonical baseline.
 *
 * Conditions:
 *   A = LLM → TS (baseline, minimal prompt)
 *   B = LLM → LIN (zero-shot, minimal grammar)
 *   C = LLM → LIN (few-shot, 5 examples)
 *
 * Metrics per condition:
 *   - prompt_tokens
 *   - completion_tokens
 *   - total_tokens
 *   - semantic_equivalence (oracle pass)
 *   - IR_ratio = completion_tokens(LIN) / completion_tokens(TS_baseline)
 *   - end_to_end_ratio = total_tokens(LIN) / total_tokens(TS_baseline)
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IR_DIR = __dirname;
const BASE_DIR = path.join(__dirname, '..', 'cognitive_ablation');
const MANIFEST_PATH = path.join(BASE_DIR, 'MANIFEST.json');
const RUNS_DIR = path.join(IR_DIR, 'results');

import { countTokens, countBytes, canonicalizeLin } from './ts_to_lin.mjs';
import { LinVerifierAdapter } from '../cognitive_ablation/harness/lin_verifier_adapter.mjs';

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';
const TARGET_TASKS = ['T001', 'T002', 'T003', 'T004', 'T005', 'T006', 'T007', 'T008', 'T009', 'T010'];

const CONDITIONS = [
  {
    id: 'A',
    name: 'LLM → TS (baseline)',
    promptType: 'NATURAL_JS',
  },
  {
    id: 'B',
    name: 'LLM → LIN (zero-shot)',
    promptType: 'LIN_MINIMAL',
  },
  {
    id: 'C',
    name: 'LLM → LIN (few-shot)',
    promptType: 'LIN_FEWSHOT',
  },
];

// Canonical TS solutions (same as Phase 1)
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

// Canonical LIN (from Phase 1 — the gold reference)
const CANONICAL_LIN = {};
// We'll generate these from the canonical TS using the canonicalizer

async function loadTask(taskId) {
  const taskPath = path.join(BASE_DIR, 'tasks', `${taskId}.json`);
  return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
}

async function loadOracle(taskId) {
  const oraclePath = path.join(BASE_DIR, 'oracles', `oracle_${taskId}.mjs`);
  const mod = await import(`file://${oraclePath}`);
  return mod.oracle;
}

function buildPrompt(task, promptType) {
  if (promptType === 'NATURAL_JS') {
    return `Task ID: ${task.id} (${task.family})
Specification: ${task.specification}
Constraints: Write a pure JavaScript function named "solve" that accepts "input" and returns the result. Do not use external libraries.

Output ONLY valid JavaScript code for function solve(input):`;
  }

  if (promptType === 'LIN_MINIMAL') {
    return `@LIN:1.0
Task: ${task.id} (${task.family})
Spec: ${task.specification}
Forbidden effects: ${task.forbidden_effects && task.forbidden_effects.length ? task.forbidden_effects.join(', ') : 'none'}

Grammar rules:
- Function: !solve(input){ ... }
- Return: ^expression
- Conditionals: ?(cond){ ... } or ?(cond){ ... }:(cond2){ ... }:{ ... }
- Loops: #(i=0; i<len; i++){ ... }
- Pure assignments: a = 1; b = 2;

Output ONLY the raw LIN function !solve(input){ ... } without markdown or explanations.`;
  }

  if (promptType === 'LIN_FEWSHOT') {
    return `@LIN:1.0
Task: ${task.id} (${task.family})
Spec: ${task.specification}
Forbidden effects: ${task.forbidden_effects && task.forbidden_effects.length ? task.forbidden_effects.join(', ') : 'none'}

Examples:
!multiply(a, b){^(a * b)}
!abs(x){?(x < 0){^(-x)}:^{x}}
!sumArray(arr){#(s = 0;i = 0;i < arr.length;i++){s = (s + arr[i])}^(s)}
!evens(arr){#(r = [];i = 0;i < arr.length;i++){?(arr[i] % 2 === 0){r[r.length] = arr[i]}}^(r)}
!greet(name){?(name){^("Hello, " + name)}:^("Hello, world")}

Output ONLY the raw LIN function !solve(input){ ... } without markdown or explanations.`;
  }

  throw new Error(`Unknown promptType: ${promptType}`);
}

function extractCode(rawText) {
  let text = rawText.trim();
  const codeBlockMatch = text.match(/```(?:lin|lia|js|javascript)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();
  return text;
}

async function generateCandidate(baseUrl, model, prompt, temperature, seed) {
  const startTime = Date.now();
  let rawText = '', promptTokens = 0, completionTokens = 0;
  let modelError = false, modelTimeout = false;

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, prompt, stream: false,
        options: { temperature, seed }
      })
    });

    if (!res.ok) { modelError = true; }
    else {
      const data = await res.json();
      rawText = data.response || '';
      promptTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : 0;
      completionTokens = typeof data.eval_count === 'number' ? data.eval_count : 0;
    }
  } catch (err) {
    if (err.message?.includes('timeout')) modelTimeout = true;
    else modelError = true;
  }

  const latency_ms = Date.now() - startTime;
  const candidateCode = extractCode(rawText);

  return {
    candidate_code: candidateCode,
    raw_output: rawText,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    latency_ms,
    model_error: modelError,
    model_timeout: modelTimeout,
  };
}

async function verifyAndOracle(task, oracleFn, candidateCode) {
  const verifier = new LinVerifierAdapter();
  const candidateRes = { candidate_code: candidateCode, raw_output: candidateCode };

  const verifierRes = await verifier.verify(task, candidateRes, 1);
  let oraclePassed = false;
  let oracleExecuted = false;

  if (verifierRes.passed) {
    oracleExecuted = true;
    try {
      const oracleRes = await oracleFn(task, candidateRes);
      oraclePassed = oracleRes.passed;
    } catch (e) { oraclePassed = false; }
  }

  return {
    verifier_passed: verifierRes.passed,
    oracle_executed: oracleExecuted,
    oracle_passed: oraclePassed,
    semantic_equivalence: oraclePassed,
  };
}

async function unloadAllModels(baseUrl, modelName) {
  try {
    await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, keep_alive: 0 }),
    });
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) { /* best effort */ }
}

async function main() {
  console.log('🔬 IR_BENCHMARK_V1 Phase 2: LLM → LIN vs LLM → TS');
  console.log('==================================================\n');

  const modelConfig = {
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.MODEL_NAME || 'qwen2.5-coder:7b',
    temperature: 0.0,
    seed: 42,
  };

  console.log(`Model: ${modelConfig.model}`);
  console.log(`Tasks: ${TARGET_TASKS.join(', ')}`);
  console.log(`Conditions: ${CONDITIONS.map(c => c.id).join(', ')}\n`);

  // Load tasks and oracles
  const tasks = [];
  const oracles = {};
  for (const tid of TARGET_TASKS) {
    tasks.push(await loadTask(tid));
    oracles[tid] = await loadOracle(tid);
  }

  // Import canonicalizer
  const { tsToLinMetrics } = await import('./ts_to_lin.mjs');

  // Generate canonical LIN reference
  console.log('--- Phase 1 Canonical Reference ---');
  for (const tid of TARGET_TASKS) {
    const tsCode = CANONICAL_TS[tid];
    const linMetrics = tsToLinMetrics(tsCode, { addHeader: false });
    const semResult = await verifyAndOracle(tasks.find(t => t.id === tid), oracles[tid], linMetrics.lin_code);
    CANONICAL_LIN[tid] = {
      lin_code: linMetrics.lin_code,
      lin_tokens: linMetrics.lin_tokens,
      lin_bytes: linMetrics.lin_bytes,
      ir_ratio: linMetrics.ir_ratio_bytes,
      semantic_eq: semResult.semantic_equivalence,
    };
    const eq = semResult.semantic_equivalence ? '✅' : '❌';
    console.log(`  ${tid}: IR=${linMetrics.ir_ratio_bytes.toFixed(3)} ${eq}`);
  }

  // Run LLM conditions
  const allResults = [];

  for (const condition of CONDITIONS) {
    console.log(`\n▶ Condition ${condition.id}: ${condition.name}`);

    // Unload between conditions
    if (allResults.length > 0) {
      await unloadAllModels(modelConfig.baseUrl, modelConfig.model);
    }

    const taskResults = [];

    for (const task of tasks) {
      const oracleFn = oracles[task.id];
      const prompt = buildPrompt(task, condition.promptType);

      const genResult = await generateCandidate(
        modelConfig.baseUrl, modelConfig.model, prompt,
        modelConfig.temperature, modelConfig.seed
      );

      const semResult = await verifyAndOracle(task, oracleFn, genResult.candidate_code);

      // Compute IR ratio if LIN output
      let completion_tokens_canonical = null;
      let ir_ratio_llm = null;
      if (condition.promptType !== 'NATURAL_JS') {
        const canonicalRef = CANONICAL_LIN[task.id];
        if (canonicalRef) {
          completion_tokens_canonical = canonicalRef.lin_tokens;
          ir_ratio_llm = genResult.completion_tokens / (CANONICAL_TS[task.id].split(/\s+/).length || 1);
        }
      }

      // TS baseline completion tokens for end-to-end ratio
      const ts_baseline_tokens = CANONICAL_TS[task.id].split(/\s+/).length;

      taskResults.push({
        task_id: task.id,
        family: task.family,
        difficulty: task.difficulty,
        prompt_tokens: genResult.prompt_tokens,
        completion_tokens: genResult.completion_tokens,
        total_tokens: genResult.total_tokens,
        semantic_pass: semResult.semantic_equivalence,
        verifier_passed: genResult.candidate_code.length > 0 ? semResult.verifier_passed : false,
        oracle_passed: semResult.oracle_passed,
        ts_baseline_tokens,
        ir_ratio: condition.promptType !== 'NATURAL_JS'
          ? genResult.completion_tokens / ts_baseline_tokens
          : null,
        end_to_end_ratio: condition.promptType !== 'NATURAL_JS'
          ? genResult.total_tokens / ts_baseline_tokens
          : null,
        candidate_code: genResult.candidate_code,
        latency_ms: genResult.latency_ms,
      });

      const status = semResult.semantic_equivalence ? '✅' : '❌';
      const irStr = condition.promptType !== 'NATURAL_JS'
        ? ` IR=${(genResult.completion_tokens / ts_baseline_tokens).toFixed(3)}`
        : '';
      console.log(`  ${task.id}: ${status} prompt=${genResult.prompt_tokens} comp=${genResult.completion_tokens} total=${genResult.total_tokens}${irStr}`);
    }

    // Aggregate
    const totalPrompt = taskResults.reduce((s, r) => s + r.prompt_tokens, 0);
    const totalComp = taskResults.reduce((s, r) => s + r.completion_tokens, 0);
    const totalTokens = taskResults.reduce((s, r) => s + r.total_tokens, 0);
    const passCount = taskResults.filter(r => r.semantic_pass).length;

    const result = {
      condition_id: condition.id,
      condition_name: condition.name,
      summary: {
        tasks: taskResults.length,
        semantic_pass_rate: passCount / taskResults.length,
        semantic_pass_count: passCount,
        total_prompt_tokens: totalPrompt,
        total_completion_tokens: totalComp,
        total_tokens: totalTokens,
        avg_prompt_tokens: totalPrompt / taskResults.length,
        avg_completion_tokens: totalComp / taskResults.length,
        avg_tokens: totalTokens / taskResults.length,
      },
      task_results: taskResults,
    };

    allResults.push(result);

    console.log(`\n  Summary: ${passCount}/${taskResults.length} pass  prompt=${totalPrompt} comp=${totalComp} total=${totalTokens}`);
  }

  // === COMPARISON TABLE ===
  console.log('\n\n📊 COMPARISON: Phase 1 Canonical vs Phase 2 LLM');
  console.log('='.repeat(80));

  // Build comparison
  const canonicalComp = Object.values(CANONICAL_LIN).filter(r => r.semantic_eq).length;
  const canonicalTotal = TARGET_TASKS.length;

  console.log('\n┌─────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Metric              │  Phase 1     │  Cond A      │  Cond B      │  Cond C      │');
  console.log('│                     │  Canonical   │  LLM→TS      │  LLM→LIN     │  LLM→LIN+FS  │');
  console.log('├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤');

  const condA = allResults.find(r => r.condition_id === 'A');
  const condB = allResults.find(r => r.condition_id === 'B');
  const condC = allResults.find(r => r.condition_id === 'C');

  const fmt = (v, d = 0) => v !== null && v !== undefined ? v.toFixed(d) : '-';
  const fmtInt = v => v !== null && v !== undefined ? String(Math.round(v)) : '-';

  console.log(`│ Semantic Eq Rate    │  ${fmt(canonicalComp / canonicalTotal * 100, 0).padStart(8)}%  │  ${fmt(condA?.summary.semantic_pass_rate * 100, 0).padStart(8)}%  │  ${fmt(condB?.summary.semantic_pass_rate * 100, 0).padStart(8)}%  │  ${fmt(condC?.summary.semantic_pass_rate * 100, 0).padStart(8)}%  │`);
  console.log(`│ Avg Prompt Tok      │  ${'0'.padStart(8)}     │  ${fmtInt(condA?.summary.avg_prompt_tokens).padStart(8)}     │  ${fmtInt(condB?.summary.avg_prompt_tokens).padStart(8)}     │  ${fmtInt(condC?.summary.avg_prompt_tokens).padStart(8)}     │`);
  console.log(`│ Avg Comp Tok        │  ${fmtInt(29).padStart(8)}     │  ${fmtInt(condA?.summary.avg_completion_tokens).padStart(8)}     │  ${fmtInt(condB?.summary.avg_completion_tokens).padStart(8)}     │  ${fmtInt(condC?.summary.avg_completion_tokens).padStart(8)}     │`);
  console.log(`│ Avg Total Tok       │  ${fmtInt(29).padStart(8)}     │  ${fmtInt(condA?.summary.avg_tokens).padStart(8)}     │  ${fmtInt(condB?.summary.avg_tokens).padStart(8)}     │  ${fmtInt(condC?.summary.avg_tokens).padStart(8)}     │`);
  console.log('└─────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘');

  // Per-task details
  console.log('\n📋 PER-TASK: Completion Tokens (LLM output size)');
  console.log('='.repeat(80));
  console.log('Task    TS_canonical  LIN_canonical  LLM→TS  LLM→LIN  LLM→LIN+FS');
  for (const tid of TARGET_TASKS) {
    const canonical = CANONICAL_LIN[tid];
    const tsCanonTokens = CANONICAL_TS[tid].split(/\s+/).length;
    const a = condA?.task_results.find(r => r.task_id === tid);
    const b = condB?.task_results.find(r => r.task_id === tid);
    const c = condC?.task_results.find(r => r.task_id === tid);
    const eq = (v) => v?.semantic_pass ? '✅' : '❌';

    console.log(`${tid}    ${String(tsCanonTokens).padStart(12)}  ${String(canonical?.lin_tokens || '-').padStart(14)}  ${String(a?.completion_tokens || '-').padStart(7)}  ${String(b?.completion_tokens || '-').padStart(7)}  ${String(c?.completion_tokens || '-').padStart(7)}  ${eq(a)} ${eq(b)} ${eq(c)}`);
  }

  // Key question
  console.log('\n🔑 KEY QUESTION:');
  console.log('  Does LLM→LIN capture the ~29% structural compression?');
  if (condB) {
    const avgCompRatio = condB.summary.avg_completion_tokens / (condA?.summary.avg_completion_tokens || 1);
    const e2eRatio = condB.summary.avg_tokens / (condA?.summary.avg_tokens || 1);
    console.log(`  Completion ratio (B/A): ${avgCompRatio.toFixed(3)}`);
    console.log(`  End-to-end ratio (B/A): ${e2eRatio.toFixed(3)}`);
    if (avgCompRatio < 0.8) {
      console.log('  ✅ LLM→LIN produces smaller output than LLM→TS');
    } else if (avgCompRatio < 1.0) {
      console.log('  ⚠️  LLM→LIN produces slightly smaller output, but prompt cost may dominate');
    } else {
      console.log('  ❌ LLM→LIN produces same or larger output than LLM→TS');
    }
  }

  // Save
  const runId = `IR_FASE2_${Date.now()}`;
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'IR_BENCHMARK_V1 Phase 2',
    model: modelConfig.model,
    tasks: TARGET_TASKS,
    conditions: CONDITIONS.map(c => ({ id: c.id, name: c.name })),
    phase1_canonical: {
      avg_ir_ratio: Object.values(CANONICAL_LIN).reduce((s, r) => s + r.ir_ratio, 0) / TARGET_TASKS.length,
      semantic_eq_rate: canonicalComp / canonicalTotal,
      total_tokens: Object.values(CANONICAL_LIN).reduce((s, r) => s + r.lin_tokens, 0),
    },
    results: allResults.map(r => ({
      condition_id: r.condition_id,
      condition_name: r.condition_name,
      summary: r.summary,
      task_results: r.task_results.map(tr => ({
        task_id: tr.task_id,
        prompt_tokens: tr.prompt_tokens,
        completion_tokens: tr.completion_tokens,
        total_tokens: tr.total_tokens,
        semantic_pass: tr.semantic_pass,
        ir_ratio: tr.ir_ratio,
        end_to_end_ratio: tr.end_to_end_ratio,
      })),
    })),
  };

  fs.writeFileSync(path.join(runDir, 'REPORT.json'), JSON.stringify(report, null, 2));

  console.log(`\n💾 ${runDir}`);
}

main().catch(err => { console.error('❌ FATAL:', err); process.exit(1); });
