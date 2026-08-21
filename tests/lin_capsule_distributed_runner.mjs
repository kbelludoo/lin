import { DISTRIBUTED_TASK_CORPUS, buildDistributedBaseLinobj, REAL_LIN_FILES } from './lin_capsule_distributed_corpus.mjs';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';

const CONTEXT_BUDGETS = [1024, 2048, 4096, 8192, 16384];

export function allocateDistributedContextForRaw(task, budgetTokens) {
  const maxChars = Math.floor(budgetTokens * 3.8);
  const priorityFiles = [
    'src/lin_capsule_protocol.mjs',
    'src/lin_capsule_decoder.mjs',
    'src/lin_capsule_encoder.mjs',
    'spec/LIN_CAPSULE_001.rulel',
    'spec/LIN_CORE_ARCH.rulel',
    'AGENTS.md'
  ];

  let header = `[CONTEXT: REAL LIN CODEBASE (BUDGET: ${budgetTokens} TOKENS, ZERO CONVERSATION HISTORY)]\n`;
  let allocated = header;

  for (const filename of priorityFiles) {
    const fileSnippet = `\n--- FILE: ${filename} ---\n${REAL_LIN_FILES[filename]}\n`;
    if ((allocated.length + fileSnippet.length + task.prompt.length + 100) <= maxChars) {
      allocated += fileSnippet;
    } else {
      break;
    }
  }

  return `${allocated}\n\n${task.prompt}`;
}

export function allocateDistributedContextForCapsule(task, budgetTokens) {
  const maxChars = Math.floor(budgetTokens * 3.8);
  const baseLinobj = buildDistributedBaseLinobj();
  const capsuleParts = encodeCapsule(baseLinobj, { chunkSize: 300, compression: 'none' });
  const rehydrated = decodeCapsule(capsuleParts, {
    allowed_effects: baseLinobj.effects,
    authorized_capabilities: baseLinobj.capabilities
  });

  const fullProjection = {
    semantic_identity: rehydrated.linobj.semantic_hash,
    contracts: {
      effects: rehydrated.linobj.effects,
      capabilities: rehydrated.linobj.capabilities,
      invariants: rehydrated.linobj.invariants
    },
    ir: rehydrated.linobj.ir,
    provenance: rehydrated.linobj.provenance
  };

  const header = `[CONTEXT: VERIFIED LIN CAPSULE (ZERO SOURCE FILES, BUDGET: ${budgetTokens} TOKENS)]\n`;
  const body = JSON.stringify(fullProjection, null, 2);
  const total = `${header}${body}\n\n${task.prompt}`;

  if (total.length > maxChars) {
    const minimalProjection = {
      semantic_identity: rehydrated.linobj.semantic_hash,
      ir: rehydrated.linobj.ir
    };
    return `${header}${JSON.stringify(minimalProjection, null, 2)}\n\n${task.prompt}`;
  }

  return total;
}

export function allocateContextForControl(task) {
  // Controle: Fornece todos os arquivos completos sem restrição de budget
  let header = `[CONTEXT: FULL LIN REPOSITORY CONTROL GROUP (ALL 6 CORE FILES INCLUDED)]\n`;
  let allocated = header;
  for (const [filename, content] of Object.entries(REAL_LIN_FILES)) {
    allocated += `\n--- FILE: ${filename} ---\n${content}\n`;
  }
  return `${allocated}\n\n${task.prompt}`;
}

function sanitizeJsonResponse(rawText) {
  let text = rawText.trim();
  const doneIdx = text.indexOf('data: [DONE]');
  if (doneIdx !== -1) text = text.substring(0, doneIdx).trim();
  return text;
}

export async function executeDistributedTrial({
  task,
  group, // 'RAW', 'CAPSULE', 'CONTROL'
  budget = 16384,
  model = process.env.LLM_MODEL || 'kgw/kilo-auto/free',
  apiEndpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey = process.env.LLM_API_KEY
}) {
  let promptInput = '';
  if (group === 'RAW') promptInput = allocateDistributedContextForRaw(task, budget);
  else if (group === 'CAPSULE') promptInput = allocateDistributedContextForCapsule(task, budget);
  else if (group === 'CONTROL') promptInput = allocateContextForControl(task);

  const initialLinobj = buildDistributedBaseLinobj();
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

    if (!res.ok) return { status: 'HTTP_ERROR', group, budget, duration_ms: durationMs, error: rawBody };

    const sanitized = sanitizeJsonResponse(rawBody);
    let data;
    try { data = JSON.parse(sanitized); }
    catch (e) { return { status: 'PARSE_ERROR', group, budget, duration_ms: durationMs, error: e.message }; }

    const usage = data.usage || {};
    const rawOutput = data.choices?.[0]?.message?.content || '';

    let parsedPatch = null;
    try {
      const match = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonCandidate = (match ? match[1] : rawOutput).trim();
      parsedPatch = JSON.parse(jsonCandidate);
    } catch (e) {}

    if (!parsedPatch) {
      return {
        status: 'EXECUTED_LIVE',
        task_id: task.id,
        group,
        budget,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        patch_valid: false,
        oracle_pass: false,
        error: 'JSON Patch extraction failed'
      };
    }

    const patchResult = task.applyPatch(initialLinobj, parsedPatch);
    if (!patchResult.ok) {
      return {
        status: 'EXECUTED_LIVE',
        task_id: task.id,
        group,
        budget,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        patch_valid: false,
        oracle_pass: false,
        error: patchResult.error
      };
    }

    const oracleResult = task.oracle(patchResult.linobj);

    return {
      status: 'EXECUTED_LIVE',
      task_id: task.id,
      group,
      budget,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      duration_ms: durationMs,
      patch_valid: true,
      oracle_pass: oracleResult.pass,
      evidence: oracleResult.evidence,
      error: oracleResult.error
    };
  } catch (err) {
    return { status: 'CONNECTION_ERROR', task_id: task.id, group, budget, error: err.message };
  }
}
