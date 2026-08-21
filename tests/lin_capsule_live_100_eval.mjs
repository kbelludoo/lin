import { DISTRIBUTED_TASK_CORPUS } from './lin_capsule_distributed_corpus.mjs';
import { executeDistributedTrial } from './lin_capsule_distributed_runner.mjs';

console.log('================================================================');
console.log('  LIN_CAPSULE: 10 TAREFAS × 5 BUDGETS × 2 GRUPOS + CONTROLE     ');
console.log('================================================================\n');

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;

const BUDGETS = [1024, 2048, 4096, 8192, 16384];

console.log(`[CONFIGURAÇÃO]`);
console.log(`- Modelo: ${model}`);
console.log(`- Tarefas: ${DISTRIBUTED_TASK_CORPUS.length} (Declarativas, sem valores explícitos no prompt)`);
console.log(`- Faixas de Orçamento: ${BUDGETS.join(', ')} tokens`);
console.log(`- Grupos: RAW (Árvore Distribuída com alocador), CAPSULE (Projeção Semântica), CONTROL (Teto Ideal)\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set.');
  process.exit(1);
}

const allResults = [];

// 1. Executar Grupo de Controle (Teto de Desempenho para as 10 tarefas)
console.log('▶ [FASE 1: GRUPO DE CONTROLE - TETO DE DESEMPENHO (10 Tarefas)]');
for (const task of DISTRIBUTED_TASK_CORPUS) {
  process.stdout.write(`  Control | ${task.id}: `);
  const res = await executeDistributedTrial({ task, group: 'CONTROL', model, apiEndpoint: endpoint, apiKey });
  console.log(`${res.oracle_pass ? 'PASS' : 'FAIL'} (${res.prompt_tokens} tok, ${res.duration_ms}ms)`);
  allResults.push(res);
}

// 2. Executar Matriz de Budgets (RAW vs CAPSULE)
console.log('\n▶ [FASE 2: MATRIZ DE FRONTEIRA RAW vs CAPSULE (10 Tarefas × 5 Budgets)]');
for (const budget of BUDGETS) {
  console.log(`\n  --- BUDGET: ${budget} TOKENS ---`);
  for (const task of DISTRIBUTED_TASK_CORPUS) {
    // RAW
    process.stdout.write(`  Task ${task.id} | B=${budget} | RAW:     `);
    const resRaw = await executeDistributedTrial({ task, group: 'RAW', budget, model, apiEndpoint: endpoint, apiKey });
    console.log(`${resRaw.oracle_pass ? 'PASS' : 'FAIL'} (${resRaw.prompt_tokens} tok, ${resRaw.duration_ms}ms)`);
    allResults.push(resRaw);

    // CAPSULE
    process.stdout.write(`  Task ${task.id} | B=${budget} | CAPSULE: `);
    const resCap = await executeDistributedTrial({ task, group: 'CAPSULE', budget, model, apiEndpoint: endpoint, apiKey });
    console.log(`${resCap.oracle_pass ? 'PASS' : 'FAIL'} (${resCap.prompt_tokens} tok, ${resCap.duration_ms}ms)`);
    allResults.push(resCap);
  }
}

// Salva o log bruto completo em JSON para auditabilidade
import fs from 'node:fs';
fs.writeFileSync('storage/lin_capsule_100_trials_raw.json', JSON.stringify(allResults, null, 2));

console.log('\n================================================================');
console.log('               MATRIZ CONSOLIDADA DA CAMPANHA                   ');
console.log('================================================================');
console.log('| Budget  | RAW Pass Rate       | CAPSULE Pass Rate   | CONTROL (Teto) |');
console.log('|:--------|:--------------------|:--------------------|:---------------|');

const controlPass = allResults.filter(r => r.group === 'CONTROL' && r.oracle_pass).length;
const controlTotal = allResults.filter(r => r.group === 'CONTROL').length;
const controlStr = `${controlPass}/${controlTotal} (${((controlPass/controlTotal)*100).toFixed(0)}%)`;

for (const budget of BUDGETS) {
  const rawTrials = allResults.filter(r => r.group === 'RAW' && r.budget === budget);
  const capTrials = allResults.filter(r => r.group === 'CAPSULE' && r.budget === budget);

  const rawPass = rawTrials.filter(r => r.oracle_pass).length;
  const capPass = capTrials.filter(r => r.oracle_pass).length;

  const rawRate = `${rawPass}/${rawTrials.length} (${((rawPass/rawTrials.length)*100).toFixed(0)}%)`;
  const capRate = `${capPass}/${capTrials.length} (${((capPass/capTrials.length)*100).toFixed(0)}%)`;

  console.log(`| ${budget.toString().padEnd(7)} | ${rawRate.padEnd(19)} | ${capRate.padEnd(19)} | ${controlStr.padEnd(14)} |`);
}
console.log('================================================================\n');
