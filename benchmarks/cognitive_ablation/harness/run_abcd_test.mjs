/**
 * run_abcd_test.mjs — A/B/C/D minimal: TS baseline vs LIN minimal vs LIN few-shot vs LIN constrained
 *
 * Separa 4 efeitos:
 *   A → B: custo de ensinar sintaxe mínima LIN
 *   B → C: efeito dos exemplos few-shot
 *   C → D: efeito das constraints
 *
 * Mesmo modelo, mesmas tarefas, mesmos oráculos.
 * Output: results/ABCD_TEST_<timestamp>/
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(BASE_DIR, 'MANIFEST.json');
const RUNS_DIR = path.join(BASE_DIR, 'results');

import { FewShotAdapter } from './fewshot_adapter.mjs';
import { LinVerifierAdapter } from './lin_verifier_adapter.mjs';
import { classifyFailure, countByClass, deriveRates } from './failure_classes.mjs';

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';

function shuffleWithSeed(arr, seed) {
  const a = [...arr];
  let s = seed | 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const j = ((t ^ (t >>> 14)) >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CONDITIONS = [
  {
    id: 'A',
    name: 'TS Baseline (Natural JavaScript)',
    mode: 'TS_BASELINE',
  },
  {
    id: 'B',
    name: 'LIN Minimal Grammar',
    mode: 'LIN_MINIMAL',
  },
  {
    id: 'C',
    name: 'LIN Few-Shot (5 examples)',
    mode: 'FEW_SHOT',
  },
  {
    id: 'D',
    name: 'LIN Constrained (5 examples + grammar)',
    mode: 'CONSTRAINED',
  },
];

async function loadTasks() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  if (manifest.global_sha256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error('MANIFEST INTEGRITY VIOLATION');
  }

  const tasks = [];
  const oracles = {};

  for (const entry of manifest.tasks) {
    const taskPath = path.join(BASE_DIR, 'tasks', `${entry.id}.json`);
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    tasks.push(task);

    const oraclePath = path.join(BASE_DIR, entry.oracle_entrypoint);
    const mod = await import(`file://${oraclePath}`);
    oracles[entry.id] = mod.oracle;
  }

  return { manifest, tasks, oracles };
}

function classifyAttempt({ modelError, modelTimeout, rawOutput, candidateCode, verifierPassed, oracleExecuted, oraclePassed }) {
  return classifyFailure({ modelError, modelTimeout, rawOutput, candidateCode, verifierPassed, oracleExecuted, oraclePassed });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRuntimeState(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/ps`);
    if (res.ok) {
      const data = await res.json();
      return {
        loaded_models: (data.models || []).map(m => ({ name: m.name, size: m.size, size_vram: m.size_vram })),
        model_count: (data.models || []).length,
      };
    }
  } catch (e) { /* ignore */ }
  return { loaded_models: [], model_count: -1, error: 'unreachable' };
}

async function unloadAllModels(baseUrl, modelName) {
  try {
    await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, keep_alive: 0 }),
    });
    await sleep(1500);
  } catch (e) { /* best effort */ }
}

// TS Baseline adapter — builds prompt for natural JavaScript
class TSBaselineAdapter {
  constructor({ baseUrl, model, temperature, seed }) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.temperature = temperature;
    this.seed = seed;
  }

  buildPrompt(task) {
    return `Task ID: ${task.id} (${task.family})
Specification: ${task.specification}
Constraints: Write a pure JavaScript function named "solve" that accepts "input" and returns the result. Do not use external libraries.

Output ONLY valid JavaScript code for function solve(input):`;
  }

  extractCode(rawText) {
    let text = rawText.trim();
    const codeBlockMatch = text.match(/```(?:lin|lia|js|javascript)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) text = codeBlockMatch[1].trim();
    return text;
  }

  async generateCandidate(task) {
    const prompt = this.buildPrompt(task);
    const startTime = Date.now();
    let rawText = '', promptTokens = 0, completionTokens = 0, totalTokens = 0;
    let modelError = false, modelTimeout = false;

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false, options: { temperature: this.temperature, seed: this.seed } })
      });
      if (!res.ok) { modelError = true; }
      else {
        const data = await res.json();
        rawText = data.response || '';
        promptTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : 0;
        completionTokens = typeof data.eval_count === 'number' ? data.eval_count : 0;
        totalTokens = promptTokens + completionTokens;
      }
    } catch (e) {
      if (e.message?.includes('timeout')) modelTimeout = true;
      else modelError = true;
    }

    const latency_ms = Date.now() - startTime;
    const candidateCode = this.extractCode(rawText);
    const candidate_hash = createHash('sha256').update(candidateCode).digest('hex').slice(0, 16);

    return {
      candidate_code: candidateCode,
      raw_output: rawText,
      candidate_hash,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens: totalTokens,
      latency_ms,
      model_error: modelError,
      model_timeout: modelTimeout,
    };
  }
}

// LIN Minimal adapter — just the grammar rules, no examples
class LINMinimalAdapter {
  constructor({ baseUrl, model, temperature, seed }) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.temperature = temperature;
    this.seed = seed;
  }

  buildPrompt(task) {
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

  extractCode(rawText) {
    let text = rawText.trim();
    const codeBlockMatch = text.match(/```(?:lin|lia|js|javascript)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) text = codeBlockMatch[1].trim();
    return text;
  }

  async generateCandidate(task) {
    const prompt = this.buildPrompt(task);
    const startTime = Date.now();
    let rawText = '', promptTokens = 0, completionTokens = 0, totalTokens = 0;
    let modelError = false, modelTimeout = false;

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false, options: { temperature: this.temperature, seed: this.seed } })
      });
      if (!res.ok) { modelError = true; }
      else {
        const data = await res.json();
        rawText = data.response || '';
        promptTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : 0;
        completionTokens = typeof data.eval_count === 'number' ? data.eval_count : 0;
        totalTokens = promptTokens + completionTokens;
      }
    } catch (e) {
      if (e.message?.includes('timeout')) modelTimeout = true;
      else modelError = true;
    }

    const latency_ms = Date.now() - startTime;
    const candidateCode = this.extractCode(rawText);
    const candidate_hash = createHash('sha256').update(candidateCode).digest('hex').slice(0, 16);

    return {
      candidate_code: candidateCode,
      raw_output: rawText,
      candidate_hash,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens: totalTokens,
      latency_ms,
      model_error: modelError,
      model_timeout: modelTimeout,
    };
  }
}

function createAdapter(condition, modelConfig) {
  switch (condition.mode) {
    case 'TS_BASELINE':
      return new TSBaselineAdapter({
        baseUrl: modelConfig.baseUrl, model: modelConfig.model,
        temperature: modelConfig.temperature, seed: modelConfig.seed,
      });
    case 'LIN_MINIMAL':
      return new LINMinimalAdapter({
        baseUrl: modelConfig.baseUrl, model: modelConfig.model,
        temperature: modelConfig.temperature, seed: modelConfig.seed,
      });
    case 'FEW_SHOT':
    case 'CONSTRAINED':
      return new FewShotAdapter({
        baseUrl: modelConfig.baseUrl, provider: modelConfig.provider,
        model: modelConfig.model, temperature: modelConfig.temperature,
        seed: modelConfig.seed, mode: condition.mode,
      });
    default:
      throw new Error(`Unknown mode: ${condition.mode}`);
  }
}

async function runCondition({ condition, tasks, oracles, verifierAdapter, manifestSha256, modelConfig }) {
  const adapter = createAdapter(condition, modelConfig);
  const conditionSeed = modelConfig.seed + condition.id.charCodeAt(0);
  const shuffledTasks = shuffleWithSeed(tasks, conditionSeed);

  const taskResults = [];
  const timestamp = new Date().toISOString();

  for (const task of shuffledTasks) {
    const oracleFn = oracles[task.id];
    const attempts = [];
    let finalFailureClass = 'MODEL_FAILURE';

    const k = 1;
    const candidateRes = await adapter.generateCandidate(task);

    const verifierRes = await verifierAdapter.verify(task, candidateRes, k);
    let oraclePassed = false;
    let oracleExecuted = false;

    if (verifierRes.passed) {
      oracleExecuted = true;
      try {
        const oracleRes = await oracleFn(task, candidateRes);
        oraclePassed = oracleRes.passed;
      } catch (e) { oraclePassed = false; }
    }

    finalFailureClass = classifyAttempt({
      modelError: candidateRes.model_error,
      modelTimeout: candidateRes.model_timeout,
      rawOutput: candidateRes.raw_output,
      candidateCode: candidateRes.candidate_code,
      verifierPassed: verifierRes.passed,
      oracleExecuted,
      oraclePassed,
    });

    attempts.push({
      attempt: k,
      candidate_hash: candidateRes.candidate_hash,
      candidate_code: candidateRes.candidate_code,
      prompt_tokens: candidateRes.prompt_tokens || 0,
      completion_tokens: candidateRes.completion_tokens || 0,
      tokens: candidateRes.tokens,
      latency_ms: candidateRes.latency_ms,
      verifier_passed: verifierRes.passed,
      oracle_executed: oracleExecuted,
      oracle_passed: oraclePassed,
      failure_class: finalFailureClass,
      condition: condition.mode,
    });

    taskResults.push({
      task_id: task.id,
      family: task.family,
      difficulty: task.difficulty,
      failure_class: finalFailureClass,
      compile_pass: verifierRes.passed,
      oracle_pass: oraclePassed,
      prompt_tokens: candidateRes.prompt_tokens || 0,
      completion_tokens: candidateRes.completion_tokens || 0,
      total_tokens: candidateRes.tokens,
      total_latency_ms: candidateRes.latency_ms,
      attempts,
    });
  }

  const counts = countByClass(taskResults);
  const rates = deriveRates(counts, tasks.length);
  const totalTokens = taskResults.reduce((s, r) => s + r.total_tokens, 0);
  const totalPromptTokens = taskResults.reduce((s, r) => s + r.prompt_tokens, 0);
  const totalCompletionTokens = taskResults.reduce((s, r) => s + r.completion_tokens, 0);
  const totalLatency = taskResults.reduce((s, r) => s + r.total_latency_ms, 0);
  const successResults = taskResults.filter(r => r.failure_class === 'PASS');

  const summary = {
    ...rates,
    counts,
    total_tasks: tasks.length,
    total_tokens: totalTokens,
    total_prompt_tokens: totalPromptTokens,
    total_completion_tokens: totalCompletionTokens,
    total_latency_ms: totalLatency,
    avg_tokens_per_task: totalTokens / tasks.length,
    avg_prompt_tokens_per_task: totalPromptTokens / tasks.length,
    avg_completion_tokens_per_task: totalCompletionTokens / tasks.length,
    avg_latency_per_task: totalLatency / tasks.length,
    avg_tokens_per_pass: successResults.length > 0
      ? successResults.reduce((s, r) => s + r.total_tokens, 0) / successResults.length : null,
  };

  return {
    condition_id: condition.id,
    condition_name: condition.name,
    mode: condition.mode,
    timestamp,
    manifest_sha256: manifestSha256,
    model_config: modelConfig,
    summary,
    task_results: taskResults,
  };
}

function buildComparison(results) {
  const taskMatrix = {};
  for (const result of results) {
    for (const tr of result.task_results) {
      if (!taskMatrix[tr.task_id]) {
        taskMatrix[tr.task_id] = { task_id: tr.task_id, family: tr.family, difficulty: tr.difficulty, conditions: {} };
      }
      taskMatrix[tr.task_id].conditions[result.condition_id] = {
        failure_class: tr.failure_class,
        compile_pass: tr.compile_pass,
        oracle_pass: tr.oracle_pass,
        oracle_executed: tr.attempts.some(a => a.oracle_executed),
        prompt_tokens: tr.prompt_tokens,
        completion_tokens: tr.completion_tokens,
        total_tokens: tr.total_tokens,
        total_latency_ms: tr.total_latency_ms,
      };
    }
  }
  const perTask = Object.values(taskMatrix).sort((a, b) => a.task_id.localeCompare(b.task_id));

  const comparison = {
    experiment: 'LIN_ABLATION_A_B_C_D',
    version: '1.0.0',
    protocol_version: 'PHASE0_SMOKE',
    timestamp: new Date().toISOString(),
    status: 'PRELIMINARY / NOT A FINAL DENSITY BENCHMARK',
    per_task: perTask,
    conditions: results.map(r => ({
      id: r.condition_id,
      name: r.condition_name,
      mode: r.mode,
      compile_pass_rate: r.summary.compile_pass_rate,
      oracle_pass_rate: r.summary.oracle_pass_rate,
      invalid_lin_rate: r.summary.invalid_lin_rate,
      model_failure_rate: r.summary.model_failure_rate,
      timeout_rate: r.summary.timeout_rate,
      avg_tokens_per_task: r.summary.avg_tokens_per_task,
      avg_prompt_tokens_per_task: r.summary.avg_prompt_tokens_per_task,
      avg_completion_tokens_per_task: r.summary.avg_completion_tokens_per_task,
      avg_latency_per_task: r.summary.avg_latency_per_task,
      avg_tokens_per_pass: r.summary.avg_tokens_per_pass,
      counts: r.summary.counts,
    })),
    deltas: {},
    efficiency: {},
    pareto_frontier: [],
  };

  // Deltas + efficiency
  const conditions = comparison.conditions;
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const a = conditions[i];
      const b = conditions[j];
      const key = `${a.id}_vs_${b.id}`;
      comparison.deltas[key] = {
        compile_pass_rate_delta: b.compile_pass_rate - a.compile_pass_rate,
        oracle_pass_rate_delta: b.oracle_pass_rate - a.oracle_pass_rate,
        tokens_delta: b.avg_tokens_per_task - a.avg_tokens_per_task,
        prompt_tokens_delta: (b.avg_prompt_tokens_per_task || 0) - (a.avg_prompt_tokens_per_task || 0),
        completion_tokens_delta: (b.avg_completion_tokens_per_task || 0) - (a.avg_completion_tokens_per_task || 0),
        latency_delta: b.avg_latency_per_task - a.avg_latency_per_task,
        invalid_lin_rate_delta: b.invalid_lin_rate - a.invalid_lin_rate,
      };

      const tokensA = a.avg_tokens_per_task || 1;
      const tokensB = b.avg_tokens_per_task || 1;
      const passA = a.oracle_pass_rate || 0;
      const passB = b.oracle_pass_rate || 0;
      const efficiencyA = passA / tokensA;
      const efficiencyB = passB / tokensB;

      let efficiencyGain = null, efficiencyGainReason = null;
      if (passA === 0 && passB === 0) { efficiencyGainReason = 'NO_PASS_EITHER'; }
      else if (passA === 0) { efficiencyGain = Infinity; efficiencyGainReason = 'NO_PASS_BASELINE'; }
      else if (passB === 0) { efficiencyGain = 0; efficiencyGainReason = 'NO_PASS_TARGET'; }
      else { efficiencyGain = efficiencyB / efficiencyA; }

      const tokenSavings = 1 - (tokensB / tokensA);
      comparison.efficiency[key] = {
        efficiency_gain: efficiencyGain !== null && isFinite(efficiencyGain) ? Number(efficiencyGain.toFixed(4)) : efficiencyGain,
        efficiency_gain_reason: efficiencyGainReason,
        token_savings: Number(tokenSavings.toFixed(4)),
        efficiency_a: Number(efficiencyA.toFixed(8)),
        efficiency_b: Number(efficiencyB.toFixed(8)),
      };
    }
  }

  // Pareto frontier: for each condition, plot (avg_tokens, oracle_pass_rate)
  comparison.pareto_frontier = conditions.map(c => ({
    id: c.id,
    avg_tokens: c.avg_tokens_per_task,
    oracle_pass_rate: c.oracle_pass_rate,
    prompt_tokens: c.avg_prompt_tokens_per_task,
    completion_tokens: c.avg_completion_tokens_per_task,
  }));

  return comparison;
}

async function verifyInvariants(allResults) {
  const checks = [];
  for (const result of allResults) {
    const cid = result.condition_id;
    const counts = result.summary.counts;
    const perTaskCounts = { PASS: 0, INVALID_LIN: 0, COMPILATION_FAILURE: 0, ORACLE_FAILURE: 0, MODEL_FAILURE: 0, TIMEOUT: 0 };
    for (const tr of result.task_results) { perTaskCounts[tr.failure_class] = (perTaskCounts[tr.failure_class] || 0) + 1; }
    const match = Object.keys(counts).every(k => counts[k] === perTaskCounts[k]);
    checks.push({ name: `reconcile_${cid}`, passed: match, detail: match ? null : `mismatch` });

    for (const tr of result.task_results) {
      const lastAttempt = tr.attempts[tr.attempts.length - 1];
      const fc = tr.failure_class;
      const oe = lastAttempt?.oracle_executed ?? false;
      const vp = lastAttempt?.verifier_passed ?? false;
      const op = lastAttempt?.oracle_passed ?? false;

      let expected = null;
      if (fc === 'PASS') expected = vp && oe && op;
      else if (fc === 'ORACLE_FAILURE') expected = vp && oe && !op;
      else if (fc === 'INVALID_LIN') expected = !vp && !oe;
      else if (fc === 'MODEL_FAILURE' || fc === 'TIMEOUT') expected = !oe;

      if (expected !== null) {
        checks.push({ name: `invariant_${fc}_${cid}_${tr.task_id}`, passed: expected === true, detail: expected !== true ? `fc=${fc} vp=${vp} oe=${oe} op=${op}` : null });
      }
    }
  }
  return checks;
}

async function main() {
  const args = process.argv.slice(2);
  const taskFlagIdx = args.indexOf('--tasks');
  const filterTaskIds = taskFlagIdx >= 0 ? args[taskFlagIdx + 1]?.split(',') : null;

  console.log('🧪 LIN A/B/C/D Ablation: TS Baseline vs LIN Minimal vs Few-Shot vs Constrained');
  console.log('================================================================================\n');

  const modelConfig = {
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    provider: 'ollama',
    model: process.env.MODEL_NAME || 'qwen2.5-coder:7b',
    temperature: 0.0,
    seed: 42,
  };

  console.log(`Model: ${modelConfig.model}`);
  console.log(`Endpoint: ${modelConfig.baseUrl}\n`);

  const { manifest, tasks: allTasks, oracles } = await loadTasks();
  const tasks = filterTaskIds ? allTasks.filter(t => filterTaskIds.includes(t.id)) : allTasks;
  console.log(`Dataset: ${tasks.length} of ${manifest.total_tasks} tasks (SHA-256 verified)`);
  if (filterTaskIds) console.log(`  Filtered: ${filterTaskIds.join(', ')}`);
  console.log('');

  const verifierAdapter = new LinVerifierAdapter();
  const runId = `ABCD_TEST_${Date.now()}`;
  fs.mkdirSync(path.join(RUNS_DIR, runId), { recursive: true });

  const allResults = [];

  for (let i = 0; i < CONDITIONS.length; i++) {
    const condition = CONDITIONS[i];

    if (i > 0) {
      console.log(`\n⏳ Barrier before Condition ${condition.id}...`);
      const stateBefore = await getRuntimeState(modelConfig.baseUrl);
      await unloadAllModels(modelConfig.baseUrl, modelConfig.model);
      const stateAfter = await getRuntimeState(modelConfig.baseUrl);
      console.log(`  Runtime: ${stateBefore.model_count} loaded → ${stateAfter.model_count} loaded`);

      fs.writeFileSync(
        path.join(RUNS_DIR, runId, `barrier_${CONDITIONS[i - 1].id}_to_${condition.id}.json`),
        JSON.stringify({ between: [CONDITIONS[i - 1].id, condition.id], timestamp: new Date().toISOString(), state_before: stateBefore, state_after: stateAfter }, null, 2)
      );
    }

    console.log(`\n▶ Condition ${condition.id}: ${condition.name}`);

    const result = await runCondition({
      condition, tasks, oracles, verifierAdapter,
      manifestSha256: manifest.global_sha256, modelConfig,
    });

    allResults.push(result);

    const condDir = path.join(RUNS_DIR, runId, `condition_${condition.id}`);
    fs.mkdirSync(condDir, { recursive: true });
    fs.writeFileSync(path.join(condDir, 'config.json'), JSON.stringify({ condition_id: condition.id, name: condition.name, mode: condition.mode, model_config: modelConfig }, null, 2));
    fs.writeFileSync(path.join(condDir, 'task_results.json'), JSON.stringify(result.task_results, null, 2));
    fs.writeFileSync(path.join(condDir, 'metrics.json'), JSON.stringify(result.summary, null, 2));

    console.log(`  oracle_pass: ${(result.summary.oracle_pass_rate * 100).toFixed(1)}%  compile: ${(result.summary.compile_pass_rate * 100).toFixed(1)}%`);
    console.log(`  prompt_tok: ${result.summary.avg_prompt_tokens_per_task.toFixed(0)}  comp_tok: ${result.summary.avg_completion_tokens_per_task.toFixed(0)}  total: ${result.summary.avg_tokens_per_task.toFixed(0)}`);
  }

  // Comparison
  const comparison = buildComparison(allResults);
  fs.writeFileSync(path.join(RUNS_DIR, runId, 'COMPARISON.json'), JSON.stringify(comparison, null, 2));

  // Invariants
  const invariantResults = await verifyInvariants(allResults);
  const allPassed = invariantResults.every(r => r.passed);
  fs.writeFileSync(path.join(RUNS_DIR, runId, 'INVARIANTS.json'), JSON.stringify({ timestamp: new Date().toISOString(), all_passed: allPassed, checks: invariantResults }, null, 2));

  // Console output
  console.log('\n\n📊 COMPARISON');
  console.log('==============================================================');
  console.table(comparison.conditions.map(c => ({
    'Cond': c.id,
    'Oracle%': (c.oracle_pass_rate * 100).toFixed(1),
    'Compile%': (c.compile_pass_rate * 100).toFixed(1),
    'Prompt Tok': c.avg_prompt_tokens_per_task?.toFixed(0) ?? '-',
    'Comp Tok': c.avg_completion_tokens_per_task?.toFixed(0) ?? '-',
    'Total Tok': c.avg_tokens_per_task.toFixed(0),
  })));

  console.log('\n📋 PER-TASK RESULTS');
  console.log('==============================================================');
  const condIds = comparison.conditions.map(c => c.id);
  const header = ['Task', 'Family', 'Diff', ...condIds.flatMap(c => [`${c}_pass`, `${c}_prompt`, `${c}_comp`, `${c}_total`, `${c}_class`])];
  const rows = comparison.per_task.map(t => {
    const row = [t.task_id, t.family, t.difficulty];
    for (const cid of condIds) {
      const c = t.conditions[cid];
      row.push(c ? (c.oracle_pass ? 'PASS' : 'FAIL') : '-');
      row.push(c ? String(c.prompt_tokens) : '-');
      row.push(c ? String(c.completion_tokens) : '-');
      row.push(c ? String(c.total_tokens) : '-');
      row.push(c ? c.failure_class : '-');
    }
    return row;
  });
  console.table([header, ...rows]);

  console.log('\n🔬 INVARIANTS');
  for (const inv of invariantResults) {
    console.log(`  ${inv.passed ? '✅' : '❌'} ${inv.name}${inv.detail ? ` — ${inv.detail}` : ''}`);
  }
  console.log(`  Overall: ${allPassed ? '✅ ALL SATISFIED' : '❌ VIOLATION(S)'}`);

  // Pareto
  console.log('\n📈 PARETO FRONTIER (tokens → oracle_pass_rate)');
  for (const p of comparison.pareto_frontier) {
    console.log(`  ${p.id}: ${p.avg_tokens.toFixed(0)} tok → ${(p.oracle_pass_rate * 100).toFixed(1)}%  (prompt=${p.prompt_tokens?.toFixed(0)} comp=${p.completion_tokens?.toFixed(0)})`);
  }

  console.log(`\n💾 ${RUNS_DIR}/${runId}`);
}

main().catch(err => { console.error('❌ FATAL:', err); process.exit(1); });
