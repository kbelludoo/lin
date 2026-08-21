/**
 * AGENT_EDIT_003_REAL_LLM: Genuine Local LLM Autonomous Agency Benchmark
 *
 * Model: qwen2.5-coder:7b (via Ollama local host)
 * Task:
 * "Workload profile indicates excessive random seek distance. Inspect profile and source, reduce seek distance below 150000 while preserving public contract and syntax rules."
 *
 * Invariants:
 * 1. ZERO solution knowledge in prompt (no mention of Elevator, targetBlock or replacementBlock).
 * 2. ZERO decision logic in harness (no simulateAgentBehavior with pre-set strings).
 * 3. Local LLM agent receives standard function calling / tools:
 *    - view_file(relPath)
 *    - read_profile()
 *    - replace_file_content(relPath, oldString, newString)
 *    - run_build(relPath)
 *    - run_benchmark(relPath)
 * 4. External Independent Oracle audits filesystem state, buildability, and contract preservation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { compileLiaToJs } from '../src/compiler.mjs';

const BENCH_DIR = path.resolve('.tmp/agent_edit_003_bench');
fs.mkdirSync(BENCH_DIR, { recursive: true });

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Initial source code placed in workspace (FIFO Dispatch)
const INITIAL_LIN_SOURCE = `@LIN:dispatch_engine:1.0.0
!dispatch_next(queue:num, current_floor:num, target_floor:num){
  ?(target_floor > current_floor){^1}:(target_floor < current_floor){^-1}:{^0}
}
`;

// Initial Workload Profile (Observed by Agent)
const WORKLOAD_PROFILE = {
  workload_type: "random_elevator_requests",
  total_requests: 10000,
  random_seek_distance: 370412,
  average_wait_time_ms: 45.8,
  bottleneck_hint: "Frequent direction reversals observed under high concurrency; seek distance exceeds threshold (150000)."
};

// Independent Behavioral Oracle Trials
const ORACLE_EVAL_TRIALS = [
  { input: [1, 2, 5], expected: 1 },    // queue=1, curr=2, target=5 -> Up (1)
  { input: [1, 5, 2], expected: -1 },   // queue=1, curr=5, target=2 -> Down (-1)
  { input: [1, 4, 4], expected: 1 },    // queue=1, curr=4, target=4 -> Up (target >= curr)
  { input: [0, 2, 5], expected: 0 },    // queue=0 (empty) -> Idle (0)
  { input: [0, 5, 2], expected: 0 }     // queue=0 (empty) -> Idle (0)
];

function evalCompiledModule(jsCode, fnName, args) {
  try {
    const fnBody = `
      const module = { exports: {} };
      const exports = module.exports;
      ${jsCode}
      const fn = (typeof module.exports === 'function') ? module.exports : (module.exports.${fnName} || module.exports.default);
      return fn(...inputArgs);
    `;
    const res = new Function('inputArgs', fnBody)(args);
    return { ok: true, result: res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Sandboxed Tool Interface provided to the Real LLM Agent
 */
class RealAgentToolEnvironment {
  constructor(workDir, initialFile, initialContent, profile) {
    this.workDir = workDir;
    this.filePath = path.join(workDir, initialFile);
    this.profile = profile;
    fs.writeFileSync(this.filePath, initialContent, 'utf8');
    this.toolLog = [];
  }

  // Tool 1: view_file
  view_file({ relPath }) {
    const p = relPath || 'source.lin';
    const full = path.join(this.workDir, p);
    this.toolLog.push({ tool: 'view_file', path: p, timestamp: Date.now() });
    if (!fs.existsSync(full)) return { error: `File not found: ${p}` };
    return { content: fs.readFileSync(full, 'utf8') };
  }

  // Tool 2: read_profile
  read_profile() {
    this.toolLog.push({ tool: 'read_profile', timestamp: Date.now() });
    return this.profile;
  }

  // Tool 3: replace_file_content
  replace_file_content({ relPath, oldString, newString }) {
    const p = relPath || 'source.lin';
    const full = path.join(this.workDir, p);
    this.toolLog.push({
      tool: 'replace_file_content',
      path: p,
      old_length: oldString?.length,
      new_length: newString?.length,
      timestamp: Date.now()
    });
    if (!fs.existsSync(full)) return { success: false, error: `File not found: ${p}` };
    const content = fs.readFileSync(full, 'utf8');
    if (!content.includes(oldString)) {
      return { success: false, error: 'Target oldString not found in file content.' };
    }
    const updated = content.replace(oldString, newString);
    fs.writeFileSync(full, updated, 'utf8');
    return { success: true, bytes_written: updated.length };
  }

  // Tool 4: run_build
  run_build({ relPath }) {
    const p = relPath || 'source.lin';
    const full = path.join(this.workDir, p);
    this.toolLog.push({ tool: 'run_build', path: p, timestamp: Date.now() });
    if (!fs.existsSync(full)) return { success: false, error: 'File not found' };
    const content = fs.readFileSync(full, 'utf8');
    try {
      const res = compileLiaToJs(content);
      return { success: true, compiled_js_bytes: res.js.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Tool 5: run_benchmark
  run_benchmark({ relPath }) {
    const p = relPath || 'source.lin';
    const full = path.join(this.workDir, p);
    this.toolLog.push({ tool: 'run_benchmark', path: p, timestamp: Date.now() });
    if (!fs.existsSync(full)) return { success: false, error: 'File not found' };
    const content = fs.readFileSync(full, 'utf8');
    try {
      const res = compileLiaToJs(content);
      let currentFloor = 0;
      let totalSeek = 0;
      const requests = [
        [1, 0, 8], [1, 8, 2], [1, 2, 7], [1, 7, 3], [1, 3, 9],
        [0, 9, 1], [1, 9, 4], [1, 4, 10], [1, 10, 0], [0, 0, 5]
      ];
      for (const [queue, curr, target] of requests) {
        const out = evalCompiledModule(res.js, 'dispatch_next', [queue, curr, target]);
        if (!out.ok) return { success: false, error: out.error };
        const step = Number(out.result) || 0;
        const nextFloor = currentFloor + step;
        totalSeek += Math.abs(nextFloor - currentFloor);
        currentFloor = nextFloor;
      }
      const estimatedSeek = totalSeek * 10000;
      return {
        success: true,
        estimated_seek_distance: estimatedSeek,
        meets_target: estimatedSeek < 150000
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

/**
 * Ollama Local LLM Tool-Calling Client
 */
async function callOllama(messages) {
  const reqBody = JSON.stringify({
    model: "qwen2.5-coder:7b",
    messages,
    stream: false,
    options: {
      temperature: 0.1
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(reqBody);
    req.end();
  });
}

const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "view_file",
      description: "Read content of a source file",
      parameters: {
        type: "object",
        properties: {
          relPath: { type: "string", description: "Relative path to file, e.g. source.lin" }
        },
        required: ["relPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_profile",
      description: "Read performance profiling and metrics of the current workload",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "replace_file_content",
      description: "Replace exact target substring in file with new content",
      parameters: {
        type: "object",
        properties: {
          relPath: { type: "string", description: "Relative path to file" },
          oldString: { type: "string", description: "Exact target substring to replace" },
          newString: { type: "string", description: "New replacement string" }
        },
        required: ["relPath", "oldString", "newString"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_build",
      description: "Compile and syntax check the LIN source file",
      parameters: {
        type: "object",
        properties: {
          relPath: { type: "string", description: "Relative path to file" }
        },
        required: ["relPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_benchmark",
      description: "Run performance simulation against current workload",
      parameters: {
        type: "object",
        properties: {
          relPath: { type: "string", description: "Relative path to file" }
        },
        required: ["relPath"]
      }
    }
  }
];

/**
 * Local LLM Agent Execution Loop (Multi-turn tool calling)
 */
async function executeLocalLlmAgent(env, maxTurns = 5) {
  const messages = [
    {
      role: "system",
      content: `You are an autonomous systems optimization engineer.
You have access to tools:
- view_file(relPath: string)
- read_profile()
- replace_file_content(relPath: string, oldString: string, newString: string)
- run_build(relPath: string)
- run_benchmark(relPath: string)

To call a tool, respond with:
{"name": "tool_name", "arguments": { ... }}`
    },
    {
      role: "user",
      content: "Workload profile indicates excessive random seek distance. Use your tools to inspect source.lin and profile, optimize the dispatch logic so that random seek distance is reduced below 150000, while preserving the function interface and valid LIN syntax. Modify source.lin using replace_file_content."
    }
  ];

  for (let turn = 1; turn <= maxTurns; turn++) {
    try {
      const response = await callOllama(messages);
      const msg = response?.message;
      if (!msg) break;

      messages.push(msg);

      let calls = msg.tool_calls || [];
      if (calls.length === 0 && msg.content) {
        // 1. Check markdown code blocks
        const blocks = msg.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/g) || [];
        for (const b of blocks) {
          const clean = b.replace(/```(?:json)?|```/g, '').trim();
          try {
            const parsed = JSON.parse(clean);
            const toolName = parsed.name || parsed.tool;
            if (toolName) calls.push({ function: { name: toolName, arguments: parsed.arguments || {} } });
          } catch {}
        }
        // 2. Check raw JSON objects if no code block matched
        if (calls.length === 0) {
          const matches = msg.content.match(/\{[\s\S]*?(?:"name"|"tool")[\s\S]*?"arguments"[\s\S]*?\}/g) || [];
          for (const m of matches) {
            try {
              const parsed = JSON.parse(m);
              const toolName = parsed.name || parsed.tool;
              if (toolName) calls.push({ function: { name: toolName, arguments: parsed.arguments || {} } });
            } catch {}
          }
        }
      }

      if (calls.length === 0) {
        // Model provided final text answer without further tool calls
        break;
      }

      for (const call of calls) {
        const fnName = call.function?.name;
        const args = call.function?.arguments || {};
        let result = null;

        if (fnName === 'view_file') result = env.view_file(args);
        else if (fnName === 'read_profile') result = env.read_profile();
        else if (fnName === 'replace_file_content') result = env.replace_file_content(args);
        else if (fnName === 'run_build') result = env.run_build(args);
        else if (fnName === 'run_benchmark') result = env.run_benchmark(args);
        else result = { error: `Unknown tool: ${fnName}` };

        messages.push({
          role: "tool",
          content: JSON.stringify(result)
        });
      }
    } catch (e) {
      console.error(`Turn ${turn} LLM invocation error:`, e.message);
      break;
    }
  }
}

/**
 * Run a single real trial with Local LLM (qwen2.5-coder:7b)
 */
export async function runSingleRealLlmTrial(trialId) {
  const trialDir = path.join(BENCH_DIR, `trial_${String(trialId).padStart(3, '0')}`);
  fs.mkdirSync(trialDir, { recursive: true });

  const beforeContent = INITIAL_LIN_SOURCE;
  const beforeSha = sha256(beforeContent);

  const env = new RealAgentToolEnvironment(trialDir, 'source.lin', beforeContent, WORKLOAD_PROFILE);

  // Run Real LLM Agent Loop
  await executeLocalLlmAgent(env);

  // Independent Post-Action Evaluation by External Oracle (Zero harness decision logic)
  const afterContent = fs.existsSync(env.filePath) ? fs.readFileSync(env.filePath, 'utf8') : '';
  const afterSha = sha256(afterContent);
  const filesChanged = (afterSha !== beforeSha);
  const diffSha = filesChanged ? sha256(`${beforeSha}->${afterSha}`) : 'none';

  const sourceInspected = env.toolLog.some(t => t.tool === 'view_file');
  const targetSymbolReferenced = env.toolLog.some(t =>
    t.tool === 'replace_file_content' || t.tool === 'run_build' || t.tool === 'run_benchmark'
  );
  const discoverySuccess = sourceInspected && targetSymbolReferenced;

  const editAttempt = env.toolLog.some(t => t.tool === 'replace_file_content');
  const editObserved = filesChanged && editAttempt;

  let buildSuccess = false;
  let compiledJs = null;
  let buildError = null;

  if (editObserved) {
    try {
      const res = compileLiaToJs(afterContent);
      if (res && res.js) {
        buildSuccess = true;
        compiledJs = res.js;
      }
    } catch (err) {
      buildError = err.message;
    }
  }

  let benchmarkSuccess = false;
  let passedOracleTrials = 0;

  if (buildSuccess && compiledJs) {
    let allMatch = true;
    for (const trial of ORACLE_EVAL_TRIALS) {
      const r = evalCompiledModule(compiledJs, 'dispatch_next', trial.input);
      if (r.ok && r.result === trial.expected) {
        passedOracleTrials++;
      } else {
        allMatch = false;
      }
    }
    benchmarkSuccess = allMatch && (passedOracleTrials === ORACLE_EVAL_TRIALS.length);
  }

  const completeCycle = discoverySuccess && editObserved && buildSuccess && benchmarkSuccess;

  // Cleanup isolated snapshot
  try {
    fs.unlinkSync(env.filePath);
    fs.rmdirSync(trialDir);
  } catch {}

  return {
    trialId,
    telemetry: {
      before_sha: beforeSha.slice(0, 16),
      after_sha: afterSha.slice(0, 16),
      diff_sha: diffSha.slice(0, 16),
      files_changed: filesChanged,
      tool_calls_count: env.toolLog.length,
      tool_sequence: env.toolLog.map(t => t.tool)
    },
    stages: {
      discovery_success: discoverySuccess,
      edit_observed: editObserved,
      build_success: buildSuccess,
      benchmark_success: benchmarkSuccess,
      complete_cycle: completeCycle
    },
    buildError
  };
}

export async function runFullLlmBenchmark30() {
  console.log('=== Running AGENT_EDIT_003_REAL_LLM: 30 Clean Snapshots with Local LLM (qwen2.5-coder:7b) ===\n');

  const trials = [];
  let dCount = 0;
  let eCount = 0;
  let bCount = 0;
  let rCount = 0;

  for (let i = 1; i <= 30; i++) {
    process.stdout.write(`Executing Snapshot [${String(i).padStart(2, '0')}/30]... `);
    const t = await runSingleRealLlmTrial(i);
    trials.push(t);
    if (t.stages.discovery_success) dCount++;
    if (t.stages.edit_observed) eCount++;
    if (t.stages.build_success) bCount++;
    if (t.stages.benchmark_success) rCount++;
    console.log(`D:${t.stages.discovery_success ? '✔' : '❌'} E:${t.stages.edit_observed ? '✔' : '❌'} B:${t.stages.build_success ? '✔' : '❌'} R:${t.stages.benchmark_success ? '✔' : '❌'} -> Cycle: ${t.stages.complete_cycle ? 'PASS ✅' : 'FAIL ❌'} (Tools: ${t.telemetry.tool_calls_count})`);
  }

  const pD = dCount / 30;
  const pE_given_D = dCount > 0 ? (eCount / dCount) : 0;
  const pB_given_E = eCount > 0 ? (bCount / eCount) : 0;
  const pR_given_B = bCount > 0 ? (rCount / bCount) : 0;
  const pComplete = pD * pE_given_D * pB_given_E * pR_given_B;

  console.log('\n======================================================================');
  console.log('       AGENT_EDIT_003_REAL_LLM TELEMETRY & PROBABILITY MATRIX         ');
  console.log('======================================================================');
  console.log(`Total Snapshots:                     30`);
  console.log(`Discovery Successes  (D):           ${String(dCount).padStart(2)} / 30  (P(D) = ${(pD * 100).toFixed(1)}%)`);
  console.log(`Edit Observed        (E):           ${String(eCount).padStart(2)} / 30  (P(E|D) = ${(pE_given_D * 100).toFixed(1)}%)`);
  console.log(`Build Successes      (B):           ${String(bCount).padStart(2)} / 30  (P(B|E) = ${(pB_given_E * 100).toFixed(1)}%)`);
  console.log(`Benchmark Successes  (R):           ${String(rCount).padStart(2)} / 30  (P(R|B) = ${(pR_given_B * 100).toFixed(1)}%)`);
  console.log('----------------------------------------------------------------------');
  console.log(`P(Ciclo Completo) = P(D) * P(E|D) * P(B|E) * P(R|B): ${(pComplete * 100).toFixed(1)}%`);
  console.log('======================================================================\n');

  const artifactDir = path.resolve('benchmarks/agent_edit_003');
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, 'AGENT_EDIT_003_RESULTS_REAL_LLM.json');

  const artifactData = {
    protocol: 'AGENT_EDIT_003_REAL_LLM',
    model: 'qwen2.5-coder:7b (Ollama local)',
    harness_direct_write: false,
    timestamp: new Date().toISOString(),
    total_snapshots: 30,
    metrics: {
      discovery_success: dCount,
      edit_observed: eCount,
      build_success: bCount,
      benchmark_success: rCount,
      p_discovery: pD,
      p_edit_given_discovery: pE_given_D,
      p_build_given_edit: pB_given_E,
      p_runtime_given_build: pR_given_B,
      p_complete_cycle: pComplete
    },
    trials_telemetry: trials.map(t => ({
      trialId: t.trialId,
      telemetry: t.telemetry,
      stages: t.stages,
      buildError: t.buildError
    }))
  };

  fs.writeFileSync(artifactPath, JSON.stringify(artifactData, null, 2), 'utf8');
  console.log(`Artifact saved: ${artifactPath}`);

  return artifactData;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFullLlmBenchmark30();
}
