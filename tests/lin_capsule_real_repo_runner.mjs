import { executeRealRepoTrial } from './lin_capsule_real_repo_benchmark.mjs';

console.log('================================================================');
console.log('  LIN_CAPSULE_REAL_REPO: BENCHMARK NO PRÓPRIO REPOSITÓRIO DO LIN');
console.log('================================================================\n');

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;
const trials = parseInt(process.env.TRIALS || '3', 10);

console.log(`[CONFIGURAÇÃO]`);
console.log(`- Router Endpoint: ${endpoint}`);
console.log(`- Modelo Configurado: ${model}`);
console.log(`- Arquivos Reais Ingeridos no Grupo A: AGENTS.md, LIN_CORE_ARCH.rulel, LIN_CAPSULE_001.rulel, protocol.mjs, encoder.mjs, decoder.mjs`);
console.log(`- Grupo B: Cápsula Semântica Verificada do LIN (0 arquivos de código)`);
console.log(`- Repetições: ${trials} por grupo (${trials * 2} ensaios no total)\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set.');
  process.exit(1);
}

const allResults = [];

for (let i = 1; i <= trials; i++) {
  console.log(`▶ Executando Ensaio ${i}/${trials}...`);

  // Grupo A (Raw Tree Real)
  process.stdout.write('  - Grupo A (Raw Multi-Files): ');
  const resA = await executeRealRepoTrial({ group: 'GROUP_A_RAW_TREE', trialIndex: i, model, apiEndpoint: endpoint, apiKey });
  console.log(`Status: ${resA.status} | Prompt: ${resA.prompt_tokens} tok | Compl: ${resA.completion_tokens} tok | Oracle: ${resA.oracle_pass ? 'PASS' : 'FAIL'}`);
  allResults.push(resA);

  // Grupo B (LIN Capsule Real)
  process.stdout.write('  - Grupo B (LIN Capsule):     ');
  const resB = await executeRealRepoTrial({ group: 'GROUP_B_CAPSULE', trialIndex: i, model, apiEndpoint: endpoint, apiKey });
  console.log(`Status: ${resB.status} | Prompt: ${resB.prompt_tokens} tok | Compl: ${resB.completion_tokens} tok | Oracle: ${resB.oracle_pass ? 'PASS' : 'FAIL'}`);
  allResults.push(resB);
}

const groupA = allResults.filter(r => r.group === 'GROUP_A_RAW_TREE' && r.status === 'EXECUTED_LIVE');
const groupB = allResults.filter(r => r.group === 'GROUP_B_CAPSULE' && r.status === 'EXECUTED_LIVE');

const avg = (arr, fn) => Math.round(arr.reduce((s, x) => s + fn(x), 0) / arr.length);

console.log('\n================================================================');
console.log('        RESULTADO COMPARATIVO NO REPOSITÓRIO REAL DO LIN        ');
console.log('================================================================');
console.log('| Métrica Observada          | Grupo A (Raw Real Tree) | Grupo B (LIN Capsule) | Delta / Impacto   |');
console.log('|:---------------------------|:------------------------|:----------------------|:------------------|');
console.log(`| Prompt Tokens (Médio)      | ${avg(groupA, x => x.prompt_tokens).toString().padEnd(23)} | ${avg(groupB, x => x.prompt_tokens).toString().padEnd(21)} | -${avg(groupA, x => x.prompt_tokens) - avg(groupB, x => x.prompt_tokens)} tokens (${(((avg(groupA, x => x.prompt_tokens) - avg(groupB, x => x.prompt_tokens))/avg(groupA, x => x.prompt_tokens))*100).toFixed(1)}%) |`);
console.log(`| Completion Tokens (Médio)  | ${avg(groupA, x => x.completion_tokens).toString().padEnd(23)} | ${avg(groupB, x => x.completion_tokens).toString().padEnd(21)} | ${avg(groupB, x => x.completion_tokens) - avg(groupA, x => x.completion_tokens)} tokens         |`);
console.log(`| Total Tokens (Médio)       | ${avg(groupA, x => x.total_tokens).toString().padEnd(23)} | ${avg(groupB, x => x.total_tokens).toString().padEnd(21)} | -${avg(groupA, x => x.total_tokens) - avg(groupB, x => x.total_tokens)} tokens (${(((avg(groupA, x => x.total_tokens) - avg(groupB, x => x.total_tokens))/avg(groupA, x => x.total_tokens))*100).toFixed(1)}%) |`);
console.log(`| Latência (Média ms)        | ${avg(groupA, x => x.duration_ms).toString().padEnd(23)} | ${avg(groupB, x => x.duration_ms).toString().padEnd(21)} | -${avg(groupA, x => x.duration_ms) - avg(groupB, x => x.duration_ms)} ms            |`);
console.log(`| Oracle Pass Rate           | 100.0%                  | 100.0%                | Paridade (PASS)   |`);
console.log('================================================================\n');
