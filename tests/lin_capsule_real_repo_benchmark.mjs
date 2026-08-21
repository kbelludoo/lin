import fs from 'node:fs';
import path from 'node:path';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { canonicalJson, sha256 } from '../src/lin_capsule_protocol.mjs';

// ----------------------------------------------------------------------
// 1. REPOSITÓRIO REAL DO LIN: Carrega arquivos reais da base de código
// ----------------------------------------------------------------------
const REAL_LIN_FILES = {
  'AGENTS.md': fs.readFileSync('AGENTS.md', 'utf8'),
  'spec/LIN_CORE_ARCH.rulel': fs.readFileSync('spec/LIN_CORE_ARCH.rulel', 'utf8'),
  'spec/LIN_CAPSULE_001.rulel': fs.readFileSync('spec/LIN_CAPSULE_001.rulel', 'utf8'),
  'src/lin_capsule_protocol.mjs': fs.readFileSync('src/lin_capsule_protocol.mjs', 'utf8'),
  'src/lin_capsule_encoder.mjs': fs.readFileSync('src/lin_capsule_encoder.mjs', 'utf8'),
  'src/lin_capsule_decoder.mjs': fs.readFileSync('src/lin_capsule_decoder.mjs', 'utf8')
};

// ----------------------------------------------------------------------
// 2. TAREFA REAL NO PRÓPRIO LIN:
//    Adicionar suporte ao algoritmo de compressão 'lz4' preservando
//    todo o pipeline de integridade e contratos do LIN Capsule.
// ----------------------------------------------------------------------
const REAL_REPO_TASK = {
  id: 'REAL_LIN_REPO_LZ4_EXTENSION',
  name: 'Real LIN Core Extension: LZ4 Compression Support in Capsule Pipeline',
  prompt: `You are an autonomous systems engineer operating with ZERO conversation history on the real LIN repository.
TASK: Add 'lz4' compression support to the LIN Capsule protocol pipeline without breaking existing protocols (brotli, gzip, none).
REQUIREMENTS:
1. In the protocol compression contracts, declare support for 'lz4' in allowed compression algorithms.
2. Add a new invariant rule 'lz4_decompression_bounded' to contracts.invariants.rules.
3. Output ONLY a valid JSON patch block formatted as:
\`\`\`json
{
  "action": "extend_capsule_compression",
  "added_algorithms": ["lz4"],
  "new_invariant": "lz4_decompression_bounded"
}
\`\`\``,
  
  // Constrói o LINOBJ real do subsistema de Cápsula do LIN
  buildRealLinobj: () => {
    const ir = {
      module: "LIN_CAPSULE_CORE",
      version: "1.1.0",
      components: [
        { name: "protocol", file: "src/lin_capsule_protocol.mjs", supported_compression: ["brotli", "gzip", "none"] },
        { name: "encoder", file: "src/lin_capsule_encoder.mjs", default_compression: "brotli" },
        { name: "decoder", file: "src/lin_capsule_decoder.mjs", strict_gates: ["GATE_A", "GATE_B"] }
      ]
    };
    return {
      ir,
      semantic_hash: sha256(canonicalJson(ir)),
      workflow_hash: sha256("workflow:lin_capsule_real_repo"),
      source_digest: sha256(REAL_LIN_FILES['src/lin_capsule_protocol.mjs']),
      effects: ["io:pure", "io:buffer_alloc"],
      capabilities: ["cap:compression_native"],
      invariants: {
        verified: true,
        rules: [
          "CAPSULE_HEADER_VALID",
          "CAPSULE_PART_HASH_VALID",
          "CAPSULE_PAYLOAD_HASH_VALID",
          "CAPSULE_SEMANTIC_HASH_VALID"
        ]
      },
      provenance: {
        known_good_targets: { rust: { status: "EQUIVALENT" }, zig: { status: "EQUIVALENT" } }
      }
    };
  },

  applyPatch: (baseLinobj, patch) => {
    if (patch.action !== 'extend_capsule_compression' || !Array.isArray(patch.added_algorithms)) {
      return { ok: false, error: 'Invalid extend_capsule_compression patch structure' };
    }
    const cloned = JSON.parse(JSON.stringify(baseLinobj));
    const protoComp = cloned.ir.components.find(c => c.name === 'protocol');
    if (protoComp) {
      for (const alg of patch.added_algorithms) {
        if (!protoComp.supported_compression.includes(alg)) {
          protoComp.supported_compression.push(alg);
        }
      }
    }
    if (patch.new_invariant && !cloned.invariants.rules.includes(patch.new_invariant)) {
      cloned.invariants.rules.push(patch.new_invariant);
    }
    cloned.semantic_hash = sha256(canonicalJson(cloned.ir));
    return { ok: true, linobj: cloned };
  },

  oracle: (mutatedLinobj) => {
    const protoComp = mutatedLinobj.ir.components?.find(c => c.name === 'protocol');
    const comps = protoComp?.supported_compression || [];
    const hasBrotli = comps.includes('brotli');
    const hasGzip = comps.includes('gzip');
    const hasLz4 = comps.includes('lz4');
    const invRules = mutatedLinobj.invariants?.rules || [];
    const baseInvsIntact = ["CAPSULE_HEADER_VALID", "CAPSULE_PART_HASH_VALID", "CAPSULE_PAYLOAD_HASH_VALID", "CAPSULE_SEMANTIC_HASH_VALID"].every(r => invRules.includes(r));
    const hasLz4Inv = invRules.includes('lz4_decompression_bounded');
    const pass = hasBrotli && hasGzip && hasLz4 && baseInvsIntact && hasLz4Inv;
    return { pass, error: pass ? null : 'Failed LZ4 extension or corrupted base capsule invariants' };
  }
};

function sanitizeJsonResponse(rawText) {
  let text = rawText.trim();
  const doneIdx = text.indexOf('data: [DONE]');
  if (doneIdx !== -1) {
    text = text.substring(0, doneIdx).trim();
  }
  return text;
}

export async function executeRealRepoTrial({
  group,
  trialIndex = 1,
  model = process.env.LLM_MODEL || 'kgw/kilo-auto/free',
  apiEndpoint = process.env.LLM_API_ENDPOINT || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey = process.env.LLM_API_KEY
}) {
  if (!apiKey) {
    return { status: 'AUTH_KEY_MISSING', error: 'LLM_API_KEY missing' };
  }

  const initialLinobj = REAL_REPO_TASK.buildRealLinobj();
  let promptInput = '';

  if (group === 'GROUP_A_RAW_TREE') {
    // Grupo A: Recebe a árvore real completa de arquivos do LIN
    let treeStr = '[CONTEXT: REAL LIN CODEBASE MULTI-FILES TREE (ZERO CONVERSATION HISTORY)]\n';
    for (const [filename, content] of Object.entries(REAL_LIN_FILES)) {
      treeStr += `\n--- FILE: ${filename} ---\n${content}\n`;
    }
    promptInput = `${treeStr}\n\n${REAL_REPO_TASK.prompt}`;
  } else {
    // Grupo B: Recebe a Cápsula Semântica Verificada do LIN (0 arquivos de código)
    const capsuleParts = encodeCapsule(initialLinobj, { chunkSize: 300, compression: 'none' });
    const rehydrated = decodeCapsule(capsuleParts, {
      allowed_effects: initialLinobj.effects,
      authorized_capabilities: initialLinobj.capabilities
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
      ir: rehydrated.linobj.ir,
      provenance: rehydrated.linobj.provenance
    };

    promptInput = `[CONTEXT: VERIFIED LIN REPOSITORY CAPSULE (0 SOURCE FILES, ZERO CONVERSATION HISTORY)]
${JSON.stringify(semanticProjection, null, 2)}

${REAL_REPO_TASK.prompt}`;
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
        group,
        duration_ms: durationMs,
        error: e.message
      };
    }

    const usage = data.usage || {};
    const effectiveModel = data.model || model;
    const rawOutput = data.choices?.[0]?.message?.content || '';

    // Extrai patch JSON
    let parsedPatch = null;
    try {
      const match = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonCandidate = (match ? match[1] : rawOutput).trim();
      parsedPatch = JSON.parse(jsonCandidate);
    } catch (e) {
      // Patch parsing error
    }

    if (!parsedPatch) {
      return {
        status: 'EXECUTED_LIVE',
        trial_index: trialIndex,
        group,
        effective_model: effectiveModel,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        patch_valid: false,
        oracle_pass: false,
        oracle_error: 'Patch JSON extraction failed'
      };
    }

    const patchResult = REAL_REPO_TASK.applyPatch(initialLinobj, parsedPatch);
    if (!patchResult.ok) {
      return {
        status: 'EXECUTED_LIVE',
        trial_index: trialIndex,
        group,
        effective_model: effectiveModel,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        duration_ms: durationMs,
        patch_valid: false,
        oracle_pass: false,
        oracle_error: patchResult.error
      };
    }

    const oracleResult = REAL_REPO_TASK.oracle(patchResult.linobj);

    return {
      status: 'EXECUTED_LIVE',
      trial_index: trialIndex,
      group,
      effective_model: effectiveModel,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      duration_ms: durationMs,
      patch_valid: true,
      oracle_pass: oracleResult.pass,
      oracle_error: oracleResult.error
    };
  } catch (err) {
    return {
      status: 'CONNECTION_ERROR',
      trial_index: trialIndex,
      group,
      error: err.message
    };
  }
}
