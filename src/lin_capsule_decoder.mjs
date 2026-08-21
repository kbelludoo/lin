import { PROTOCOL_VERSION, canonicalJson, sha256, decompressPayload } from './lin_capsule_protocol.mjs';

/**
 * Validates and decodes a LIN Capsule payload from fragmented parts.
 * Enforces GATE A (Integrity) and GATE B (Rehydration & Contract Checking).
 * Never executes code or lowering (Gate C is decoupled).
 * 
 * @param {Array<Object>} parts - The fragmented capsule parts
 * @param {Object} policy - Host environment security policy for Gate B
 * @param {Array<string>} policy.allowed_effects - Allowed effect tokens
 * @param {Array<string>} policy.authorized_capabilities - Explicitly authorized capability tokens
 * @returns {Object} { ok: boolean, linobj?: Object, error?: string, gate?: string }
 */
export function decodeCapsule(parts, policy = {}) {
  // -------------------------------------------------------------
  // GATE A: INTEGRITY
  // -------------------------------------------------------------
  if (!Array.isArray(parts) || parts.length === 0) {
    return { ok: false, gate: 'GATE_A', error: 'CAPSULE_HEADER_VALID: parts must be a non-empty array' };
  }

  const expectedCount = parts[0].part_count;
  const expectedPayloadHash = parts[0].payload_hash;
  const expectedSemanticHash = parts[0].semantic_hash;
  const protocol = parts[0].protocol;

  if (protocol !== PROTOCOL_VERSION) {
    return { ok: false, gate: 'GATE_A', error: `CAPSULE_HEADER_VALID: unsupported protocol ${protocol}` };
  }

  if (parts.length !== expectedCount) {
    return { ok: false, gate: 'GATE_A', error: `CAPSULE_PART_COUNT_VALID: expected ${expectedCount} parts, got ${parts.length}` };
  }

  // Check ordering and per-part hash
  const orderedChunks = new Array(expectedCount);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (typeof part.part_index !== 'number' || part.part_index < 0 || part.part_index >= expectedCount) {
      return { ok: false, gate: 'GATE_A', error: `CAPSULE_PART_ORDER_VALID: invalid part_index ${part.part_index}` };
    }

    if (orderedChunks[part.part_index] !== undefined) {
      return { ok: false, gate: 'GATE_A', error: `CAPSULE_PART_ORDER_VALID: duplicate part_index ${part.part_index}` };
    }

    // Verify per-part hash
    const computedPartHash = sha256(part.chunk || '');
    if (computedPartHash !== part.part_hash) {
      return { ok: false, gate: 'GATE_A', error: `CAPSULE_PART_HASH_VALID: part ${part.part_index} checksum mismatch` };
    }

    // Verify consistency across parts
    if (part.payload_hash !== expectedPayloadHash || part.semantic_hash !== expectedSemanticHash) {
      return { ok: false, gate: 'GATE_A', error: 'CAPSULE_PAYLOAD_HASH_VALID: header metadata mismatch across parts' };
    }

    orderedChunks[part.part_index] = part.chunk;
  }

  // Ensure strict contiguous indexing without gaps
  for (let i = 0; i < expectedCount; i++) {
    if (orderedChunks[i] === undefined) {
      return { ok: false, gate: 'GATE_A', error: `CAPSULE_PART_ORDER_VALID: missing part at index ${i}` };
    }
  }

  // Reassemble payload and verify payload hash
  const reassembledBase64 = orderedChunks.join('');
  const computedPayloadHash = sha256(reassembledBase64);
  if (computedPayloadHash !== expectedPayloadHash) {
    return { ok: false, gate: 'GATE_A', error: 'CAPSULE_PAYLOAD_HASH_VALID: reassembled payload hash mismatch' };
  }

  // -------------------------------------------------------------
  // GATE B: REHYDRATION & CONTRACTS
  // -------------------------------------------------------------
  let artifact;
  try {
    const compressedBuf = Buffer.from(reassembledBase64, 'base64url');
    const decompressedJson = decompressPayload(compressedBuf, parts[0].compression).toString('utf8');
    artifact = JSON.parse(decompressedJson);
  } catch (err) {
    return { ok: false, gate: 'GATE_B', error: `CAPSULE_IR_VALID: decompression/parse error: ${err.message}` };
  }

  if (!artifact || typeof artifact !== 'object' || !artifact.ir || !artifact.identity) {
    return { ok: false, gate: 'GATE_B', error: 'CAPSULE_IR_VALID: malformed artifact structure' };
  }

  // Verify semantic hash matches canonical IR
  const canonicalIr = artifact.ir.canonical_ir;
  const computedSemanticHash = sha256(canonicalJson(canonicalIr));
  if (computedSemanticHash !== expectedSemanticHash || artifact.identity.semantic_hash !== expectedSemanticHash) {
    return { ok: false, gate: 'GATE_A', error: 'CAPSULE_SEMANTIC_HASH_VALID: canonical IR hash mismatch' };
  }

  // Invariant verification
  const invariants = artifact.contracts?.invariants;
  if (!invariants || invariants.verified !== true) {
    return { ok: false, gate: 'GATE_B', error: 'CAPSULE_INVARIANTS_VALID: invariant proof missing or unverified' };
  }

  // Effect manifest verification against host allowed envelope
  const declaredEffects = artifact.contracts?.effects || [];
  const allowedEffects = new Set(policy.allowed_effects || ['io:pure', 'io:stdout']);
  for (const effect of declaredEffects) {
    if (!allowedEffects.has(effect)) {
      return { ok: false, gate: 'GATE_B', error: `CAPSULE_EFFECTS_VALID: effect ${effect} exceeds allowed host envelope` };
    }
  }

  // Capability manifest verification against host authorized policy
  const declaredCaps = artifact.contracts?.capabilities || [];
  const authorizedCaps = new Set(policy.authorized_capabilities || []);
  for (const cap of declaredCaps) {
    if (!authorizedCaps.has(cap)) {
      return { ok: false, gate: 'GATE_B', error: `CAPSULE_CAPABILITIES_VALID: capability ${cap} denied by local policy` };
    }
  }

  // Success: produce fully verified LINOBJ
  const linobj = {
    ir: canonicalIr,
    semantic_hash: artifact.identity.semantic_hash,
    workflow_hash: artifact.identity.workflow_hash,
    source_digest: artifact.identity.source_digest,
    effects: declaredEffects,
    capabilities: declaredCaps,
    invariants: invariants,
    lowering_hints: artifact.ir.lowering_hints || {},
    provenance: artifact.provenance || {}
  };

  return {
    ok: true,
    gate: 'GATE_B_PASSED',
    linobj
  };
}
