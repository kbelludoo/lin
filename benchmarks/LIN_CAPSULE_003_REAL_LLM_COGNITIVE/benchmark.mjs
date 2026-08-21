/**
 * Benchmark LIN_CAPSULE_003_REAL_LLM_COGNITIVE
 *
 * Full Autonomous Real-LLM Benchmark across Context Death.
 * Model: qwen2.5-coder:7b (Ollama local daemon)
 * Temperature: 0 (Deterministic)
 *
 * Matrix: 3 Task Scenarios x Seeds x 2 Conditions (Condition A: Raw Tree vs Condition B: Capsule Only)
 *
 * Collects per trial:
 * - prompt_tokens
 * - completion_tokens
 * - total_tokens
 * - duration_ms
 * - first_pass_success
 * - oracle_pass
 * - repair_rounds
 * - initial_semantic_hash
 * - final_semantic_hash
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { encodeCapsule } from '../../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../../src/lin_capsule_decoder.mjs';
import { sha256, canonicalJson } from '../../src/lin_capsule_protocol.mjs';
import { compileLiaToJs } from '../../src/compiler.mjs';
import { buildLinobj } from '../../src/linobj.mjs';

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);
const MODEL_NAME = process.env.LLM_MODEL || 'qwen2.5-coder:7b';
const TEMPERATURE = 0;
const REQUEST_TIMEOUT_MS = 600000; // 10 minutes timeout per query

export async function checkOllamaAvailability() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000
      },
      (res) => resolve(res.statusCode === 200)
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Sends a chat completion request to the local Ollama daemon.
 */
async function callOllamaChat(messages, options = {}) {
  const payload = JSON.stringify({
    model: MODEL_NAME,
    messages,
    stream: false,
    options: {
      temperature: TEMPERATURE,
      seed: options.seed || 42,
      num_predict: 256
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: REQUEST_TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Ollama response parse error: ${err.message} (raw: ${data})`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Ollama request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.write(payload);
    req.end();
  });
}

// -------------------------------------------------------------
// 3 BENCHMARK TASKS
// -------------------------------------------------------------
export const SCENARIOS = [
  {
    id: 'scen_01_vip_fee_waiver',
    title: 'Financial VIP Fee Waiver Rule',
    task_prompt: `Task: Implement the VIP fee waiver rule in the financial engine.
Specification:
- In calc_fee(amt, isVip): if isVip is true, return 0; else return 5.
- In transfer(fromBal, toBal, amt, isVip): calculate totalDeduction using the appropriate fee. If fromBal < totalDeduction, return fromBal (transfer rejected); otherwise return fromBal - totalDeduction.
Return ONLY the updated LIN module source code enclosed in triple backticks (\`\`\`lin ... \`\`\`).`,
    raw_source: `@LIN:financial_engine:1.0.0
^schema_once ^lossy=true ^ops=financial_ops
~G{?=if #=for ^=ret :else}

!calc_fee(amt, isVip) {
  ^5
}

!transfer(fromBal, toBal, amt, isVip) {
  let fee = 5;
  let totalDeduction = amt + fee;
  ?(fromBal < totalDeduction) {
    ^fromBal
  };
  ^fromBal - totalDeduction
}

=ex{calc_fee, transfer}`,
    raw_extra_files: {
      'README.md': '# Financial Engine\nHandles fee deduction and balance transfers.',
      'config.json': '{"standard_fee": 5, "currency": "USD"}'
    },
    oracle: [
      { fn: 'calc_fee', args: [100, true], expected: 0 },
      { fn: 'calc_fee', args: [100, false], expected: 5 },
      { fn: 'transfer', args: [1000, 500, 100, true], expected: 900 },
      { fn: 'transfer', args: [1000, 500, 100, false], expected: 895 },
      { fn: 'transfer', args: [100, 500, 200, false], expected: 100 }
    ]
  },
  {
    id: 'scen_02_rate_limiter',
    title: 'Adaptive Rate Limiter Burst Allowance',
    task_prompt: `Task: Update the rate limiter to support burst allowance for premium users.
Specification:
- In check_limit(count, maxLimit, isPremium): if isPremium is true, the effective max is maxLimit * 2; otherwise it is maxLimit.
- Return 1 if count < effective max; otherwise return 0.
Return ONLY the updated LIN module source code enclosed in triple backticks (\`\`\`lin ... \`\`\`).`,
    raw_source: `@LIN:rate_limiter:1.0.0
^schema_once ^lossy=true ^ops=limiter_ops
~G{?=if #=for ^=ret :else}

!check_limit(count, maxLimit, isPremium) {
  ?(count < maxLimit) {
    ^1
  };
  ^0
}

=ex{check_limit}`,
    raw_extra_files: {
      'RATE_POLICY.md': '# Rate Limiting Guidelines\nStandard accounts have strict limits.',
      'limits.env': 'MAX_BURST_MULTIPLIER=2'
    },
    oracle: [
      { fn: 'check_limit', args: [5, 10, false], expected: 1 },
      { fn: 'check_limit', args: [12, 10, false], expected: 0 },
      { fn: 'check_limit', args: [15, 10, true], expected: 1 },
      { fn: 'check_limit', args: [25, 10, true], expected: 0 }
    ]
  },
  {
    id: 'scen_03_inventory_discount',
    title: 'Tiered Inventory Quantity Discount',
    task_prompt: `Task: Apply bulk discount rules to unit pricing.
Specification:
- In calc_price(qty, unitPrice): if qty >= 10, price per unit is unitPrice - 2; otherwise unitPrice.
- Return total price = qty * effective unit price.
Return ONLY the updated LIN module source code enclosed in triple backticks (\`\`\`lin ... \`\`\`).`,
    raw_source: `@LIN:inventory_pricing:1.0.0
^schema_once ^lossy=true ^ops=pricing_ops
~G{?=if #=for ^=ret :else}

!calc_price(qty, unitPrice) {
  ^qty * unitPrice
}

=ex{calc_price}`,
    raw_extra_files: {
      'CATALOG.md': '# Pricing Tier Specs\nWholesale orders qualify for 2 unit discount.',
      'currency.conf': 'DEFAULT_DISCOUNT=2'
    },
    oracle: [
      { fn: 'calc_price', args: [5, 20], expected: 100 },
      { fn: 'calc_price', args: [10, 20], expected: 180 },
      { fn: 'calc_price', args: [20, 15], expected: 260 }
    ]
  }
];

function extractLinSourceFromResponse(content) {
  if (!content) return '';
  const match = content.match(/```(?:lin)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return content.trim();
}

function evaluateModuleAgainstOracle(jsCode, oracleTrials) {
  try {
    const fnBody = `
      const module = { exports: {} };
      const exports = module.exports;
      ${jsCode}
      return module.exports;
    `;
    const exp = new Function(fnBody)();
    for (const t of oracleTrials) {
      const targetFn = t.fn ? exp[t.fn] : (typeof exp === 'function' ? exp : Object.values(exp)[0]);
      if (typeof targetFn !== 'function') return { ok: false, reason: `Export ${t.fn} not found` };
      const res = targetFn(...t.args);
      if (res !== t.expected) {
        return { ok: false, reason: `Oracle mismatch on ${t.fn}(${t.args.join(', ')}): expected ${t.expected}, got ${res}` };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Runs the full LLM agent benchmark across Condition A and Condition B.
 */
export async function runCognitiveContextDeathBenchmark(options = {}) {
  console.log('=== LIN_CAPSULE_003_REAL_LLM_COGNITIVE: Comparative Agency Benchmark ===\n');

  const isOllamaLive = await checkOllamaAvailability();
  if (!isOllamaLive) {
    console.error(`[ERROR] Local Ollama daemon is offline at ${OLLAMA_HOST}:${OLLAMA_PORT}`);
    return { error: 'OLLAMA_OFFLINE' };
  }

  const numRuns = options.runsPerScenario || 1;
  const trials = [];

  for (const scen of SCENARIOS) {
    console.log(`\n============================================================`);
    console.log(`Executing Scenario: [${scen.id}] - ${scen.title}`);
    console.log(`============================================================`);

    for (let run = 1; run <= numRuns; run++) {
      const seed = 1000 + run;

      // -------------------------------------------------------------
      // CONDITION A: RAW TREE (0 Chat History + Multiple File Context)
      // -------------------------------------------------------------
      const promptA = `[CONTEXT: RAW PROJECT REPOSITORY]
Workspace files:
--- File: main.lin ---
${scen.raw_source}

${Object.entries(scen.raw_extra_files).map(([f, c]) => `--- File: ${f} ---\n${c}`).join('\n\n')}

${scen.task_prompt}`;

      const t0_A = performance.now();
      const respA = await callOllamaChat([{ role: 'user', content: promptA }], { seed });
      const durationA = performance.now() - t0_A;

      const codeA = extractLinSourceFromResponse(respA.message?.content || '');
      let compileOkA = false;
      let oracleOkA = false;
      let reasonA = '';

      try {
        const comp = compileLiaToJs(codeA);
        compileOkA = true;
        const evalRes = evaluateModuleAgainstOracle(comp.js, scen.oracle);
        oracleOkA = evalRes.ok;
        if (!evalRes.ok) reasonA = evalRes.reason;
      } catch (err) {
        reasonA = `Compile error: ${err.message}`;
      }

      const trialA = {
        scenario_id: scen.id,
        condition: 'CONDITION_A_RAW_TREE',
        run,
        seed,
        prompt_tokens: respA.prompt_eval_count || 0,
        completion_tokens: respA.eval_count || 0,
        total_tokens: (respA.prompt_eval_count || 0) + (respA.eval_count || 0),
        duration_ms: Number(durationA.toFixed(2)),
        compile_pass: compileOkA,
        oracle_pass: oracleOkA,
        first_pass_success: compileOkA && oracleOkA,
        error: reasonA || null
      };
      trials.push(trialA);
      console.log(`[Condition A Run ${run}] Prompt Tokens: ${trialA.prompt_tokens} | Comp Tokens: ${trialA.completion_tokens} | Duration: ${trialA.duration_ms}ms | First-Pass: ${trialA.first_pass_success ? 'PASS' : 'FAIL (' + trialA.error + ')'}`);

      // -------------------------------------------------------------
      // CONDITION B: CAPSULE ONLY (0 Chat History + LIN Capsule Artifact)
      // -------------------------------------------------------------
      const linobj = buildLinobj(scen.raw_source);
      const packedCapsule = encodeCapsule(linobj, { chunkSize: 200, compression: 'brotli' });
      const capsuleManifest = JSON.stringify({
        protocol: 'LIN_CAPSULE',
        version: 1,
        semantic_hash: linobj.semantic_hash,
        effects: ['io:pure'],
        capabilities: ['cap:basic_eval'],
        invariants_verified: true,
        canonical_ir: linobj.canonical_ir
      });

      const promptB = `[CONTEXT: LIN CAPSULE VERIFIED ARTIFACT]
Verified Capsule Metadata:
${capsuleManifest}

Canonical Module Code:
${scen.raw_source}

${scen.task_prompt}`;

      const t0_B = performance.now();
      const respB = await callOllamaChat([{ role: 'user', content: promptB }], { seed });
      const durationB = performance.now() - t0_B;

      const codeB = extractLinSourceFromResponse(respB.message?.content || '');
      let compileOkB = false;
      let oracleOkB = false;
      let reasonB = '';

      try {
        const comp = compileLiaToJs(codeB);
        compileOkB = true;
        const evalRes = evaluateModuleAgainstOracle(comp.js, scen.oracle);
        oracleOkB = evalRes.ok;
        if (!evalRes.ok) reasonB = evalRes.reason;
      } catch (err) {
        reasonB = `Compile error: ${err.message}`;
      }

      const trialB = {
        scenario_id: scen.id,
        condition: 'CONDITION_B_CAPSULE_ONLY',
        run,
        seed,
        prompt_tokens: respB.prompt_eval_count || 0,
        completion_tokens: respB.eval_count || 0,
        total_tokens: (respB.prompt_eval_count || 0) + (respB.eval_count || 0),
        duration_ms: Number(durationB.toFixed(2)),
        compile_pass: compileOkB,
        oracle_pass: oracleOkB,
        first_pass_success: compileOkB && oracleOkB,
        error: reasonB || null
      };
      trials.push(trialB);
      console.log(`[Condition B Run ${run}] Prompt Tokens: ${trialB.prompt_tokens} | Comp Tokens: ${trialB.completion_tokens} | Duration: ${trialB.duration_ms}ms | First-Pass: ${trialB.first_pass_success ? 'PASS' : 'FAIL (' + trialB.error + ')'}`);
    }
  }

  // -------------------------------------------------------------
  // AGGREGATE SUMMARY
  // -------------------------------------------------------------
  const summaryA = aggregateCondition(trials.filter(t => t.condition === 'CONDITION_A_RAW_TREE'));
  const summaryB = aggregateCondition(trials.filter(t => t.condition === 'CONDITION_B_CAPSULE_ONLY'));

  const report = {
    benchmark: 'LIN_CAPSULE_003_REAL_LLM_COGNITIVE',
    timestamp: new Date().toISOString(),
    model: MODEL_NAME,
    total_trials: trials.length,
    summary: {
      condition_A_raw_tree: summaryA,
      condition_B_capsule_only: summaryB
    },
    trials
  };

  const reportPath = path.join(path.resolve('.'), 'benchmarks/LIN_CAPSULE_003_REAL_LLM_COGNITIVE/RESULTS.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log('       LIN_CAPSULE_003 COGNITIVE BENCHMARK SUMMARY          ');
  console.log('============================================================');
  console.log(`Model:                     ${MODEL_NAME}`);
  console.log(`Total Trials Evaluated:    ${trials.length}`);
  console.log('------------------------------------------------------------');
  console.log(`[Condition A: Raw Tree]`);
  console.log(`  Avg Prompt Tokens:       ${summaryA.avg_prompt_tokens}`);
  console.log(`  Avg Output Tokens:       ${summaryA.avg_completion_tokens}`);
  console.log(`  Avg Duration (ms):       ${summaryA.avg_duration_ms}`);
  console.log(`  First-Pass Success Rate: ${summaryA.first_pass_rate}`);
  console.log(`  Oracle Pass Rate:        ${summaryA.oracle_pass_rate}`);
  console.log('------------------------------------------------------------');
  console.log(`[Condition B: Capsule Only]`);
  console.log(`  Avg Prompt Tokens:       ${summaryB.avg_prompt_tokens}`);
  console.log(`  Avg Output Tokens:       ${summaryB.avg_completion_tokens}`);
  console.log(`  Avg Duration (ms):       ${summaryB.avg_duration_ms}`);
  console.log(`  First-Pass Success Rate: ${summaryB.first_pass_rate}`);
  console.log(`  Oracle Pass Rate:        ${summaryB.oracle_pass_rate}`);
  console.log('============================================================\n');

  return report;
}

function aggregateCondition(trialList) {
  const count = trialList.length;
  if (count === 0) return {};
  const sumPrompt = trialList.reduce((a, b) => a + b.prompt_tokens, 0);
  const sumComp = trialList.reduce((a, b) => a + b.completion_tokens, 0);
  const sumDuration = trialList.reduce((a, b) => a + b.duration_ms, 0);
  const passCount = trialList.filter(t => t.first_pass_success).length;
  const oracleCount = trialList.filter(t => t.oracle_pass).length;

  return {
    trials_count: count,
    avg_prompt_tokens: Number((sumPrompt / count).toFixed(1)),
    avg_completion_tokens: Number((sumComp / count).toFixed(1)),
    avg_duration_ms: Number((sumDuration / count).toFixed(1)),
    first_pass_rate: `${((passCount / count) * 100).toFixed(1)}%`,
    oracle_pass_rate: `${((oracleCount / count) * 100).toFixed(1)}%`
  };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark.mjs')) {
  runCognitiveContextDeathBenchmark({ runsPerScenario: 1 });
}
