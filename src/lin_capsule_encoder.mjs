import { PROTOCOL_VERSION, canonicalJson, sha256, compressPayload, chunkData } from './lin_capsule_protocol.mjs';

/**
 * Encodes a LINOBJ into a verified LIN Capsule format with multi-part chunks.
 * 
 * @param {Object} linobj - The LINOBJ object containing canonical IR, contracts, provenance, etc.
 * @param {Object} options - Encoding options (compression, chunkSize, etc.)
 * @returns {Array<Object>} List of structured capsule parts ready for transport
 */
export function encodeCapsule(linobj, options = {}) {
  if (!linobj || typeof linobj !== 'object') {
    throw new Error('Invalid LINOBJ: must be a non-null object');
  }

  const compression = options.compression || 'brotli';
  const chunkSize = options.chunkSize || 500;

  // Extract canonical elements
  const canonicalIr = linobj.ir || linobj.ast || {};
  const semanticHash = linobj.semantic_hash || sha256(canonicalJson(canonicalIr));
  const workflowHash = linobj.workflow_hash || sha256(canonicalJson(linobj.workflow || {}));
  const sourceDigest = linobj.source_digest || (linobj.source ? sha256(linobj.source) : sha256(''));

  const contracts = {
    effects: Array.isArray(linobj.effects) ? [...linobj.effects].sort() : [],
    capabilities: Array.isArray(linobj.capabilities) ? [...linobj.capabilities].sort() : [],
    invariants: linobj.invariants || {
      verified: true,
      rules: []
    }
  };

  const ir = {
    canonical_ir: canonicalIr,
    lowering_hints: linobj.lowering_hints || {}
  };

  const provenance = {
    known_good_targets: linobj.known_good_targets || {},
    oracle_gate: linobj.oracle_gate || 'UNKNOWN',
    benchmark_provenance: linobj.benchmark_provenance || {}
  };

  // Full payload to compress and protect
  const fullArtifact = {
    protocol: PROTOCOL_VERSION,
    identity: {
      semantic_hash: semanticHash,
      workflow_hash: workflowHash,
      source_digest: sourceDigest
    },
    contracts,
    ir,
    provenance
  };

  const canonicalArtifactJson = canonicalJson(fullArtifact);
  const { data: compressedData, compression: usedCompression } = compressPayload(canonicalArtifactJson, compression);
  const payloadBase64 = Buffer.from(compressedData).toString('base64url');
  const payloadHash = sha256(payloadBase64);

  const rawChunks = chunkData(payloadBase64, chunkSize);
  const partCount = rawChunks.length;

  const parts = rawChunks.map((chunkStr, index) => {
    const partHash = sha256(chunkStr);
    return {
      protocol: PROTOCOL_VERSION,
      part_index: index,
      part_count: partCount,
      display_badge: `[${index + 1}/${partCount}]`,
      part_hash: partHash,
      payload_hash: payloadHash,
      semantic_hash: semanticHash,
      compression: usedCompression,
      encoding: 'base64url',
      chunk: chunkStr
    };
  });

  return parts;
}
