/**
 * micro_ablation.mjs — Diagnostic micro-ablation on T002/T003
 *
 * Conditions:
 *   A = TS baseline (NATURAL_JS) — 1 attempt
 *   B = LIN minimal (LIN_ZERO_SHOT) — 1 attempt
 *   D = LIN constrained (LIN_TRAUMA but k=1) — 1 attempt
 *   E = LIN + verifier + trauma (LIN_TRAUMA, k=3) — 3 attempts with retry
 *
 * Metrics:
 *   initial_pass — pass on attempt 1
 *   recovered_pass — pass on attempt >1 after failure
 *   RSR — recovery success rate
 *   attempts_to_pass — how many attempts needed
 *   tokens_to_pass — total tokens until pass (or total if no pass)
 *   failure_class_transition — [attempt1_class, attempt2_class, attempt3_class]
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(BASE_DIR, 'MANIFEST.json');
const RUNS_DIR = path.join(BASE_DIR, 'results');

import { RealModelAdapter } from './real_model_adapter.mjs';
import { LinVerifierAdapter } from './lin_verifier_adapter.mjs';
import { classifyFailure, countByClass, deriveRates } from './failure_classes.mjs';

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';
const TARGET_TASKS = ['T002', 'T003'];

const CONDITIONS = [
  {
    id: 'A',
    name: 'TS Baseline (1 attempt)',
    promptMode: 'NATURAL_JS',
    maxAttempts: 1,
    feedbackMode: 'NONE',
  },
  {
    id: 'B',
    name: 'LIN Minimal (1 attempt)',
    promptMode: 'LIN_ZERO_SHOT',
    maxAttempts: 1,
    feedbackMode: 'NONE',
  },
  {
    id: 'D',
    name: 'LIN Constrained (1 attempt)',
    promptMode: 'LIN_TRAUMA',
    maxAttempts: 1,
    feedbackMode: 'NONE',
  },
  {
    id: 'E',
    name: 'LIN + Verifier + Trauma (3 attempts)',
    promptMode: 'LIN_TRAUMA',
    maxAttempts: 3,
    feedbackMode: 'TRAUMA',
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
    if (!TARGET_TASKS.includes(entry.id)) continue;
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

async function runCondition({ condition, tasks, oracles, verifierAdapter, modelConfig }) {
  const adapter = new RealModelAdapter({
    baseUrl: modelConfig.baseUrl,
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: modelConfig.temperature,
    seed: modelConfig.seed,
    promptMode: condition.promptMode,
  });

  const taskResults = [];

  for (const task of tasks) {
    const oracleFn = oracles[task.id];
    const attempts = [];
    const failureTransitions = [];
    let traumaHistory = [];
    let totalTokens = 0;
    let totalLatency = 0;
    let finalFailureClass = 'MODEL_FAILURE';
    let passedOnAttempt = null;

    for (let k = 1; k <= condition.maxAttempts; k++) {
      const startTime = Date.now();
      let candidateRes;
      try {
        candidateRes = await adapter.generateCandidate(task, k, traumaHistory);
      } catch (err) {
        // Adapter threw — treat as model error
        candidateRes = {
          candidate_code: '',
          raw_output: '',
          candidate_hash: '',
          prompt_tokens: 0,
          completion_tokens: 0,
          tokens: 0,
          latency_ms: Date.now() - startTime,
          model_error: true,
          model_timeout: err.message?.includes('timeout') || false,
        };
      }
      totalTokens += candidateRes.tokens || 0;
      totalLatency += candidateRes.latency_ms || 0;

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

      const failureClass = classifyAttempt({
        modelError: candidateRes.model_error || false,
        modelTimeout: candidateRes.model_timeout || false,
        rawOutput: candidateRes.raw_output,
        candidateCode: candidateRes.candidate_code,
        verifierPassed: verifierRes.passed,
        oracleExecuted,
        oraclePassed,
      });

      failureTransitions.push(failureClass);

      attempts.push({
        attempt: k,
        candidate_hash: candidateRes.candidate_hash,
        candidate_code: candidateRes.candidate_code,
        prompt_tokens: candidateRes.prompt_tokens || 0,
        completion_tokens: candidateRes.completion_tokens || 0,
        tokens: candidateRes.tokens,
        latency_ms: candidateRes.latency_ms,
        verifier_passed: verifierRes.passed,
        verifier_stage: verifierRes.stage,
        violation_class: verifierRes.violation_class,
        oracle_executed: oracleExecuted,
        oracle_passed: oraclePassed,
        failure_class: failureClass,
      });

      if (oraclePassed) {
        passedOnAttempt = k;
        finalFailureClass = 'PASS';
        break;
      }

      // Build trauma for retry
      if (condition.feedbackMode === 'TRAUMA') {
        if (!verifierRes.passed) {
          traumaHistory.push({
            trauma_id: verifierRes.trauma_id,
            candidate_hash: candidateRes.candidate_hash,
            attempt: k,
            stage: verifierRes.stage,
            violation_class: verifierRes.violation_class,
            location: verifierRes.location,
            constraint_rule: verifierRes.constraint_rule,
            invariant_broken: verifierRes.invariant_broken,
            remedy_hint: verifierRes.remedy_hint,
          });
        } else {
          // Oracle failure trauma
          traumaHistory.push({
            trauma_id: `TR_ORACLE_${createHash('sha256').update(candidateRes.candidate_code + k).digest('hex').slice(0, 8)}`,
            candidate_hash: candidateRes.candidate_hash,
            attempt: k,
            stage: 'RUNTIME_ERROR',
            violation_class: 'ORACLE_ASSERTION_FAIL',
            location: 'oracle',
            constraint_rule: 'RULE_ORACLE_PASS',
            invariant_broken: 'ORACLE_SPEC_MISMATCH',
            remedy_hint: 'Oracle assertion failed — check output matches expected',
          });
        }
      } else if (condition.feedbackMode === 'UNSTRUCTURED') {
        traumaHistory.push({
          error_message: `Attempt ${k} failed: ${failureClass}`,
        });
      }

      finalFailureClass = failureClass;
    }

    taskResults.push({
      task_id: task.id,
      family: task.family,
      difficulty: task.difficulty,
      failure_class: finalFailureClass,
      passed_on_attempt: passedOnAttempt,
      initial_pass: failureTransitions[0] === 'PASS',
      recovered_pass: passedOnAttempt !== null && passedOnAttempt > 1,
      failure_class_transition: failureTransitions,
      prompt_tokens: attempts.reduce((s, a) => s + (a.prompt_tokens || 0), 0),
      completion_tokens: attempts.reduce((s, a) => s + (a.completion_tokens || 0), 0),
      total_tokens: totalTokens,
      total_latency_ms: totalLatency,
      attempts_count: attempts.length,
      attempts,
    });
  }

  // Summary
  const counts = countByClass(taskResults);
  const rates = deriveRates(counts, tasks.length);
  const totalTokens = taskResults.reduce((s, r) => s + r.total_tokens, 0);
  const totalPromptTokens = taskResults.reduce((s, r) => s + r.prompt_tokens, 0);
  const totalCompletionTokens = taskResults.reduce((s, r) => s + r.completion_tokens, 0);
  const totalLatency = taskResults.reduce((s, r) => s + r.total_latency_ms, 0);

  const initialPasses = taskResults.filter(r => r.initial_pass).length;
  const recoveredPasses = taskResults.filter(r => r.recovered_pass).length;
  const anyPass = taskResults.filter(r => r.failure_class === 'PASS').length;
  const rsr = (anyPass - initialPasses) / Math.max(tasks.length - initialPasses, 1);

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
    initial_pass_rate: initialPasses / tasks.length,
    recovered_pass_rate: recoveredPasses / tasks.length,
    rsr,
    initial_passes: initialPasses,
    recovered_passes: recoveredPasses,
  };

  return {
    condition_id: condition.id,
    condition_name: condition.name,
    prompt_mode: condition.promptMode,
    max_attempts: condition.maxAttempts,
    feedback_mode: condition.feedbackMode,
    summary,
    task_results: taskResults,
  };
}

async function main() {
  console.log('🔬 Micro-Ablation Diagnostic: T002/T003 × A/B/D/E');
  console.log('===================================================\n');

  const modelConfig = {
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    provider: 'ollama',
    model: process.env.MODEL_NAME || 'qwen2.5-coder:7b',
    temperature: 0.0,
    seed: 42,
  };

  console.log(`Model: ${modelConfig.model}`);
  console.log(`Tasks: ${TARGET_TASKS.join(', ')}`);
  console.log(`Conditions: ${CONDITIONS.map(c => `${c.id}(${c.maxAttempts}att)`).join(', ')}\n`);

  const { manifest, tasks, oracles } = await loadTasks();
  console.log(`Loaded ${tasks.length} tasks, SHA-256 verified\n`);

  const verifierAdapter = new LinVerifierAdapter();
  const runId = `MICRO_ABLATION_${Date.now()}`;
  fs.mkdirSync(path.join(RUNS_DIR, runId), { recursive: true });

  const allResults = [];

  for (const condition of CONDITIONS) {
    console.log(`▶ Condition ${condition.id}: ${condition.name}`);

    // Unload between conditions
    if (allResults.length > 0) {
      await unloadAllModels(modelConfig.baseUrl, modelConfig.model);
    }

    const result = await runCondition({
      condition, tasks, oracles, verifierAdapter, modelConfig,
    });

    allResults.push(result);

    // Per-task output
    for (const tr of result.task_results) {
      const transitions = tr.failure_class_transition.join(' → ');
      const status = tr.failure_class === 'PASS'
        ? `✅ PASS (attempt ${tr.passed_on_attempt})`
        : `❌ ${tr.failure_class}`;
      console.log(`  ${tr.task_id}: ${status}  [${transitions}]  ${tr.total_tokens} tok`);
    }
    console.log('');
  }

  // === COMPARISON MATRIX ===
  console.log('\n📊 COMPARISON');
  console.log('='.repeat(80));

  // Header
  const cols = allResults.map(r => r.condition_id);
  console.log(`${'Task'.padEnd(8)}${cols.map(c => c.padEnd(12)).join('')}`);
  console.log('-'.repeat(8 + cols.length * 12));

  // Failure class per task per condition
  for (const tid of TARGET_TASKS) {
    let row = tid.padEnd(8);
    for (const result of allResults) {
      const tr = result.task_results.find(r => r.task_id === tid);
      if (tr) {
        const label = tr.failure_class === 'PASS'
          ? `PASS(${tr.passed_on_attempt})`
          : tr.failure_class;
        row += label.padEnd(12);
      } else {
        row += '-'.padEnd(12);
      }
    }
    console.log(row);
  }

  // Transition matrix
  console.log('\n📋 FAILURE CLASS TRANSITIONS');
  console.log('='.repeat(80));
  for (const result of allResults) {
    console.log(`\n  ${result.condition_id}: ${result.condition_name}`);
    for (const tr of result.task_results) {
      const transitions = tr.failure_class_transition.map((fc, i) => {
        const icon = fc === 'PASS' ? '✅' : '❌';
        return `${icon}k=${i + 1}:${fc}`;
      }).join('  →  ');
      console.log(`    ${tr.task_id}: ${transitions}`);
    }
  }

  // Aggregate metrics
  console.log('\n📈 AGGREGATE METRICS');
  console.log('='.repeat(80));
  console.table(allResults.map(r => ({
    'Cond': r.condition_id,
    'Oracle%': (r.summary.oracle_pass_rate * 100).toFixed(1),
    'Init%': (r.summary.initial_pass_rate * 100).toFixed(1),
    'Recov%': (r.summary.recovered_pass_rate * 100).toFixed(1),
    'RSR': r.summary.rsr.toFixed(2),
    'Prompt': r.summary.avg_prompt_tokens_per_task?.toFixed(0) ?? '-',
    'Comp': r.summary.avg_completion_tokens_per_task?.toFixed(0) ?? '-',
    'Total': r.summary.avg_tokens_per_task.toFixed(0),
  })));

  // Save results
  fs.writeFileSync(
    path.join(RUNS_DIR, runId, 'RESULTS.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), model: modelConfig.model, tasks: TARGET_TASKS, conditions: CONDITIONS.map(c => ({ id: c.id, name: c.name, maxAttempts: c.maxAttempts, feedbackMode: c.feedbackMode })), results: allResults }, null, 2)
  );

  // Key question
  console.log('\n🔑 KEY QUESTION:');
  console.log('  Does condition E (trauma retry) recover from ORACLE_FAILURE?');
  const eResult = allResults.find(r => r.condition_id === 'E');
  const bResult = allResults.find(r => r.condition_id === 'B');
  if (eResult && bResult) {
    for (const tid of TARGET_TASKS) {
      const eTr = eResult.task_results.find(r => r.task_id === tid);
      const bTr = bResult.task_results.find(r => r.task_id === tid);
      if (eTr && bTr) {
        const eStatus = eTr.failure_class === 'PASS' ? 'PASS' : eTr.failure_class;
        const bStatus = bTr.failure_class === 'PASS' ? 'PASS' : bTr.failure_class;
        const verdict = eTr.recovered_pass ? '🔄 RECOVERED' : (eTr.failure_class === 'PASS' ? '✅ INITIAL PASS' : '❌ NO RECOVERY');
        console.log(`  ${tid}: B=${bStatus}  E=${eStatus}  → ${verdict}`);
      }
    }
  }

  console.log(`\n💾 ${RUNS_DIR}/${runId}`);
}

main().catch(err => { console.error('❌ FATAL:', err); process.exit(1); });
