import { REAL_BENCHMARK_TASKS, executeRealLlmTrial } from './lin_capsule_real_llm_adapter.mjs';

console.log('================================================================');
console.log('  LIN_CAPSULE_003: REAL LLM COGNITIVE CAMPAIGN (V2 PROJECTION)   ');
console.log('================================================================\n');

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;

console.log(`[CONFIGURATION]`);
console.log(`- Router Endpoint: ${endpoint}`);
console.log(`- Model Configured: ${model}`);
console.log(`- API Key Present: ${apiKey ? 'YES' : 'NO'}`);
console.log(`- Temperature: 0.0 (Strictly Controlled)\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set. Please export your new rotated key.');
  process.exit(1);
}

const results = [];

for (const task of REAL_BENCHMARK_TASKS) {
  console.log(`\n▶ [TASK: ${task.id}] - ${task.name}`);

  // Group A (Raw Tree)
  process.stdout.write('  - Executing Group A (Raw Tree)... ');
  const resA = await executeRealLlmTrial({
    task,
    group: 'GROUP_A_RAW_TREE',
    model,
    apiEndpoint: endpoint,
    apiKey
  });
  console.log(`Status: ${resA.status} | First-Pass: ${resA.first_pass_success ? 'PASS' : 'FAIL'} | Tokens: ${resA.total_tokens || 0}`);
  results.push(resA);

  // Group B (Verified Semantic Projection)
  process.stdout.write('  - Executing Group B (Semantic Projection)... ');
  const resB = await executeRealLlmTrial({
    task,
    group: 'GROUP_B_CAPSULE',
    model,
    apiEndpoint: endpoint,
    apiKey
  });
  console.log(`Status: ${resB.status} | First-Pass: ${resB.first_pass_success ? 'PASS' : 'FAIL'} | Tokens: ${resB.total_tokens || 0}`);
  results.push(resB);
}

console.log('\n================================================================');
console.log('                   RAW TELEMETRY AUDIT LOG                     ');
console.log('================================================================');
console.log(JSON.stringify(results, null, 2));

console.log('\n================================================================');
console.log('                     CAMPAIGN COMPLETED                         ');
console.log('================================================================');
