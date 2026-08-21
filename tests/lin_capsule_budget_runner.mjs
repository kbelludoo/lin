import { DIVERSE_TASK_CORPUS } from './lin_capsule_semantic_sufficiency_corpus.mjs';
import { CONTEXT_BUDGETS, executeTrialUnderBudget } from './lin_capsule_budget_frontier.mjs';

console.log('================================================================');
console.log(' LIN_CAPSULE_BUDGET_FRONTIER: MATRIZ DE 10 TAREFAS × 5 BUDGETS ');
console.log('================================================================\n');

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;

// Selected representative tasks across diversity spectrum to run live
const tasksToEvaluate = [
  DIVERSE_TASK_CORPUS[0], // Task 1: Compression algorithm (LZ4)
  DIVERSE_TASK_CORPUS[2], // Task 3: Gate D Envelope
  DIVERSE_TASK_CORPUS[4], // Task 5: Chunking properties
  DIVERSE_TASK_CORPUS[8], // Task 9: Provenance records
];

console.log(`[CONFIGURAÇÃO]`);
console.log(`- Modelo: ${model}`);
console.log(`- Budgets de Contexto: ${CONTEXT_BUDGETS.join(', ')} tokens`);
console.log(`- Tarefas Avaliadas: ${tasksToEvaluate.length}`);
console.log(`- Total de Ensaios Planejados: ${tasksToEvaluate.length * CONTEXT_BUDGETS.length * 2}\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set.');
  process.exit(1);
}

const matrixResults = [];

for (const budget of CONTEXT_BUDGETS) {
  console.log(`\n▶ [BUDGET FRONTIER: ${budget} TOKENS]`);

  for (const task of tasksToEvaluate) {
    process.stdout.write(`  Task ${task.id} | Budget ${budget} | Group A: `);
    const resA = await executeTrialUnderBudget({ task, group: 'GROUP_A_RAW_TREE', budget, model, apiEndpoint: endpoint, apiKey });
    console.log(`${resA.oracle_pass ? 'PASS' : 'FAIL'} (${resA.prompt_tokens} tok, ${resA.duration_ms}ms)`);
    matrixResults.push(resA);

    process.stdout.write(`  Task ${task.id} | Budget ${budget} | Group B: `);
    const resB = await executeTrialUnderBudget({ task, group: 'GROUP_B_CAPSULE', budget, model, apiEndpoint: endpoint, apiKey });
    console.log(`${resB.oracle_pass ? 'PASS' : 'FAIL'} (${resB.prompt_tokens} tok, ${resB.duration_ms}ms)`);
    matrixResults.push(resB);
  }
}

// Produce Frontier Grid
console.log('\n================================================================');
console.log('       MATRIZ EMPÍRICA DA FRONTEIRA DE ORÇAMENTO (A vs B)       ');
console.log('================================================================');
console.log('| Budget  | Group A (Raw Tree) Pass Rate | Group B (Capsule) Pass Rate |');
console.log('|:--------|:-----------------------------|:----------------------------|');

for (const budget of CONTEXT_BUDGETS) {
  const trialsA = matrixResults.filter(r => r.group === 'GROUP_A_RAW_TREE' && r.budget === budget);
  const trialsB = matrixResults.filter(r => r.group === 'GROUP_B_CAPSULE' && r.budget === budget);

  const passA = trialsA.filter(r => r.oracle_pass).length;
  const passB = trialsB.filter(r => r.oracle_pass).length;

  const rateA = `${passA}/${trialsA.length} (${((passA/trialsA.length)*100).toFixed(0)}%)`;
  const rateB = `${passB}/${trialsB.length} (${((passB/trialsB.length)*100).toFixed(0)}%)`;

  console.log(`| ${budget.toString().padEnd(7)} | ${rateA.padEnd(28)} | ${rateB.padEnd(27)} |`);
}

console.log('================================================================\n');
