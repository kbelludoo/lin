import fs from 'node:fs';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { canonicalJson, sha256 } from '../src/lin_capsule_protocol.mjs';

export const REAL_LIN_FILES = {
  'AGENTS.md': fs.readFileSync('AGENTS.md', 'utf8'),
  'spec/LIN_CORE_ARCH.rulel': fs.readFileSync('spec/LIN_CORE_ARCH.rulel', 'utf8'),
  'spec/LIN_CAPSULE_001.rulel': fs.readFileSync('spec/LIN_CAPSULE_001.rulel', 'utf8'),
  'src/lin_capsule_protocol.mjs': fs.readFileSync('src/lin_capsule_protocol.mjs', 'utf8'),
  'src/lin_capsule_encoder.mjs': fs.readFileSync('src/lin_capsule_encoder.mjs', 'utf8'),
  'src/lin_capsule_decoder.mjs': fs.readFileSync('src/lin_capsule_decoder.mjs', 'utf8')
};

export function buildDistributedBaseLinobj() {
  const ir = {
    module: "LIN_CAPSULE_CORE",
    version: "1.1.0",
    components: [
      {
        name: "protocol",
        file: "src/lin_capsule_protocol.mjs",
        supported_compression: ["brotli", "gzip", "none"],
        chunk_size_default: 500,
        indexing: "0-based",
        wire_version: "LIN_CAPSULE/1.0"
      },
      {
        name: "encoder",
        file: "src/lin_capsule_encoder.mjs",
        compression_pipeline: ["canonical_json", "compress", "base64url", "chunk"],
        default_chunk_size: 500,
        compression_strategy: "brotli"
      },
      {
        name: "decoder",
        file: "src/lin_capsule_decoder.mjs",
        strict_gates: ["GATE_A", "GATE_B"],
        reassembly_limit_bytes: 10485760,
        policy_checks: ["allowed_effects", "authorized_capabilities"]
      }
    ]
  };

  return {
    ir,
    semantic_hash: sha256(canonicalJson(ir)),
    workflow_hash: sha256("workflow:lin_capsule_distributed"),
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
      known_good_targets: {
        rust: { status: "EQUIVALENT", evidence_id: "ev_rust_01" },
        zig: { status: "EQUIVALENT", evidence_id: "ev_zig_01" }
      }
    }
  };
}

// ---------------------------------------------------------------------------------
// CORPUS DE 10 TAREFAS: PROMPTS DECLARATIVOS SEM REVELAR VALORES DA SOLUÇÃO
// ---------------------------------------------------------------------------------
export const DISTRIBUTED_TASK_CORPUS = [
  {
    id: "DIST_01_LZ4_PIPELINE",
    name: "Cross-Component LZ4 Compression Extension",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_encoder.mjs", "src/lin_capsule_decoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "encoder", "decoder", "spec"],
    validPatch: { action: "extend_compression_pipeline", protocol_algorithm: "lz4", encoder_strategy: "lz4", decoder_supported: true, spec_invariant: "lz4_decompression_bounded" },
    falsifications: {
      protocol: { action: "extend_compression_pipeline", encoder_strategy: "lz4", decoder_supported: true, spec_invariant: "lz4_decompression_bounded" },
      encoder: { action: "extend_compression_pipeline", protocol_algorithm: "lz4", decoder_supported: true, spec_invariant: "lz4_decompression_bounded" },
      decoder: { action: "extend_compression_pipeline", protocol_algorithm: "lz4", encoder_strategy: "lz4", spec_invariant: "lz4_decompression_bounded" },
      spec: { action: "extend_compression_pipeline", protocol_algorithm: "lz4", encoder_strategy: "lz4", decoder_supported: true }
    },
    prompt: `TASK: Extend the LIN Capsule pipeline with LZ4 compression support.
You must derive the exact component properties and invariant names from the supplied context to update protocol, encoder, decoder, and specification without breaking existing contracts.
OUTPUT: Output ONLY a JSON patch with action "extend_compression_pipeline" containing the required fields (protocol_algorithm, encoder_strategy, decoder_supported, spec_invariant).`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'extend_compression_pipeline') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const enc = c.ir.components.find(x => x.name === 'encoder');
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (patch.protocol_algorithm && !proto.supported_compression.includes(patch.protocol_algorithm)) proto.supported_compression.push(patch.protocol_algorithm);
      if (patch.encoder_strategy) enc.compression_strategy = patch.encoder_strategy;
      if (patch.decoder_supported) dec.supports_lz4 = true;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const enc = mutated.ir?.components?.find(x => x.name === 'encoder');
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.supported_compression?.includes('lz4') && proto?.supported_compression?.includes('brotli');
      const hasEnc = enc?.compression_strategy === 'lz4';
      const hasDec = dec?.supports_lz4 === true;
      const hasSpec = invs.includes('lz4_decompression_bounded') && invs.includes('CAPSULE_HEADER_VALID');
      const pass = Boolean(hasProto && hasEnc && hasDec && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), encoder: Boolean(hasEnc), decoder: Boolean(hasDec), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed cross-component LZ4 pipeline verification' };
    }
  },
  {
    id: "DIST_02_CHUNK_WINDOW_SYNC",
    name: "Synchronized Chunk Size Tuning (500 -> 1024)",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_encoder.mjs", "src/lin_capsule_decoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "encoder", "decoder", "spec"],
    validPatch: { action: "tune_chunk_window", protocol_chunk_size: 1024, encoder_chunk_size: 1024, decoder_max_accepted: 1024, spec_invariant: "CAPSULE_CHUNK_1024_VALID" },
    falsifications: {
      protocol: { action: "tune_chunk_window", encoder_chunk_size: 1024, decoder_max_accepted: 1024, spec_invariant: "CAPSULE_CHUNK_1024_VALID" },
      encoder: { action: "tune_chunk_window", protocol_chunk_size: 1024, decoder_max_accepted: 1024, spec_invariant: "CAPSULE_CHUNK_1024_VALID" },
      decoder: { action: "tune_chunk_window", protocol_chunk_size: 1024, encoder_chunk_size: 1024, spec_invariant: "CAPSULE_CHUNK_1024_VALID" },
      spec: { action: "tune_chunk_window", protocol_chunk_size: 1024, encoder_chunk_size: 1024, decoder_max_accepted: 1024 }
    },
    prompt: `TASK: Synchronize the chunk-window size to 1024 across protocol, encoder, decoder, and spec.
Derive the exact property fields and invariant from the codebase context.
OUTPUT: Output ONLY a JSON patch with action "tune_chunk_window" containing protocol_chunk_size, encoder_chunk_size, decoder_max_accepted, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'tune_chunk_window') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const enc = c.ir.components.find(x => x.name === 'encoder');
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (patch.protocol_chunk_size) proto.chunk_size_default = patch.protocol_chunk_size;
      if (patch.encoder_chunk_size) enc.default_chunk_size = patch.encoder_chunk_size;
      if (patch.decoder_max_accepted) dec.max_chunk_accepted = patch.decoder_max_accepted;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const enc = mutated.ir?.components?.find(x => x.name === 'encoder');
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.chunk_size_default === 1024;
      const hasEnc = enc?.default_chunk_size === 1024;
      const hasDec = dec?.max_chunk_accepted === 1024;
      const hasSpec = invs.includes('CAPSULE_CHUNK_1024_VALID') && invs.includes('CAPSULE_PART_HASH_VALID');
      const pass = Boolean(hasProto && hasEnc && hasDec && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), encoder: Boolean(hasEnc), decoder: Boolean(hasDec), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed cross-component chunk synchronization' };
    }
  },
  {
    id: "DIST_03_GATE_D_RESOURCE_BOUNDS",
    name: "Resource Limit Gate D Cross-Contract",
    requiredFiles: ["src/lin_capsule_decoder.mjs", "spec/LIN_CAPSULE_001.rulel", "src/lin_capsule_protocol.mjs"],
    componentsTested: ["decoder", "spec", "protocol"],
    validPatch: { action: "add_gate_d", gate: "GATE_D", policy_check: "resource_limits", protocol_bound: 10485760, spec_invariant: "GATE_D_BOUNDED_MEMORY" },
    falsifications: {
      decoder: { action: "add_gate_d", protocol_bound: 10485760, spec_invariant: "GATE_D_BOUNDED_MEMORY" },
      spec: { action: "add_gate_d", gate: "GATE_D", policy_check: "resource_limits", protocol_bound: 10485760 },
      protocol: { action: "add_gate_d", gate: "GATE_D", policy_check: "resource_limits", spec_invariant: "GATE_D_BOUNDED_MEMORY" }
    },
    prompt: `TASK: Introduce Gate D for memory resource limits across decoder, protocol, and specification.
Derive the strict gate identifiers, policy check token, payload byte limit, and invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "add_gate_d" containing gate, policy_check, protocol_bound, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_gate_d') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const dec = c.ir.components.find(x => x.name === 'decoder');
      const proto = c.ir.components.find(x => x.name === 'protocol');
      if (dec && patch.gate && !dec.strict_gates.includes(patch.gate)) dec.strict_gates.push(patch.gate);
      if (dec && patch.policy_check && !dec.policy_checks.includes(patch.policy_check)) dec.policy_checks.push(patch.policy_check);
      if (proto && patch.protocol_bound) proto.max_payload_bytes = patch.protocol_bound;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const invs = mutated.invariants?.rules || [];
      const hasDec = dec?.strict_gates?.includes('GATE_D') && dec?.policy_checks?.includes('resource_limits');
      const hasProto = proto?.max_payload_bytes === 10485760;
      const hasSpec = invs.includes('GATE_D_BOUNDED_MEMORY');
      const pass = Boolean(hasDec && hasProto && hasSpec);
      return { pass, evidence: { decoder: Boolean(hasDec), protocol: Boolean(hasProto), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed Gate D cross-component verification' };
    }
  },
  {
    id: "DIST_04_STREAMING_CHUNK_PROTOCOL",
    name: "Streaming Chunk Pipeline Mode",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_encoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "encoder", "spec"],
    validPatch: { action: "enable_streaming", streaming_encoding: "ndjson_stream", encoder_pipe_stage: "stream_emit", spec_invariant: "STREAMING_CHUNK_INTEGRITY" },
    falsifications: {
      protocol: { action: "enable_streaming", encoder_pipe_stage: "stream_emit", spec_invariant: "STREAMING_CHUNK_INTEGRITY" },
      encoder: { action: "enable_streaming", streaming_encoding: "ndjson_stream", spec_invariant: "STREAMING_CHUNK_INTEGRITY" },
      spec: { action: "enable_streaming", streaming_encoding: "ndjson_stream", encoder_pipe_stage: "stream_emit" }
    },
    prompt: `TASK: Enable streaming chunk pipeline mode across protocol, encoder, and specification.
Derive the streaming encoding, encoder pipeline stage, and spec invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "enable_streaming" containing streaming_encoding, encoder_pipe_stage, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'enable_streaming') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const enc = c.ir.components.find(x => x.name === 'encoder');
      if (proto && patch.streaming_encoding) proto.streaming_encoding = patch.streaming_encoding;
      if (enc && patch.encoder_pipe_stage && !enc.compression_pipeline.includes(patch.encoder_pipe_stage)) enc.compression_pipeline.push(patch.encoder_pipe_stage);
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const enc = mutated.ir?.components?.find(x => x.name === 'encoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.streaming_encoding === 'ndjson_stream';
      const hasEnc = enc?.compression_pipeline?.includes('stream_emit');
      const hasSpec = invs.includes('STREAMING_CHUNK_INTEGRITY');
      const pass = Boolean(hasProto && hasEnc && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), encoder: Boolean(hasEnc), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed streaming chunk pipeline verification' };
    }
  },
  {
    id: "DIST_05_EFFECT_SANDBOX_ENFORCEMENT",
    name: "Network & Buffer Effect Sandbox Isolation",
    requiredFiles: ["src/lin_capsule_decoder.mjs", "spec/LIN_CAPSULE_001.rulel", "src/lin_capsule_protocol.mjs"],
    componentsTested: ["decoder", "spec", "protocol"],
    validPatch: { action: "sandbox_effects", decoder_policy: "strict_effect_envelope", protocol_pure: true, spec_invariant: "EFFECT_ENVELOPE_UNBREAKABLE" },
    falsifications: {
      decoder: { action: "sandbox_effects", protocol_pure: true, spec_invariant: "EFFECT_ENVELOPE_UNBREAKABLE" },
      spec: { action: "sandbox_effects", decoder_policy: "strict_effect_envelope", protocol_pure: true },
      protocol: { action: "sandbox_effects", decoder_policy: "strict_effect_envelope", spec_invariant: "EFFECT_ENVELOPE_UNBREAKABLE" }
    },
    prompt: `TASK: Enforce strict effect envelope sandboxing across decoder, protocol, and spec.
Derive the policy check name, protocol pure IO flag, and invariant token from the context.
OUTPUT: Output ONLY a JSON patch with action "sandbox_effects" containing decoder_policy, protocol_pure, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'sandbox_effects') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const dec = c.ir.components.find(x => x.name === 'decoder');
      const proto = c.ir.components.find(x => x.name === 'protocol');
      if (dec && patch.decoder_policy && !dec.policy_checks.includes(patch.decoder_policy)) dec.policy_checks.push(patch.decoder_policy);
      if (proto && patch.protocol_pure) proto.is_pure_io = true;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const invs = mutated.invariants?.rules || [];
      const hasDec = dec?.policy_checks?.includes('strict_effect_envelope');
      const hasProto = proto?.is_pure_io === true;
      const hasSpec = invs.includes('EFFECT_ENVELOPE_UNBREAKABLE');
      const pass = Boolean(hasDec && hasProto && hasSpec);
      return { pass, evidence: { decoder: Boolean(hasDec), protocol: Boolean(hasProto), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed effect sandbox enforcement' };
    }
  },
  {
    id: "DIST_06_PROTOCOL_UPGRADE_NEGOTIATION",
    name: "Protocol v2.0 Capability Negotiation",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_decoder.mjs", "src/lin_capsule_encoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "encoder", "decoder", "spec"],
    validPatch: { action: "upgrade_protocol_v2", wire_version: "LIN_CAPSULE/2.0", encoder_header: "v2", decoder_fallback: "v1_compatible", spec_invariant: "PROTOCOL_V2_NEGOTIATED" },
    falsifications: {
      protocol: { action: "upgrade_protocol_v2", encoder_header: "v2", decoder_fallback: "v1_compatible", spec_invariant: "PROTOCOL_V2_NEGOTIATED" },
      encoder: { action: "upgrade_protocol_v2", wire_version: "LIN_CAPSULE/2.0", decoder_fallback: "v1_compatible", spec_invariant: "PROTOCOL_V2_NEGOTIATED" },
      decoder: { action: "upgrade_protocol_v2", wire_version: "LIN_CAPSULE/2.0", encoder_header: "v2", spec_invariant: "PROTOCOL_V2_NEGOTIATED" },
      spec: { action: "upgrade_protocol_v2", wire_version: "LIN_CAPSULE/2.0", encoder_header: "v2", decoder_fallback: "v1_compatible" }
    },
    prompt: `TASK: Upgrade wire protocol version to 2.0 with backward compatibility across protocol, encoder, decoder, and spec.
Derive the wire version string, encoder header, decoder fallback mode, and spec invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "upgrade_protocol_v2" containing wire_version, encoder_header, decoder_fallback, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'upgrade_protocol_v2') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const enc = c.ir.components.find(x => x.name === 'encoder');
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (proto && patch.wire_version) proto.wire_version = patch.wire_version;
      if (enc && patch.encoder_header) enc.header_version = patch.encoder_header;
      if (dec && patch.decoder_fallback) dec.fallback_mode = patch.decoder_fallback;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const enc = mutated.ir?.components?.find(x => x.name === 'encoder');
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.wire_version === 'LIN_CAPSULE/2.0';
      const hasEnc = enc?.header_version === 'v2';
      const hasDec = dec?.fallback_mode === 'v1_compatible';
      const hasSpec = invs.includes('PROTOCOL_V2_NEGOTIATED');
      const pass = Boolean(hasProto && hasEnc && hasDec && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), encoder: Boolean(hasEnc), decoder: Boolean(hasDec), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed protocol upgrade negotiation' };
    }
  },
  {
    id: "DIST_07_MERKLE_TREE_PAYLOAD_PROOF",
    name: "Merkle Tree Payload Chunk Proofs",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_decoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "decoder", "spec"],
    validPatch: { action: "enable_merkle_proofs", protocol_proof: "merkle_root_sha256", decoder_check: "merkle_leaf_valid", spec_invariant: "MERKLE_PROOF_STRICT" },
    falsifications: {
      protocol: { action: "enable_merkle_proofs", decoder_check: "merkle_leaf_valid", spec_invariant: "MERKLE_PROOF_STRICT" },
      decoder: { action: "enable_merkle_proofs", protocol_proof: "merkle_root_sha256", spec_invariant: "MERKLE_PROOF_STRICT" },
      spec: { action: "enable_merkle_proofs", protocol_proof: "merkle_root_sha256", decoder_check: "merkle_leaf_valid" }
    },
    prompt: `TASK: Implement Merkle Tree proofs across protocol, decoder, and spec.
Derive the protocol proof mode, decoder strict gate check, and spec invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "enable_merkle_proofs" containing protocol_proof, decoder_check, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'enable_merkle_proofs') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (proto && patch.protocol_proof) proto.proof_mode = patch.protocol_proof;
      if (dec && patch.decoder_check && !dec.strict_gates.includes(patch.decoder_check)) dec.strict_gates.push(patch.decoder_check);
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.proof_mode === 'merkle_root_sha256';
      const hasDec = dec?.strict_gates?.includes('merkle_leaf_valid');
      const hasSpec = invs.includes('MERKLE_PROOF_STRICT');
      const pass = Boolean(hasProto && hasDec && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), decoder: Boolean(hasDec), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed Merkle proof cross-verification' };
    }
  },
  {
    id: "DIST_08_FAIL_CLOSED_ERROR_REGISTRATION",
    name: "Standardized Fail-Closed Error Taxonomy",
    requiredFiles: ["src/lin_capsule_decoder.mjs", "src/lin_capsule_protocol.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["decoder", "protocol", "spec"],
    validPatch: { action: "register_error_taxonomy", decoder_handler: "typed_error_schema", protocol_enum: ["ERR_CORRUPT_CHUNK", "ERR_ORDER_GAP"], spec_invariant: "ERROR_TAXONOMY_TYPED" },
    falsifications: {
      decoder: { action: "register_error_taxonomy", protocol_enum: ["ERR_CORRUPT_CHUNK", "ERR_ORDER_GAP"], spec_invariant: "ERROR_TAXONOMY_TYPED" },
      protocol: { action: "register_error_taxonomy", decoder_handler: "typed_error_schema", spec_invariant: "ERROR_TAXONOMY_TYPED" },
      spec: { action: "register_error_taxonomy", decoder_handler: "typed_error_schema", protocol_enum: ["ERR_CORRUPT_CHUNK", "ERR_ORDER_GAP"] }
    },
    prompt: `TASK: Standardize typed fail-closed error taxonomy across decoder, protocol, and specification.
Derive the decoder error handler identifier, protocol error enum list, and spec invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "register_error_taxonomy" containing decoder_handler, protocol_enum, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'register_error_taxonomy') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const dec = c.ir.components.find(x => x.name === 'decoder');
      const proto = c.ir.components.find(x => x.name === 'protocol');
      if (dec && patch.decoder_handler) dec.error_handler = patch.decoder_handler;
      if (proto && Array.isArray(patch.protocol_enum)) proto.error_codes = patch.protocol_enum;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const invs = mutated.invariants?.rules || [];
      const hasDec = dec?.error_handler === 'typed_error_schema';
      const hasProto = Array.isArray(proto?.error_codes) && proto.error_codes.includes('ERR_CORRUPT_CHUNK');
      const hasSpec = invs.includes('ERROR_TAXONOMY_TYPED');
      const pass = Boolean(hasDec && hasProto && hasSpec);
      return { pass, evidence: { decoder: Boolean(hasDec), protocol: Boolean(hasProto), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed typed error taxonomy registration' };
    }
  },
  {
    id: "DIST_09_WASM_TARGET_PROVENANCE_SYNC",
    name: "WASM Lowering Target Cross-Verification",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_decoder.mjs", "spec/LIN_CORE_ARCH.rulel"],
    componentsTested: ["protocol", "decoder", "provenance"],
    validPatch: { action: "register_wasm_target", target: "wasm", evidence_id: "ev_wasm_01", decoder_runtime: "wasm_linear_memory", protocol_alignment: 8 },
    falsifications: {
      protocol: { action: "register_wasm_target", target: "wasm", evidence_id: "ev_wasm_01", decoder_runtime: "wasm_linear_memory" },
      decoder: { action: "register_wasm_target", target: "wasm", evidence_id: "ev_wasm_01", protocol_alignment: 8 },
      provenance: { action: "register_wasm_target", decoder_runtime: "wasm_linear_memory", protocol_alignment: 8 }
    },
    prompt: `TASK: Register WASM target provenance with linear memory and byte alignment in protocol and decoder.
Derive the target name, evidence ID, decoder runtime, and protocol alignment from the context.
OUTPUT: Output ONLY a JSON patch with action "register_wasm_target" containing target, evidence_id, decoder_runtime, and protocol_alignment.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'register_wasm_target') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (proto && patch.protocol_alignment) proto.byte_alignment = patch.protocol_alignment;
      if (dec && patch.decoder_runtime) dec.target_runtime = patch.decoder_runtime;
      if (patch.target && patch.evidence_id) {
        c.provenance.known_good_targets[patch.target] = { status: "EQUIVALENT", evidence_id: patch.evidence_id };
      }
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const kgt = mutated.provenance?.known_good_targets || {};
      const hasProto = proto?.byte_alignment === 8;
      const hasDec = dec?.target_runtime === 'wasm_linear_memory';
      const hasProvenance = kgt.wasm?.status === 'EQUIVALENT' && kgt.wasm?.evidence_id === 'ev_wasm_01';
      const pass = Boolean(hasProto && hasDec && hasProvenance);
      return { pass, evidence: { protocol: Boolean(hasProto), decoder: Boolean(hasDec), provenance: Boolean(hasProvenance) }, error: pass ? null : 'Failed WASM lowering target cross-verification' };
    }
  },
  {
    id: "DIST_10_CANONICAL_SIGNING_PIPELINE",
    name: "Canonical Key Ordering & Digest Signature",
    requiredFiles: ["src/lin_capsule_protocol.mjs", "src/lin_capsule_encoder.mjs", "spec/LIN_CAPSULE_001.rulel"],
    componentsTested: ["protocol", "encoder", "spec"],
    validPatch: { action: "enforce_canonical_signing", protocol_sorting: "lexicographical_keys", encoder_digest_algorithm: "sha256", spec_invariant: "CANONICAL_SIGNING_LOCKED" },
    falsifications: {
      protocol: { action: "enforce_canonical_signing", encoder_digest_algorithm: "sha256", spec_invariant: "CANONICAL_SIGNING_LOCKED" },
      encoder: { action: "enforce_canonical_signing", protocol_sorting: "lexicographical_keys", spec_invariant: "CANONICAL_SIGNING_LOCKED" },
      spec: { action: "enforce_canonical_signing", protocol_sorting: "lexicographical_keys", encoder_digest_algorithm: "sha256" }
    },
    prompt: `TASK: Enforce canonical key sorting and digest signature across protocol, encoder, and spec.
Derive the key sorting identifier, digest algorithm, and spec invariant from the context.
OUTPUT: Output ONLY a JSON patch with action "enforce_canonical_signing" containing protocol_sorting, encoder_digest_algorithm, and spec_invariant.`,
    applyPatch: (base, patch) => {
      if (patch.action !== 'enforce_canonical_signing') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const proto = c.ir.components.find(x => x.name === 'protocol');
      const enc = c.ir.components.find(x => x.name === 'encoder');
      if (proto && patch.protocol_sorting) proto.key_order = patch.protocol_sorting;
      if (enc && patch.encoder_digest_algorithm) enc.digest_algo = patch.encoder_digest_algorithm;
      if (patch.spec_invariant && !c.invariants.rules.includes(patch.spec_invariant)) c.invariants.rules.push(patch.spec_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const proto = mutated.ir?.components?.find(x => x.name === 'protocol');
      const enc = mutated.ir?.components?.find(x => x.name === 'encoder');
      const invs = mutated.invariants?.rules || [];
      const hasProto = proto?.key_order === 'lexicographical_keys';
      const hasEnc = enc?.digest_algo === 'sha256';
      const hasSpec = invs.includes('CANONICAL_SIGNING_LOCKED');
      const pass = Boolean(hasProto && hasEnc && hasSpec);
      return { pass, evidence: { protocol: Boolean(hasProto), encoder: Boolean(hasEnc), spec: Boolean(hasSpec) }, error: pass ? null : 'Failed canonical signing pipeline verification' };
    }
  }
];
