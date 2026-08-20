/**
 * run_e_trauma_repair_30_safe.mjs — Execução com streaming incremental de resultados por tarefa
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { CognitiveBenchmarkRunner } from './runner.mjs';
import { RealModelAdapter } from './real_model_adapter.mjs';
import { LinVerifierAdapter } from './lin_verifier_adapter.mjs';
import { LinClassARepairEngine } from './lin_class_a_repair.mjs';
import { calculateMetrics } from './metrics.mjs';

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';
const BASE_DIR = '/home/k/Downloads/lin-master/benchmarks/cognitive_ablation';
const RUNS_DIR = path.join(BASE_DIR, 'runs', 'E_TRAUMA_REPAIR_30_OFFICIAL');

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🔬 COGNITIVE ABLATION: SISTEMA E_TRAUMA_REPAIR (30 TAREFAS, k=3)');
  console.log('   Objetivo: Medir a Capacidade de Recuperação de Falhas (RSR)');
  console.log('══════════════════════════════════════════════════════════════');

  const manifestPath = path.join(BASE_DIR, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(manifest.global_sha256, EXPECTED_MANIFEST_SHA256);
  console.log(`🔒 Manifesto verificado: ${manifest.global_sha256.slice(0, 16)}...`);

  const tasks = [];
  const rawOracles = {};

  for (const entry of manifest.tasks) {
    const task = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'tasks', `${entry.id}.json`), 'utf-8'));
    tasks.push(task);
    const mod = await import(`file://${path.join(BASE_DIR, entry.oracle_entrypoint)}`);
    rawOracles[entry.id] = mod.oracle;
  }
  console.log(`📋 30 Tarefas e Oráculos carregados.`);

  const repairEngine = new LinClassARepairEngine();
  const verifierAdapter = new LinVerifierAdapter();

  const repairStats = {
    repair_attempts: 0,
    repair_successes: 0,
    repair_failures: 0,
    rules_applied: {}
  };

  const wrappedOracles = {};
  for (const task of tasks) {
    const rawFn = rawOracles[task.id];
    wrappedOracles[task.id] = async (t, candidateRes) => {
      let res = await rawFn(t, candidateRes);
      if (res.passed) return res;

      repairStats.repair_attempts++;
      const rep = repairEngine.repair(candidateRes.candidate_code);
      if (!rep.repaired) {
        repairStats.repair_failures++;
        return res;
      }

      for (const r of rep.applied_rules) {
        repairStats.rules_applied[r.rule_id] = (repairStats.rules_applied[r.rule_id] || 0) + 1;
      }

      const repairedCandidate = {
        ...candidateRes,
        candidate_code: rep.repaired_code
      };

      const repairedRes = await rawFn(t, repairedCandidate);
      if (repairedRes.passed) {
        repairStats.repair_successes++;
        candidateRes.candidate_code = rep.repaired_code;
        candidateRes.repair_applied = rep.applied_rules;
        return repairedRes;
      } else {
        repairStats.repair_failures++;
        return res;
      }
    };
  }

  const modelAdapter = new RealModelAdapter({
    baseUrl: 'http://localhost:11434',
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
    temperature: 0.0,
    seed: 42,
    promptMode: 'LIN_TRAUMA'
  });

  const meta = await modelAdapter.getModelMetadata();

  const runner = new CognitiveBenchmarkRunner({
    modelAdapter,
    verifierAdapter,
    options: {
      maxAttempts: 3,
      feedbackMode: 'TRAUMA'
    }
  });

  fs.mkdirSync(RUNS_DIR, { recursive: true });

  const taskResults = [];
  console.log(`\n▶ Executando tarefas incrementalmente...`);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] Task ${task.id}... `);
    const oracleFn = wrappedOracles[task.id];
    const res = await runner.runTask(task, oracleFn);
    console.log(`Outcome: ${res.outcome} (attempts: ${res.attempts_count})`);
    taskResults.push(res);

    // Salvar progresso incrementalmente
    fs.writeFileSync(
      path.join(RUNS_DIR, 'task_results_partial.json'),
      JSON.stringify(taskResults, null, 2)
    );
  }

  const summary = calculateMetrics(taskResults);

  fs.writeFileSync(
    path.join(RUNS_DIR, 'config.json'),
    JSON.stringify({
      system_id: 'E_TRAUMA_REPAIR',
      system_name: 'LIN TRAUMA Loop + Classe A Repair (k=3)',
      prompt_mode: 'LIN_TRAUMA',
      feedback_mode: 'TRAUMA',
      max_attempts: 3,
      model_metadata: meta,
      manifest_sha256: manifest.global_sha256,
      repair_stats: repairStats
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(RUNS_DIR, 'task_results.json'),
    JSON.stringify(taskResults, null, 2)
  );

  fs.writeFileSync(
    path.join(RUNS_DIR, 'metrics.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n📊 ══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADOS OFICIAIS DO SISTEMA E_TRAUMA_REPAIR (30 TAREFAS, k=3)');
  console.log('📊 ══════════════════════════════════════════════════════════════');
  console.log(`  pass@1:  ${(summary.pass_at_1 * 100).toFixed(1)}% (${summary.initial_pass_p1}/30)`);
  console.log(`  pass@k:  ${(summary.pass_at_k * 100).toFixed(1)}% (${summary.initial_pass_p1 + summary.recovered_pass_pr}/30)`);
  console.log(`  P_1 (Sucesso Inicial):     ${summary.initial_pass_p1}`);
  console.log(`  P_R (Recuperadas Trauma):  ${summary.recovered_pass_pr}`);
  console.log(`  F_F (Falhas Irrecuperáveis): ${summary.final_fail_ff}`);
  console.log(`  RSR (Recovery Rate):       ${summary.recovery_success_rate !== null ? (summary.recovery_success_rate * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  Tokens Médios / Sucesso:   ${summary.avg_tokens_per_pass}`);
  console.log(`  🔧 Reparos Classe A:       ${repairStats.repair_successes}/${repairStats.repair_attempts} sucessos`);

  console.log(`\n💾 Artefatos gravados em: ${RUNS_DIR}`);
}

main().catch(err => {
  console.error('❌ ERRO:', err);
  process.exit(1);
});
