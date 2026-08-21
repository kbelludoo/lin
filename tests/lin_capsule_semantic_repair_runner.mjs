import { DISTRIBUTED_TASK_CORPUS, buildDistributedBaseLinobj, REAL_LIN_FILES } from './lin_capsule_distributed_corpus.mjs';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import fs from 'node:fs';

const endpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions';
const model = process.env.LLM_MODEL || 'kgw/kilo-auto/free';
const apiKey = process.env.LLM_API_KEY;
const MAX_REPAIR_ROUNDS = 3;
const MAX_HTTP_RETRIES = 3;

console.log('================================================================');
console.log('  LIN_CAPSULE: CLOSED-LOOP SEMANTIC REPAIR BENCHMARK (H-DIST-REPAIR) ');
console.log('================================================================\n');

console.log(`[CONFIGURAÇÃO]`);
console.log(`- Modelo: ${model}`);
console.log(`- Máximo de Rodadas de Reparo: ${MAX_REPAIR_ROUNDS}`);
console.log(`- Hardening de Transporte: ${MAX_HTTP_RETRIES} tentativas com backoff exponencial`);
console.log(`- Feedback Diagnóstico: Booleano por componente (Zero Leakage)`);
console.log(`- Grupos: CAPSULE vs RAW vs CONTROL (10 Tarefas cada)\n`);

if (!apiKey) {
  console.log('[ABORT] LLM_API_KEY environment variable is not set.');
  process.exit(1);
}

function allocatePrompt(task, group) {
  if (group === 'RAW') {
    let allocated = `[CONTEXT: REAL LIN CODEBASE (BUDGET: 8192 TOKENS, ZERO CONVERSATION HISTORY)]\n`;
    for (const file of ['src/lin_capsule_protocol.mjs', 'src/lin_capsule_decoder.mjs', 'src/lin_capsule_encoder.mjs', 'spec/LIN_CAPSULE_001.rulel']) {
      allocated += `\n--- FILE: ${file} ---\n${REAL_LIN_FILES[file]}\n`;
    }
    return `${allocated}\n\n${task.prompt}`;
  } else if (group === 'CAPSULE') {
    const baseLinobj = buildDistributedBaseLinobj();
    const capsuleParts = encodeCapsule(baseLinobj, { chunkSize: 300, compression: 'none' });
    const rehydrated = decodeCapsule(capsuleParts, { allowed_effects: baseLinobj.effects, authorized_capabilities: baseLinobj.capabilities });
    const projection = {
      semantic_identity: rehydrated.linobj.semantic_hash,
      contracts: { effects: rehydrated.linobj.effects, capabilities: rehydrated.linobj.capabilities, invariants: rehydrated.linobj.invariants },
      ir: rehydrated.linobj.ir,
      provenance: rehydrated.linobj.provenance
    };
    return `[CONTEXT: VERIFIED LIN CAPSULE (ZERO SOURCE FILES, BUDGET: 8192 TOKENS)]\n${JSON.stringify(projection, null, 2)}\n\n${task.prompt}`;
  } else if (group === 'CONTROL') {
    let allocated = `[CONTEXT: FULL LIN REPOSITORY CONTROL GROUP (ALL FILES)]\n`;
    for (const [file, content] of Object.entries(REAL_LIN_FILES)) {
      allocated += `\n--- FILE: ${file} ---\n${content}\n`;
    }
    return `${allocated}\n\n${task.prompt}`;
  }
}

function sanitizeJsonResponse(rawText) {
  let text = rawText.trim();
  const doneIdx = text.indexOf('data: [DONE]');
  if (doneIdx !== -1) text = text.substring(0, doneIdx).trim();
  return text;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callLlmWithRetry(messages) {
  let attempt = 0;
  while (attempt < MAX_HTTP_RETRIES) {
    attempt++;
    const startTime = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.0 })
      });

      const rawBody = await res.text();
      const durationMs = Date.now() - startTime;

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_HTTP_RETRIES) {
          const waitMs = attempt * 5000;
          await sleep(waitMs);
          continue;
        }
        return { ok: false, isInfraError: true, httpStatus: res.status, error: rawBody, durationMs };
      }

      if (!res.ok) {
        return { ok: false, isInfraError: false, httpStatus: res.status, error: rawBody, durationMs };
      }

      const sanitized = sanitizeJsonResponse(rawBody);
      let data;
      try { data = JSON.parse(sanitized); } catch (e) { return { ok: false, isInfraError: false, error: e.message, durationMs }; }
      const rawOutput = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};
      let parsedPatch = null;
      try {
        const match = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonCandidate = (match ? match[1] : rawOutput).trim();
        parsedPatch = JSON.parse(jsonCandidate);
      } catch (e) {}

      return { ok: true, rawOutput, parsedPatch, usage, durationMs };
    } catch (err) {
      if (attempt < MAX_HTTP_RETRIES) {
        await sleep(attempt * 5000);
        continue;
      }
      return { ok: false, isInfraError: true, error: err.message, durationMs: Date.now() - startTime };
    }
  }
}

export async function runClosedLoopTask({ task, group }) {
  const initialLinobj = buildDistributedBaseLinobj();
  const initialPrompt = allocatePrompt(task, group);

  const messages = [{ role: 'user', content: initialPrompt }];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalDurationMs = 0;
  const roundTrace = [];

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round++) {
    const llmRes = await callLlmWithRetry(messages);

    if (!llmRes.ok) {
      if (llmRes.isInfraError) {
        return {
          task_id: task.id,
          group,
          status: 'INFRA_ERROR',
          http_status: llmRes.httpStatus,
          error: llmRes.error,
          round_aborted: round,
          round_trace: roundTrace
        };
      }
      return {
        task_id: task.id,
        group,
        status: 'PROTOCOL_ERROR',
        error: llmRes.error,
        round_aborted: round,
        round_trace: roundTrace
      };
    }

    totalPromptTokens += llmRes.usage.prompt_tokens || 0;
    totalCompletionTokens += llmRes.usage.completion_tokens || 0;
    totalDurationMs += llmRes.durationMs;

    if (!llmRes.parsedPatch) {
      roundTrace.push({ round, outcome: 'INVALID_JSON', evidence: null });
      if (round < MAX_REPAIR_ROUNDS) {
        messages.push({ role: 'assistant', content: llmRes.rawOutput });
        messages.push({ role: 'user', content: 'Diagnostic: Failed to extract a valid JSON patch block. Output ONLY the JSON patch inside a ```json markdown block.' });
        continue;
      }
      break;
    }

    const patchResult = task.applyPatch(initialLinobj, llmRes.parsedPatch);
    if (!patchResult.ok) {
      roundTrace.push({ round, outcome: 'INVALID_PATCH_STRUCTURE', error: patchResult.error });
      if (round < MAX_REPAIR_ROUNDS) {
        messages.push({ role: 'assistant', content: llmRes.rawOutput });
        messages.push({ role: 'user', content: `Diagnostic: Patch structure invalid: ${patchResult.error}. Output a valid corrected JSON patch.` });
        continue;
      }
      break;
    }

    const oracleResult = task.oracle(patchResult.linobj);

    if (oracleResult.pass) {
      roundTrace.push({ round, outcome: 'PASS', evidence: oracleResult.evidence });
      return {
        task_id: task.id,
        group,
        status: 'VALID_EVALUATION',
        final_pass: true,
        round_passed: round,
        rounds_used: round,
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        duration_ms: totalDurationMs,
        round_trace: roundTrace
      };
    }

    roundTrace.push({ round, outcome: 'ORACLE_FAIL', evidence: oracleResult.evidence });

    if (round < MAX_REPAIR_ROUNDS) {
      const diagnosticStr = Object.entries(oracleResult.evidence)
        .map(([comp, status]) => `  - Component '${comp}': ${status ? 'SATISFIED' : 'UNSATISFIED'}`)
        .join('\n');

      const repairFeedback = `The patch failed cross-component contract verification.
Diagnostic Evidence Report:
${diagnosticStr}

Instruction:
Repair the JSON patch so that all UNSATISFIED components are properly addressed and satisfied simultaneously.
Derive the missing fields and contracts from the supplied context.
Output ONLY the corrected JSON patch inside a \`\`\`json block.`;

      messages.push({ role: 'assistant', content: llmRes.rawOutput });
      messages.push({ role: 'user', content: repairFeedback });
    }
  }

  // Falhou após esgotar rodadas de reparo
  return {
    task_id: task.id,
    group,
    status: 'VALID_EVALUATION',
    final_pass: false,
    round_passed: null,
    rounds_used: MAX_REPAIR_ROUNDS,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    duration_ms: totalDurationMs,
    round_trace: roundTrace
  };
}

const campaignResults = [];

console.log('▶ EXECUTANDO CAMPANHA FECHADA COM CICLO DE REPARO SEMÂNTICO (30 Ensaios Multi-Round)...\n');

for (const group of ['CAPSULE', 'RAW', 'CONTROL']) {
  console.log(`\n================================================================`);
  console.log(`  GRUPO: ${group} (10 Tarefas com até ${MAX_REPAIR_ROUNDS} rodadas de reparo)`);
  console.log(`================================================================`);

  for (const task of DISTRIBUTED_TASK_CORPUS) {
    process.stdout.write(`  Task ${task.id}: `);
    const res = await runClosedLoopTask({ task, group });
    if (res.status === 'INFRA_ERROR') {
      console.log(`INFRA_ERROR (${res.http_status || 'network'} - round ${res.round_aborted})`);
    } else if (res.final_pass) {
      console.log(`PASS (Round ${res.round_passed}) | Tokens: ${res.completion_tokens} | ${res.duration_ms}ms`);
    } else {
      console.log(`FAIL (após ${res.rounds_used} rounds) | Tokens: ${res.completion_tokens} | ${res.duration_ms}ms`);
    }
    campaignResults.push(res);
  }
}

fs.writeFileSync('storage/lin_capsule_repair_campaign_raw.json', JSON.stringify(campaignResults, null, 2));

console.log('\n================================================================');
console.log('         MATRIZ COMPARATIVA DE CONVERGÊNCIA POR REPARO          ');
console.log('================================================================');
console.log('| Grupo    | Válidos | Infra Err | R0 (Zero-Shot) | R1 (1º Feedback) | R2 (2º Feedback) | Final Pass Rate | Mean Rounds |');
console.log('|:---------|:--------|:----------|:---------------|:-----------------|:-----------------|:----------------|:------------|');

for (const group of ['CAPSULE', 'RAW', 'CONTROL']) {
  const gTrials = campaignResults.filter(r => r.group === group);
  const validTrials = gTrials.filter(r => r.status === 'VALID_EVALUATION');
  const infraErrors = gTrials.filter(r => r.status === 'INFRA_ERROR').length;
  
  const r0 = validTrials.filter(r => r.final_pass && r.round_passed === 0).length;
  const r1 = validTrials.filter(r => r.final_pass && r.round_passed <= 1).length;
  const r2 = validTrials.filter(r => r.final_pass && r.round_passed <= 2).length;
  const finalPass = validTrials.filter(r => r.final_pass).length;
  const totalValid = validTrials.length;
  
  const meanRounds = totalValid > 0 ? (validTrials.reduce((s, r) => s + (r.rounds_used || 0), 0) / totalValid).toFixed(1) : 'N/A';

  const vStr = `${totalValid}/10`;
  const errStr = `${infraErrors}`;
  const r0Str = totalValid > 0 ? `${r0}/${totalValid} (${((r0/totalValid)*100).toFixed(0)}%)` : '0/0';
  const r1Str = totalValid > 0 ? `${r1}/${totalValid} (${((r1/totalValid)*100).toFixed(0)}%)` : '0/0';
  const r2Str = totalValid > 0 ? `${r2}/${totalValid} (${((r2/totalValid)*100).toFixed(0)}%)` : '0/0';
  const finalStr = totalValid > 0 ? `${finalPass}/${totalValid} (${((finalPass/totalValid)*100).toFixed(0)}%)` : '0/0';

  console.log(`| ${group.padEnd(8)} | ${vStr.padEnd(7)} | ${errStr.padEnd(9)} | ${r0Str.padEnd(14)} | ${r1Str.padEnd(16)} | ${r2Str.padEnd(16)} | ${finalStr.padEnd(15)} | ${meanRounds.padEnd(11)} |`);
}
console.log('================================================================\n');
