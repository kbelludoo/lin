import fs from 'node:fs';
import path from 'node:path';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { canonicalJson, sha256 } from '../src/lin_capsule_protocol.mjs';

export const REAL_BENCHMARK_TASKS = [
  {
    id: 'TASK_1_SEMANTIC',
    name: 'Pure Semantic Extension',
    prompt: `You are an autonomous coding agent operating with ZERO conversation history.
TASK: Evolve the given system to include a sum reduction operation named 'sum_all'.
REQUIREMENTS:
1. Add a function 'sum_all' to 'functions' with params ['v'] and body: {"op": "reduce", "fn": "acc + x", "init": 0}.
2. The module MUST preserve effects=['io:pure'].
3. You must respond ONLY with the updated JSON object inside a \`\`\`json markdown block. Do not include conversational text.`,
    initialSystem: () => ({
      ir: {
        kind: 'KernelModule',
        name: 'vector_ops',
        functions: [
          { name: 'map_double', params: ['v'], body: { op: 'map', fn: 'x * 2' } }
        ]
      },
      effects: ['io:pure'],
      capabilities: ['cap:basic_eval'],
      invariants: { verified: true, rules: ['pure_math', 'deterministic'] }
    }),
    oracle: (evolvedLinobj) => {
      const root = evolvedLinobj.ir || evolvedLinobj;
      const fns = root.functions || [];
      const hasMap = fns.some(f => f.name === 'map_double');
      const hasSum = fns.some(f => f.name === 'sum_all');
      const effects = evolvedLinobj.effects || root.effects || [];
      const isPure = Array.isArray(effects) && effects.includes('io:pure');
      const pass = hasMap && hasSum && isPure;
      return { pass, error: pass ? null : 'Missing sum_all or broke purity effect boundary' };
    }
  },
  {
    id: 'TASK_2_INVARIANT',
    name: 'Refinement Contract Tightening',
    prompt: `You are an autonomous coding agent operating with ZERO conversation history.
TASK: Evolve the given system to enforce size <= 1024 on alloc_page and add invariant 'size_bounded_1024'.
REQUIREMENTS:
1. Update 'contracts' of 'alloc_page' to require: ["size > 0", "size <= 1024"].
2. Add 'size_bounded_1024' to invariants.rules.
3. You must respond ONLY with the updated JSON object inside a \`\`\`json markdown block. Do not include conversational text.`,
    initialSystem: () => ({
      ir: {
        kind: 'RefinedModule',
        name: 'memory_allocator',
        functions: [
          { name: 'alloc_page', params: ['size'], return_type: 'Buffer' }
        ]
      },
      effects: ['io:stdout'],
      capabilities: ['cap:mem_alloc'],
      invariants: { verified: true, rules: ['page_aligned'] }
    }),
    oracle: (evolvedLinobj) => {
      const root = evolvedLinobj.ir || evolvedLinobj;
      const fn = root.functions?.[0];
      const contractsStr = JSON.stringify(fn?.contracts || {});
      const hasContract = contractsStr.includes('1024');
      const invRules = evolvedLinobj.invariants?.rules || root.invariants?.rules || [];
      const hasInvariant = Array.isArray(invRules) && invRules.includes('size_bounded_1024');
      const pass = hasContract && hasInvariant;
      return { pass, error: pass ? null : 'Invariant size_bounded_1024 or contract refinement missing' };
    }
  },
  {
    id: 'TASK_3_TOPOLOGICAL',
    name: 'State Machine Graph Extension',
    prompt: `You are an autonomous coding agent operating with ZERO conversation history.
TASK: Extend the workflow transitions with 'RETRY' and 'ABORTED' states.
REQUIREMENTS:
1. Add 'RETRY' and 'ABORTED' to states.
2. Route transitions: FAILED -> 'RETRY' and RETRY -> ['RUNNING', 'ABORTED'].
3. Add invariant 'retry_limit_enforced'.
4. You must respond ONLY with the updated JSON object inside a \`\`\`json markdown block. Do not include conversational text.`,
    initialSystem: () => ({
      ir: {
        kind: 'WorkflowGraph',
        name: 'pipeline_v1',
        states: ['IDLE', 'RUNNING', 'COMPLETED', 'FAILED'],
        transitions: { IDLE: 'RUNNING', RUNNING: ['COMPLETED', 'FAILED'] }
      },
      effects: ['io:stdout'],
      capabilities: ['cap:task_spawn'],
      invariants: { verified: true, rules: ['no_deadlock', 'reachability'] }
    }),
    oracle: (evolvedLinobj) => {
      const root = evolvedLinobj.ir || evolvedLinobj;
      const states = root.states || [];
      const hasRetry = states.includes('RETRY');
      const hasAborted = states.includes('ABORTED');
      const transitions = root.transitions || {};
      const transitionsValid = transitions.FAILED === 'RETRY';
      const invRules = evolvedLinobj.invariants?.rules || root.invariants?.rules || [];
      const hasInvariant = Array.isArray(invRules) && invRules.includes('retry_limit_enforced');
      const pass = hasRetry && hasAborted && transitionsValid && hasInvariant;
      return { pass, error: pass ? null : 'Topological transitions or retry invariant missing' };
    }
  }
];

function sanitizeJsonResponse(rawText) {
  let text = rawText.trim();
  const doneIdx = text.indexOf('data: [DONE]');
  if (doneIdx !== -1) {
    text = text.substring(0, doneIdx).trim();
  }
  return text;
}

export async function executeRealLlmTrial({
  task,
  group,
  model = process.env.LLM_MODEL || 'kgw/kilo-auto/free',
  apiEndpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey = process.env.LLM_API_KEY
}) {
  if (!apiKey) {
    return {
      status: 'AUTH_KEY_MISSING',
      task_id: task.id,
      group,
      error: 'Environment variable LLM_API_KEY is not set.'
    };
  }

  const initial = task.initialSystem();
  const initialSemanticHash = sha256(canonicalJson(initial.ir));
  const initialLinobj = {
    ir: initial.ir,
    semantic_hash: initialSemanticHash,
    workflow_hash: sha256(canonicalJson(initial.ir)),
    source_digest: sha256('// source'),
    effects: initial.effects,
    capabilities: initial.capabilities,
    invariants: initial.invariants,
    provenance: { known_good_targets: { rust: { status: 'EQUIVALENT' } } }
  };

  let promptInput = '';
  let payloadBytes = 0;

  if (group === 'GROUP_A_RAW_TREE') {
    promptInput = `[CONTEXT: RAW REPOSITORY MULTI-FILES (NO CONVERSATION HISTORY)]
--- FILE: src/main.lin ---
${JSON.stringify(initial.ir, null, 2)}

--- FILE: src/effects.config ---
effects = ${initial.effects.join(', ')}

--- FILE: spec/invariants.rulel ---
@RULEL
.i{ rules = [${initial.invariants.rules.join(', ')}] }

--- FILE: scripts/build.mjs ---
// build bootstrap harness
export function build() {}

${task.prompt}`;
  } else {
    // 1. Pack into transport capsule & verify Gate A & B
    const capsuleParts = encodeCapsule(initialLinobj, { chunkSize: 200, compression: 'none' });
    payloadBytes = capsuleParts.map(p => p.chunk.length).reduce((a, b) => a + b, 0);

    const rehydrated = decodeCapsule(capsuleParts, {
      allowed_effects: initial.effects,
      authorized_capabilities: initial.capabilities
    });

    if (!rehydrated.ok) {
      throw new Error(`Gate A/B rehydration failure: ${rehydrated.error}`);
    }

    // 2. Project Verified Semantic View to Agent (Separation of Concerns)
    const semanticProjection = {
      semantic_identity: rehydrated.linobj.semantic_hash,
      contracts: {
        effects: rehydrated.linobj.effects,
        capabilities: rehydrated.linobj.capabilities,
        invariants: rehydrated.linobj.invariants
      },
      ir: rehydrated.linobj.ir
    };

    promptInput = `[CONTEXT: VERIFIED SEMANTIC PROJECTION (REHYDRATED FROM CAPSULE, 0 RAW FILES)]
${JSON.stringify(semanticProjection, null, 2)}

${task.prompt}`;
  }

  const startTime = Date.now();

  try {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptInput }],
        temperature: 0.0
      })
    });

    const rawBody = await res.text();
    const durationMs = Date.now() - startTime;

    if (!res.ok) {
      return {
        status: 'HTTP_ERROR',
        status_code: res.status,
        task_id: task.id,
        group,
        duration_ms: durationMs,
        error: rawBody
      };
    }

    const sanitized = sanitizeJsonResponse(rawBody);
    let data;
    try {
      data = JSON.parse(sanitized);
    } catch (e) {
      return {
        status: 'RESPONSE_PARSE_ERROR',
        task_id: task.id,
        group,
        duration_ms: durationMs,
        error: e.message
      };
    }

    const usage = data.usage || {};
    const effectiveModel = data.model || model;
    const rawOutput = data.choices?.[0]?.message?.content || '';

    // Extract JSON block
    let parsedLinobj = null;
    try {
      const match = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonCandidate = (match ? match[1] : rawOutput).trim();
      parsedLinobj = JSON.parse(jsonCandidate);
    } catch (e) {
      // First pass JSON parsing failed
    }

    const oracleResult = parsedLinobj ? task.oracle(parsedLinobj) : { pass: false, error: 'JSON Extraction Failed' };

    return {
      status: 'EXECUTED_LIVE',
      task_id: task.id,
      group,
      effective_model: effectiveModel,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      duration_ms: durationMs,
      first_pass_success: oracleResult.pass,
      oracle_pass: oracleResult.pass,
      oracle_error: oracleResult.error,
      transport_capsule_bytes: payloadBytes
    };
  } catch (err) {
    return {
      status: 'CONNECTION_ERROR',
      task_id: task.id,
      group,
      error: err.message
    };
  }
}
