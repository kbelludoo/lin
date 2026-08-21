import fs from 'node:fs';
import path from 'node:path';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { canonicalJson, sha256 } from '../src/lin_capsule_protocol.mjs';

export const BENCHMARK_PATCH_TASKS = [
  {
    id: 'TASK_1_SEMANTIC',
    name: 'Pure Semantic Extension',
    prompt: `You are an autonomous agent under ZERO conversation history.
TASK: Evolve the system by adding a sum reduction operation named 'sum_all'.
REQUIREMENTS:
1. Preserve existing 'map_double' function.
2. Add 'sum_all' with params ['v'] and body: {"op": "reduce", "fn": "acc + x", "init": 0}.
3. Maintain pure effects: effects=['io:pure'].
OUTPUT: Output ONLY a JSON patch block formatted as:
\`\`\`json
{
  "action": "add_function",
  "function": {
    "name": "sum_all",
    "params": ["v"],
    "body": { "op": "reduce", "fn": "acc + x", "init": 0 }
  }
}
\`\`\``,
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
    applyPatch: (baseLinobj, patch) => {
      if (patch.action !== 'add_function' || !patch.function || !patch.function.name) {
        return { ok: false, error: 'Invalid add_function patch structure' };
      }
      const cloned = JSON.parse(JSON.stringify(baseLinobj));
      cloned.ir.functions.push(patch.function);
      cloned.semantic_hash = sha256(canonicalJson(cloned.ir));
      return { ok: true, linobj: cloned };
    },
    oracle: (mutatedLinobj) => {
      const fns = mutatedLinobj.ir.functions || [];
      const hasMap = fns.some(f => f.name === 'map_double');
      const hasSum = fns.some(f => f.name === 'sum_all' && f.body?.op === 'reduce');
      const isPure = Array.isArray(mutatedLinobj.effects) && mutatedLinobj.effects.includes('io:pure') && mutatedLinobj.effects.length === 1;
      const invIntact = mutatedLinobj.invariants?.rules?.includes('pure_math') && mutatedLinobj.invariants?.rules?.includes('deterministic');
      const pass = hasMap && hasSum && isPure && invIntact;
      return { pass, error: pass ? null : 'Failed semantic reduction check, purity boundary, or broke existing map_double/invariants' };
    }
  },
  {
    id: 'TASK_2_INVARIANT',
    name: 'Refinement Contract Tightening',
    prompt: `You are an autonomous agent under ZERO conversation history.
TASK: Enforce size <= 1024 on alloc_page and add invariant 'size_bounded_1024'.
REQUIREMENTS:
1. Preserve existing 'page_aligned' invariant.
2. Require size > 0 and size <= 1024 in contracts.
3. Add invariant 'size_bounded_1024' to invariants.rules.
OUTPUT: Output ONLY a JSON patch block formatted as:
\`\`\`json
{
  "action": "modify_contracts",
  "contracts": { "requires": ["size > 0", "size <= 1024"] },
  "new_invariant": "size_bounded_1024"
}
\`\`\``,
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
    applyPatch: (baseLinobj, patch) => {
      if (patch.action !== 'modify_contracts' || !patch.contracts) {
        return { ok: false, error: 'Invalid modify_contracts patch structure' };
      }
      const cloned = JSON.parse(JSON.stringify(baseLinobj));
      cloned.ir.functions[0].contracts = patch.contracts;
      if (patch.new_invariant && !cloned.invariants.rules.includes(patch.new_invariant)) {
        cloned.invariants.rules.push(patch.new_invariant);
      }
      cloned.semantic_hash = sha256(canonicalJson(cloned.ir));
      return { ok: true, linobj: cloned };
    },
    oracle: (mutatedLinobj) => {
      const fn = mutatedLinobj.ir.functions?.[0];
      const reqs = fn?.contracts?.requires || [];
      const hasGtZero = reqs.some(r => r.includes('size > 0') || r.includes('> 0'));
      const has1024 = reqs.some(r => r.includes('1024'));
      const hasPageAligned = mutatedLinobj.invariants?.rules?.includes('page_aligned');
      const hasSizeBounded = mutatedLinobj.invariants?.rules?.includes('size_bounded_1024');
      const pass = hasGtZero && has1024 && hasPageAligned && hasSizeBounded;
      return { pass, error: pass ? null : 'Regressed baseline invariants or missing required contract bounds' };
    }
  },
  {
    id: 'TASK_3_TOPOLOGICAL',
    name: 'State Machine Graph Extension',
    prompt: `You are an autonomous agent under ZERO conversation history.
TASK: Extend the workflow transitions with 'RETRY' and 'ABORTED' states.
REQUIREMENTS:
1. Preserve baseline states: IDLE, RUNNING, COMPLETED, FAILED.
2. Add 'RETRY' and 'ABORTED' to states.
3. Route transitions: FAILED -> 'RETRY' and RETRY -> ['RUNNING', 'ABORTED'].
4. Preserve existing invariants ('no_deadlock', 'reachability') and add 'retry_limit_enforced'.
OUTPUT: Output ONLY a JSON patch block formatted as:
\`\`\`json
{
  "action": "extend_state_machine",
  "add_states": ["RETRY", "ABORTED"],
  "transitions": {
    "FAILED": "RETRY",
    "RETRY": ["RUNNING", "ABORTED"]
  },
  "new_invariant": "retry_limit_enforced"
}
\`\`\``,
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
    applyPatch: (baseLinobj, patch) => {
      if (patch.action !== 'extend_state_machine' || !Array.isArray(patch.add_states)) {
        return { ok: false, error: 'Invalid extend_state_machine patch structure' };
      }
      const cloned = JSON.parse(JSON.stringify(baseLinobj));
      for (const s of patch.add_states) {
        if (!cloned.ir.states.includes(s)) cloned.ir.states.push(s);
      }
      cloned.ir.transitions = { ...cloned.ir.transitions, ...patch.transitions };
      if (patch.new_invariant && !cloned.invariants.rules.includes(patch.new_invariant)) {
        cloned.invariants.rules.push(patch.new_invariant);
      }
      cloned.semantic_hash = sha256(canonicalJson(cloned.ir));
      return { ok: true, linobj: cloned };
    },
    oracle: (mutatedLinobj) => {
      const states = mutatedLinobj.ir.states || [];
      const baseStatesIntact = ['IDLE', 'RUNNING', 'COMPLETED', 'FAILED'].every(s => states.includes(s));
      const hasRetry = states.includes('RETRY');
      const hasAborted = states.includes('ABORTED');
      const transitions = mutatedLinobj.ir.transitions || {};
      const transitionsValid = transitions.FAILED === 'RETRY' && Array.isArray(transitions.RETRY) && transitions.RETRY.includes('RUNNING');
      const invRules = mutatedLinobj.invariants?.rules || [];
      const baseInvIntact = invRules.includes('no_deadlock') && invRules.includes('reachability');
      const hasRetryInv = invRules.includes('retry_limit_enforced');
      const pass = baseStatesIntact && hasRetry && hasAborted && transitionsValid && baseInvIntact && hasRetryInv;
      return { pass, error: pass ? null : 'Regressed baseline state machine topology or failed retry invariant' };
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

export async function executePatchTrial({
  task,
  group,
  trialIndex = 1,
  model = process.env.LLM_MODEL || 'kgw/kilo-auto/free',
  apiEndpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey = process.env.LLM_API_KEY
}) {
  if (!apiKey) {
    return {
      status: 'AUTH_KEY_MISSING',
      trial_index: trialIndex,
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
export function build() {}

${task.prompt}`;
  } else {
    const capsuleParts = encodeCapsule(initialLinobj, { chunkSize: 200, compression: 'none' });
    const rehydrated = decodeCapsule(capsuleParts, {
      allowed_effects: initial.effects,
      authorized_capabilities: initial.capabilities
    });

    if (!rehydrated.ok) {
      throw new Error(`Gate A/B failure: ${rehydrated.error}`);
    }

    const semanticProjection = {
      semantic_identity: rehydrated.linobj.semantic_hash,
      contracts: {
        effects: rehydrated.linobj.effects,
        capabilities: rehydrated.linobj.capabilities,
        invariants: rehydrated.linobj.invariants
      },
      ir: rehydrated.linobj.ir
    };

    promptInput = `[CONTEXT: VERIFIED SEMANTIC PROJECTION (FROM CAPSULE, 0 RAW FILES)]
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
        trial_index: trialIndex,
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
        trial_index: trialIndex,
        task_id: task.id,
        group,
        duration_ms: durationMs,
        error: e.message
      };
    }

    const usage = data.usage || {};
    const effectiveModel = data.model || model;
    const rawOutput = data.choices?.[0]?.message?.content || '';

    // Extract JSON Patch block
    let parsedPatch = null;
    try {
      const match = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonCandidate = (match ? match[1] : rawOutput).trim();
      parsedPatch = JSON.parse(jsonCandidate);
    } catch (e) {
      // Patch parsing failed
    }

    if (!parsedPatch) {
      return {
        status: 'EXECUTED_LIVE',
        trial_index: trialIndex,
        task_id: task.id,
        group,
        effective_model: effectiveModel,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        initial_semantic_hash: initialSemanticHash,
        final_semantic_hash: initialSemanticHash,
        patch_structure_valid: false,
        oracle_pass: false,
        oracle_error: 'Patch JSON extraction failed'
      };
    }

    // Apply patch to base linobj
    const patchResult = task.applyPatch(initialLinobj, parsedPatch);
    if (!patchResult.ok) {
      return {
        status: 'EXECUTED_LIVE',
        trial_index: trialIndex,
        task_id: task.id,
        group,
        effective_model: effectiveModel,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        initial_semantic_hash: initialSemanticHash,
        final_semantic_hash: initialSemanticHash,
        patch_structure_valid: false,
        oracle_pass: false,
        oracle_error: patchResult.error
      };
    }

    // Evaluate mutated system against Gate C oracle with regression checks
    const oracleResult = task.oracle(patchResult.linobj);

    return {
      status: 'EXECUTED_LIVE',
      trial_index: trialIndex,
      task_id: task.id,
      group,
      effective_model: effectiveModel,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      duration_ms: durationMs,
      initial_semantic_hash: initialSemanticHash,
      final_semantic_hash: patchResult.linobj.semantic_hash,
      patch_structure_valid: true,
      oracle_pass: oracleResult.pass,
      oracle_error: oracleResult.error
    };
  } catch (err) {
    return {
      status: 'CONNECTION_ERROR',
      trial_index: trialIndex,
      task_id: task.id,
      group,
      error: err.message
    };
  }
}
