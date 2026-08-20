/**
 * run_pilot_1.mjs — Execução do Experimento Pilot-1 (Pilot-0 + Classe A Repair Engine)
 * 
 * Mantém o mesmo modelo (qwen2.5-coder:7b), mesmas 5 tarefas, mesmo oráculo.
 * Variável: Adição da camada determinística LinClassARepairEngine entre o Modelo e o Oracle.
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
const RUNS_DIR = path.join(BASE_DIR, 'runs', 'COGNITIVE_ABLATION_PILOT_1');

async function main() {
  console.log('🚀 Iniciando Experimento PILOT-1 (com Classe A Repair Engine)...');

  // 1. Verificação de integridade estrita do Dataset (SHA-256)
  const manifestPath = path.join(BASE_DIR, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(
    manifest.global_sha256,
    EXPECTED_MANIFEST_SHA256,
    'VIOLAÇÃO DE INTEGRIDADE: O SHA-256 do manifesto não coincide com a versão congelada!'
  );
  console.log(`🔒 Manifesto verificado com sucesso: ${manifest.global_sha256.slice(0, 16)}...`);

  // 2. Seleção das mesmas 5 tarefas do Pilot-0
  const pilotTaskIds = ['T001', 'T007', 'T013', 'T019', 'T025'];
  const tasks = [];
  const oracles = {};

  for (const id of pilotTaskIds) {
    const task = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'tasks', `${id}.json`), 'utf-8'));
    tasks.push(task);
    const mod = await import(`file://${path.join(BASE_DIR, 'oracles', `oracle_${id}.mjs`)}`);
    oracles[id] = mod.oracle;
  }
  console.log(`📋 5 Tarefas carregadas: ${pilotTaskIds.join(', ')}`);

  const repairEngine = new LinClassARepairEngine();
  const verifierAdapter = new LinVerifierAdapter();

  // Envolve os oracles com o interceptor de Repair Classe A
  const wrappedOracles = {};
  const repairMetrics = {
    repair_attempts: 0,
    repair_successes: 0,
    repair_failures: 0,
    rules_applied: {}
  };

  for (const id of pilotTaskIds) {
    const rawOracle = oracles[id];
    wrappedOracles[id] = async (task, candidateRes) => {
      // 1. Tenta o oráculo com o código original
      let res = await rawOracle(task, candidateRes);
      if (res.passed) {
        return res;
      }

      // 2. Se falhou, aplica o Repair Engine Classe A
      repairMetrics.repair_attempts++;
      const rep = repairEngine.repair(candidateRes.candidate_code);
      
      if (!rep.repaired) {
        repairMetrics.repair_failures++;
        return res; // Não há reparo determinístico aplicável
      }

      // Registra regras aplicadas
      for (const r of rep.applied_rules) {
        repairMetrics.rules_applied[r.rule_id] = (repairMetrics.rules_applied[r.rule_id] || 0) + 1;
      }

      // 3. Testa novamente com o código reparado deterministicamente
      const repairedCandidate = {
        ...candidateRes,
        candidate_code: rep.repaired_code
      };

      const repairedOracleRes = await rawOracle(task, repairedCandidate);
      if (repairedOracleRes.passed) {
        repairMetrics.repair_successes++;
        candidateRes.candidate_code = rep.repaired_code; // Atualiza para o código reparado
        candidateRes.repair_applied = rep.applied_rules;
        return repairedOracleRes;
      } else {
        repairMetrics.repair_failures++;
        return res;
      }
    };
  }

  // 3. Matriz de Sistemas para o Pilot-1
  const systems = [
    {
      id: 'B',
      name: '8B JS Baseline (Zero-Shot)',
      promptMode: 'NATURAL_JS',
      feedbackMode: 'NONE',
      maxAttempts: 1
    },
    {
      id: 'C_REPAIR',
      name: '8B LIN Representation + Classe A Repair',
      promptMode: 'LIN_ZERO_SHOT',
      feedbackMode: 'NONE',
      maxAttempts: 1
    },
    {
      id: 'D_REPAIR',
      name: '8B LIN Unstructured Loop + Classe A Repair',
      promptMode: 'LIN_UNSTRUCTURED',
      feedbackMode: 'UNSTRUCTURED',
      maxAttempts: 3
    },
    {
      id: 'E_REPAIR',
      name: '8B LIN Full Cognitive + TRAUMA + Classe A Repair',
      promptMode: 'LIN_TRAUMA',
      feedbackMode: 'TRAUMA',
      maxAttempts: 3
    }
  ];

  const pilotSummary = {};

  for (const sys of systems) {
    console.log(`\n======================================================`);
    console.log(`▶ Executando Sistema ${sys.id}: ${sys.name}`);
    console.log(`======================================================`);

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
      oracles: wrappedOracles,
      manifestSha256: manifest.global_sha256,
      systemId: sys.id,
      modelId: 'qwen2.5-coder:7b'
    });

    runResult.model_metadata = meta;

    // Salvar artefatos
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

    pilotSummary[sys.id] = runResult.summary;

    console.log(`  Resultado Sistema ${sys.id}:`);
    console.log(`    pass@1: ${runResult.summary.pass_at_1}`);
    console.log(`    pass@k: ${runResult.summary.pass_at_k}`);
    console.log(`    RSR: ${runResult.summary.recovery_success_rate}`);
    console.log(`    Tokens Médios por Sucesso: ${runResult.summary.avg_tokens_per_pass}`);
  }

  // Resumo Comparativo do Pilot-1
  console.log('\n📊 ======================================================');
  console.log('📊 RESUMO COMPARATIVO DO TESTE PILOT-1 (COM REPAIR CLASSE A)');
  console.log('📊 ======================================================');
  console.table(
    Object.entries(pilotSummary).map(([sysId, s]) => ({
      'Sistema': sysId,
      'pass@1': s.pass_at_1,
      'pass@k': s.pass_at_k,
      'P1': s.initial_pass_p1,
      'PR': s.recovered_pass_pr,
      'FF': s.final_fail_ff,
      'RSR': s.recovery_success_rate ?? 'N/A',
      'Avg Tokens': s.avg_tokens_per_pass
    }))
  );

  console.log('\n🔧 ======================================================');
  console.log('🔧 MÉTRICAS DA REPAIR ENGINE CLASSE A');
  console.log('🔧 ======================================================');
  console.log(`  Tentativas de Reparo: ${repairMetrics.repair_attempts}`);
  console.log(`  Reparos com Sucesso:  ${repairMetrics.repair_successes}`);
  console.log(`  Falhas de Reparo:     ${repairMetrics.repair_failures}`);
  console.log(`  Regras Aplicadas:`, JSON.stringify(repairMetrics.rules_applied, null, 2));

  fs.writeFileSync(
    path.join(RUNS_DIR, 'REPAIR_METRICS.json'),
    JSON.stringify(repairMetrics, null, 2)
  );

  console.log(`\n💾 Artefatos do Pilot-1 gravados em: ${RUNS_DIR}`);
}

main().catch(err => {
  console.error('❌ ERRO NO PILOT-1:', err);
  process.exit(1);
});
