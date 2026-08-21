import { BENCHMARK_PATCH_TASKS, executePatchTrial } from './lin_capsule_patch_adapter.mjs';

console.log('================================================================');
console.log('  LIN_CAPSULE_004: MULTI-TRIAL ACTION PATCH CAMPAIGN            ');
console.log('================================================================\n');

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;
const trialsPerTask = parseInt(process.env.TRIALS_PER_TASK || '5', 10);

console.log(`[CONFIGURATION]`);
console.log(`- Router Endpoint: ${endpoint}`);
console.log(`- Model Configured: ${model}`);
console.log(`- API Key Present: ${apiKey ? 'YES' : 'NO'}`);
console.log(`- Trials per task: ${trialsPerTask} (Total trials: ${trialsPerTask * 3 * 2})`);
console.log(`- Temperature: 0.0\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set. Export your key to execute.');
  process.exit(1);
}

const allResults = [];

for (const task of BENCHMARK_PATCH_TASKS) {
  console.log(`\n▶ [TASK: ${task.id}] - ${task.name}`);

  for (let trial = 1; trial <= trialsPerTask; trial++) {
    process.stdout.write(`  Trial ${trial}/${trialsPerTask} - Group A: `);
    const resA = await executePatchTrial({
      task,
      group: 'GROUP_A_RAW_TREE',
      trialIndex: trial,
      model,
      apiEndpoint: endpoint,
      apiKey
    });
    console.log(`${resA.status} | Patch: ${resA.patch_structure_valid ? 'OK' : 'ERR'} | Oracle: ${resA.oracle_pass ? 'PASS' : 'FAIL'} | Tokens: ${resA.total_tokens || 0}`);
    allResults.push(resA);

    process.stdout.write(`  Trial ${trial}/${trialsPerTask} - Group B: `);
    const resB = await executePatchTrial({
      task,
      group: 'GROUP_B_CAPSULE',
      trialIndex: trial,
      model,
      apiEndpoint: endpoint,
      apiKey
    });
    console.log(`${resB.status} | Patch: ${resB.patch_structure_valid ? 'OK' : 'ERR'} | Oracle: ${resB.oracle_pass ? 'PASS' : 'FAIL'} | Tokens: ${resB.total_tokens || 0}`);
    allResults.push(resB);
  }
}

// Summary aggregation
const groupA = allResults.filter(r => r.group === 'GROUP_A_RAW_TREE' && r.status === 'EXECUTED_LIVE');
const groupB = allResults.filter(r => r.group === 'GROUP_B_CAPSULE' && r.status === 'EXECUTED_LIVE');

function calcStats(arr) {
  if (arr.length === 0) return {};
  const avg = (fn) => (arr.reduce((sum, item) => sum + fn(item), 0) / arr.length);
  return {
    count: arr.length,
    prompt_tokens: Math.round(avg(x => x.prompt_tokens)),
    completion_tokens: Math.round(avg(x => x.completion_tokens)),
    total_tokens: Math.round(avg(x => x.total_tokens)),
    duration_ms: Math.round(avg(x => x.duration_ms)),
    patch_valid_rate: (avg(x => x.patch_structure_valid ? 1 : 0) * 100).toFixed(1) + '%',
    oracle_pass_rate: (avg(x => x.oracle_pass ? 1 : 0) * 100).toFixed(1) + '%'
  };
}

const statsA = calcStats(groupA);
const statsB = calcStats(groupB);

console.log('\n----------------------------------------------------------------');
console.log('              AGGREGATED CAMPAIGN RESULTS (A vs B)              ');
console.log('----------------------------------------------------------------');
console.log('| Metric                     | Group A (Raw Tree) | Group B (Capsule)  | Delta / Impact    |');
console.log('|:---------------------------|:-------------------|:-------------------|:------------------|');
console.log(`| Successful Live Trials     | ${statsA.count?.toString().padEnd(18)} | ${statsB.count?.toString().padEnd(18)} | Total: ${allResults.length}   |`);
console.log(`| Prompt Tokens (Mean)       | ${statsA.prompt_tokens?.toString().padEnd(18)} | ${statsB.prompt_tokens?.toString().padEnd(18)} | ${statsB.prompt_tokens - statsA.prompt_tokens} tokens      |`);
console.log(`| Completion Tokens (Mean)   | ${statsA.completion_tokens?.toString().padEnd(18)} | ${statsB.completion_tokens?.toString().padEnd(18)} | ${statsB.completion_tokens - statsA.completion_tokens} tokens      |`);
console.log(`| Total Tokens (Mean)        | ${statsA.total_tokens?.toString().padEnd(18)} | ${statsB.total_tokens?.toString().padEnd(18)} | ${statsB.total_tokens - statsA.total_tokens} tokens      |`);
console.log(`| Latency (Mean ms)          | ${statsA.duration_ms?.toString().padEnd(18)} | ${statsB.duration_ms?.toString().padEnd(18)} | ${statsB.duration_ms - statsA.duration_ms} ms         |`);
console.log(`| Patch Validity Rate        | ${statsA.patch_valid_rate?.padEnd(18)} | ${statsB.patch_valid_rate?.padEnd(18)} | Parity/Diff       |`);
console.log(`| Gate C Oracle Pass Rate    | ${statsA.oracle_pass_rate?.padEnd(18)} | ${statsB.oracle_pass_rate?.padEnd(18)} | Parity/Diff       |`);
console.log('----------------------------------------------------------------\n');
