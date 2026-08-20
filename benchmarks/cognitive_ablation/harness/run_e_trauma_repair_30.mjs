/**
 * run_e_trauma_repair_30.mjs — Execução focada do Sistema E_TRAUMA_REPAIR nas 30 tarefas (k=3)
 * 
 * Mede:
 * - pass@1 vs pass@k (taxa de recuperação pós-falha)
 * - RSR (Recovery Success Rate) sobre as 14 falhas restantes
 * - P_1 (sucessos 1ª vez), P_R (recuperadas via trauma), F_F (falhas irrecuperáveis)
 * - Classificação das falhas finais: Classe B pura (semântica) vs falhas de loop
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { CognitiveBenchmarkRunner } from './runner.mjs';
import { RealModelAdapter } from './real_model_adapter.mjs';
import { LinVerifierAdapter } from './lin_verifier_adapter.mjs';
import { LinClassARepairEngine } from './lin_class_a_repair.mjs';

const EXPECTED_MANIFEST_SHA256 = 'd3951769e4f9d210657a93659deee8b3ccc611e2f0f309373bc8fa358bec3061';
const BASE_DIR = '/home/k/Downloads/lin-master/benchmarks/cognitive_ablation';
const RUNS_DIR = path.join(BASE_DIR, 'runs', 'E_TRAUMA_REPAIR_30_OFFICIAL');

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🔬 COGNITIVE ABLATION: SISTEMA E_TRAUMA_REPAIR (30 TAREFAS, k=3)');
  console.log('   Objetivo: Medir a Capacidade de Recuperação de Falhas (RSR)');
  console.log('══════════════════════════════════════════════════════════════');

  // 1. Verificação do Manifesto
  const manifestPath = path.join(BASE_DIR, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(
    manifest.global_sha256,
    EXPECTED_MANIFEST_SHA256,
    'VIOLAÇÃO DE INTEGRIDADE: O SHA-256 do manifesto não coincide com o dataset congelado!'
  );
  console.log(`🔒 Manifesto verificado: ${manifest.global_sha256.slice(0, 16)}...`);

  // 2. Carregar Tarefas e Oráculos Independentes
  const tasks = [];
  const rawOracles = {};

  for (const entry of manifest.tasks) {
    const task = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'tasks', `${entry.id}.json`), 'utf-8'));
    tasks.push(task);
    const mod = await import(`file://${path.join(BASE_DIR, entry.oracle_entrypoint)}`);
    rawOracles[entry.id] = mod.oracle;
  }
  console.log(`📋 30 Tarefas e Oráculos carregados com sucesso.`);

  const repairEngine = new LinClassARepairEngine();
  const verifierAdapter = new LinVerifierAdapter();

  const repairStats = {
    repair_attempts: 0,
    repair_successes: 0,
    repair_failures: 0,
    rules_applied: {}
  };

  // Envolve os oráculos com a Repair Engine Classe A
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

  console.log(`\n▶ Executando Sistema E_TRAUMA_REPAIR em 30 tarefas com k=3...`);
  const runResult = await runner.runBenchmark({
    tasks,
    oracles: wrappedOracles,
    manifestSha256: manifest.global_sha256,
    systemId: 'E_TRAUMA_REPAIR',
    modelId: 'qwen2.5-coder:7b'
  });

  runResult.model_metadata = meta;
  runResult.repair_stats = repairStats;

  // Salvar artefatos
  fs.mkdirSync(RUNS_DIR, { recursive: true });

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
    JSON.stringify(runResult.task_results, null, 2)
  );

  fs.writeFileSync(
    path.join(RUNS_DIR, 'metrics.json'),
    JSON.stringify(runResult.summary, null, 2)
  );

  console.log('\n📊 ══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADOS OFICIAIS DO SISTEMA E_TRAUMA_REPAIR (30 TAREFAS, k=3)');
  console.log('📊 ══════════════════════════════════════════════════════════════');
  console.log(`  pass@1:  ${(runResult.summary.pass_at_1 * 100).toFixed(1)}% (${runResult.summary.initial_pass_p1}/30)`);
  console.log(`  pass@k:  ${(runResult.summary.pass_at_k * 100).toFixed(1)}% (${runResult.summary.initial_pass_p1 + runResult.summary.recovered_pass_pr}/30)`);
  console.log(`  P_1 (Sucesso Inicial):     ${runResult.summary.initial_pass_p1}`);
  console.log(`  P_R (Recuperadas Trauma):  ${runResult.summary.recovered_pass_pr}`);
  console.log(`  F_F (Falhas Irrecuperáveis): ${runResult.summary.final_fail_ff}`);
  console.log(`  RSR (Recovery Rate):       ${runResult.summary.recovery_success_rate !== null ? (runResult.summary.recovery_success_rate * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  Tokens Médios / Sucesso:   ${runResult.summary.avg_tokens_per_pass}`);
  console.log(`  🔧 Reparos Classe A:       ${repairStats.repair_successes}/${repairStats.repair_attempts} sucessos`);

  console.log(`\n💾 Artefatos gravados em: ${RUNS_DIR}`);
}

main().catch(err => {
  console.error('❌ ERRO:', err);
  process.exit(1);
});
