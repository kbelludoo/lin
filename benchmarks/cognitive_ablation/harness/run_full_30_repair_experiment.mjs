/**
 * run_full_30_repair_experiment.mjs — Execução Científica Completa das 30 Tarefas
 * 
 * Compara diretamente:
 * 1. Sistema B: JS Baseline (Zero-Shot)
 * 2. Sistema C: LIN Zero-Shot Puro (sem repair)
 * 3. Sistema C_REPAIR: LIN Zero-Shot + Classe A Repair Engine
 * 4. Sistema E_TRAUMA: LIN Full Cognitive + TRAUMA (k=3)
 * 5. Sistema E_TRAUMA_REPAIR: LIN Full Cognitive + TRAUMA + Classe A Repair (k=3)
 * 
 * Mede:
 * - Δ pass@1 causal da camada determinística
 * - RSR (Recovery Success Rate)
 * - Taxa de falhas mecânicas resolvidas deterministicamente
 * - Tokens e chamadas LLM evitadas
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
const RUNS_DIR = path.join(BASE_DIR, 'runs', `FULL_30_EXPERIMENT_${Date.now()}`);

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🧪 COGNITIVE ABLATION BENCHMARK: 30 TAREFAS COMPLETAS (QWEN 7B)');
  console.log('   Objetivo: Medir o Ganho Causal da Repair Engine Classe A');
  console.log('══════════════════════════════════════════════════════════════');

  // 1. Verificação do Manifesto Congelado
  const manifestPath = path.join(BASE_DIR, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(
    manifest.global_sha256,
    EXPECTED_MANIFEST_SHA256,
    'VIOLAÇÃO DE INTEGRIDADE: O SHA-256 do manifesto não coincide com o dataset congelado!'
  );
  console.log(`🔒 Manifesto verificado: ${manifest.global_sha256.slice(0, 16)}... (${manifest.total_tasks} tarefas)`);

  // 2. Carregamento das 30 Tarefas e Oráculos Independentes
  const tasks = [];
  const rawOracles = {};

  for (const entry of manifest.tasks) {
    const task = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'tasks', `${entry.id}.json`), 'utf-8'));
    tasks.push(task);
    const mod = await import(`file://${path.join(BASE_DIR, entry.oracle_entrypoint)}`);
    rawOracles[entry.id] = mod.oracle;
  }
  console.log(`📋 30 Tarefas e 30 Oráculos Independentes carregados com sucesso.`);

  const repairEngine = new LinClassARepairEngine();
  const verifierAdapter = new LinVerifierAdapter();

  // Função para criar oráculos com ou sem Repair Interceptor
  function createOracleSuite(enableRepair) {
    const suite = {};
    const stats = {
      repair_attempts: 0,
      repair_successes: 0,
      repair_failures: 0,
      rules_applied: {}
    };

    for (const task of tasks) {
      const rawFn = rawOracles[task.id];
      if (!enableRepair) {
        suite[task.id] = rawFn;
      } else {
        suite[task.id] = async (t, candidateRes) => {
          let res = await rawFn(t, candidateRes);
          if (res.passed) return res;

          // Se falhou no oráculo, tenta Classe A Repair
          stats.repair_attempts++;
          const rep = repairEngine.repair(candidateRes.candidate_code);
          if (!rep.repaired) {
            stats.repair_failures++;
            return res;
          }

          for (const r of rep.applied_rules) {
            stats.rules_applied[r.rule_id] = (stats.rules_applied[r.rule_id] || 0) + 1;
          }

          const repairedCandidate = {
            ...candidateRes,
            candidate_code: rep.repaired_code
          };

          const repairedRes = await rawFn(t, repairedCandidate);
          if (repairedRes.passed) {
            stats.repair_successes++;
            candidateRes.candidate_code = rep.repaired_code;
            candidateRes.repair_applied = rep.applied_rules;
            return repairedRes;
          } else {
            stats.repair_failures++;
            return res;
          }
        };
      }
    }
    return { suite, stats };
  }

  // Matriz de Sistemas a Testar nas 30 Tarefas
  const systems = [
    {
      id: 'B',
      name: 'JS Baseline (Zero-Shot)',
      promptMode: 'NATURAL_JS',
      feedbackMode: 'NONE',
      maxAttempts: 1,
      enableRepair: false
    },
    {
      id: 'C_PURE',
      name: 'LIN Zero-Shot Puro (sem repair)',
      promptMode: 'LIN_ZERO_SHOT',
      feedbackMode: 'NONE',
      maxAttempts: 1,
      enableRepair: false
    },
    {
      id: 'C_REPAIR',
      name: 'LIN Zero-Shot + Classe A Repair',
      promptMode: 'LIN_ZERO_SHOT',
      feedbackMode: 'NONE',
      maxAttempts: 1,
      enableRepair: true
    },
    {
      id: 'E_TRAUMA_REPAIR',
      name: 'LIN TRAUMA Loop + Classe A Repair (k=3)',
      promptMode: 'LIN_TRAUMA',
      feedbackMode: 'TRAUMA',
      maxAttempts: 3,
      enableRepair: true
    }
  ];

  const fullResults = {};
  const repairMetricsBySystem = {};

  for (const sys of systems) {
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`▶ Executando Sistema ${sys.id}: ${sys.name} (30 Tarefas)`);
    console.log(`──────────────────────────────────────────────────────────────`);

    const { suite: oracleSuite, stats: sysRepairStats } = createOracleSuite(sys.enableRepair);

    const modelAdapter = new RealModelAdapter({
      baseUrl: 'http://localhost:11434',
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      temperature: 0.0,
      seed: 42,
      promptMode: sys.promptMode
    });

    const meta = await modelAdapter.getModelMetadata();

    const runner = new CognitiveBenchmarkRunner({
      modelAdapter,
      verifierAdapter,
      options: {
        maxAttempts: sys.maxAttempts,
        feedbackMode: sys.feedbackMode
      }
    });

    const runResult = await runner.runBenchmark({
      tasks,
      oracles: oracleSuite,
      manifestSha256: manifest.global_sha256,
      systemId: sys.id,
      modelId: 'qwen2.5-coder:7b'
    });

    runResult.model_metadata = meta;
    fullResults[sys.id] = runResult.summary;
    repairMetricsBySystem[sys.id] = sysRepairStats;

    // Salvar artefatos imutáveis do run
    const sysRunDir = path.join(RUNS_DIR, sys.id);
    fs.mkdirSync(sysRunDir, { recursive: true });

    fs.writeFileSync(
      path.join(sysRunDir, 'config.json'),
      JSON.stringify({
        system_id: sys.id,
        system_name: sys.name,
        prompt_mode: sys.promptMode,
        feedback_mode: sys.feedbackMode,
        max_attempts: sys.maxAttempts,
        enable_repair: sys.enableRepair,
        repair_stats: sysRepairStats,
        model_metadata: meta,
        manifest_sha256: manifest.global_sha256
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(sysRunDir, 'task_results.json'),
      JSON.stringify(runResult.task_results, null, 2)
    );

    fs.writeFileSync(
      path.join(sysRunDir, 'metrics.json'),
      JSON.stringify(runResult.summary, null, 2)
    );

    console.log(`  Resumo Sistema ${sys.id}:`);
    console.log(`    pass@1: ${(runResult.summary.pass_at_1 * 100).toFixed(1)}% | pass@k: ${(runResult.summary.pass_at_k * 100).toFixed(1)}%`);
    console.log(`    P1: ${runResult.summary.initial_pass_p1} | PR: ${runResult.summary.recovered_pass_pr} | FF: ${runResult.summary.final_fail_ff}`);
    console.log(`    RSR: ${runResult.summary.recovery_success_rate !== null ? (runResult.summary.recovery_success_rate * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`    Tokens Médios por Sucesso: ${runResult.summary.avg_tokens_per_pass}`);
    if (sys.enableRepair) {
      console.log(`    🔧 Reparos: ${sysRepairStats.repair_successes}/${sysRepairStats.repair_attempts} sucessos`);
    }
  }

  // Tabela Consolidada Final
  console.log('\n📊 ══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADOS OFICIAIS DO BENCHMARK DE 30 TAREFAS (CONGELADO)');
  console.log('📊 ══════════════════════════════════════════════════════════════');
  console.table(
    Object.entries(fullResults).map(([sysId, s]) => ({
      'Sistema': sysId,
      'pass@1': `${(s.pass_at_1 * 100).toFixed(1)}%`,
      'pass@k': `${(s.pass_at_k * 100).toFixed(1)}%`,
      'P1': s.initial_pass_p1,
      'PR': s.recovered_pass_pr,
      'FF': s.final_fail_ff,
      'RSR': s.recovery_success_rate !== null ? `${(s.recovery_success_rate * 100).toFixed(1)}%` : 'N/A',
      'Avg Tokens': s.avg_tokens_per_pass
    }))
  );

  // Consolidação de métricas do Repair Engine
  console.log('\n🔧 ══════════════════════════════════════════════════════════════');
  console.log('🔧 RESUMO DAS MÉTRICAS DA REPAIR ENGINE CLASSE A');
  console.log('🔧 ══════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(repairMetricsBySystem, null, 2));

  fs.writeFileSync(
    path.join(RUNS_DIR, 'FINAL_SUMMARY.json'),
    JSON.stringify({
      manifest_sha256: manifest.global_sha256,
      total_tasks: 30,
      systems_summary: fullResults,
      repair_metrics: repairMetricsBySystem
    }, null, 2)
  );

  console.log(`\n💾 Todos os artefatos imutáveis foram gravados em: ${RUNS_DIR}`);
}

main().catch(err => {
  console.error('❌ ERRO NA EXECUÇÃO DE 30 TAREFAS:', err);
  process.exit(1);
});
