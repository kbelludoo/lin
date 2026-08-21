import fs from 'node:fs';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { canonicalJson, sha256 } from '../src/lin_capsule_protocol.mjs';

// Base real files from the repository
export const REAL_LIN_FILES = {
  'AGENTS.md': fs.readFileSync('AGENTS.md', 'utf8'),
  'spec/LIN_CORE_ARCH.rulel': fs.readFileSync('spec/LIN_CORE_ARCH.rulel', 'utf8'),
  'spec/LIN_CAPSULE_001.rulel': fs.readFileSync('spec/LIN_CAPSULE_001.rulel', 'utf8'),
  'src/lin_capsule_protocol.mjs': fs.readFileSync('src/lin_capsule_protocol.mjs', 'utf8'),
  'src/lin_capsule_encoder.mjs': fs.readFileSync('src/lin_capsule_encoder.mjs', 'utf8'),
  'src/lin_capsule_decoder.mjs': fs.readFileSync('src/lin_capsule_decoder.mjs', 'utf8')
};

export function buildBaseCapsuleLinobj() {
  const ir = {
    module: "LIN_CAPSULE_CORE",
    version: "1.1.0",
    components: [
      { 
        name: "protocol", 
        file: "src/lin_capsule_protocol.mjs", 
        supported_compression: ["brotli", "gzip", "none"],
        encoding: "base64url",
        chunk_size_default: 500,
        indexing: "0-based"
      },
      { 
        name: "encoder", 
        file: "src/lin_capsule_encoder.mjs", 
        default_compression: "brotli" 
      },
      { 
        name: "decoder", 
        file: "src/lin_capsule_decoder.mjs", 
        strict_gates: ["GATE_A", "GATE_B"],
        policy_checks: ["allowed_effects", "authorized_capabilities"]
      }
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
      known_good_targets: { 
        rust: { status: "EQUIVALENT", evidence_id: "ev_rust_01" }, 
        zig: { status: "EQUIVALENT", evidence_id: "ev_zig_01" } 
      }
    }
  };
}

export const DIVERSE_TASK_CORPUS = [
  {
    id: "TASK_01_COMPRESSION",
    name: "Add LZ4 Compression Support",
    prompt: `TASK: Add 'lz4' compression support to LIN Capsule without breaking existing algorithms (brotli, gzip, none).
REQUIREMENTS:
1. In protocol component, add 'lz4' to supported_compression.
2. Add invariant 'lz4_decompression_bounded' to invariants.rules.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "extend_compression",
  "added_algorithms": ["lz4"],
  "new_invariant": "lz4_decompression_bounded"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'extend_compression' || !Array.isArray(patch.added_algorithms)) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const p = c.ir.components.find(x => x.name === 'protocol');
      patch.added_algorithms.forEach(a => { if (!p.supported_compression.includes(a)) p.supported_compression.push(a); });
      if (patch.new_invariant && !c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const comps = mutated.ir?.components?.find(x => x.name === 'protocol')?.supported_compression || [];
      const invs = mutated.invariants?.rules || [];
      const pass = comps.includes('brotli') && comps.includes('gzip') && comps.includes('lz4') &&
                   invs.includes('CAPSULE_HEADER_VALID') && invs.includes('lz4_decompression_bounded');
      return { pass, error: pass ? null : 'Failed LZ4 extension or baseline invariant broken' };
    }
  },
  {
    id: "TASK_02_INTEGRITY",
    name: "Add Strict Merkle Tree Invariant",
    prompt: `TASK: Add 'CAPSULE_MERKLE_TREE_VALID' to invariants without removing existing integrity invariants.
REQUIREMENTS:
1. Add 'CAPSULE_MERKLE_TREE_VALID' to invariants.rules.
2. Preserve all 4 baseline CAPSULE_* invariants.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_invariant",
  "new_invariant": "CAPSULE_MERKLE_TREE_VALID"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_invariant' || !patch.new_invariant) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      if (!c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const invs = mutated.invariants?.rules || [];
      const baseIntact = ["CAPSULE_HEADER_VALID", "CAPSULE_PART_HASH_VALID", "CAPSULE_PAYLOAD_HASH_VALID", "CAPSULE_SEMANTIC_HASH_VALID"].every(r => invs.includes(r));
      const hasMerkle = invs.includes('CAPSULE_MERKLE_TREE_VALID');
      const pass = baseIntact && hasMerkle;
      return { pass, error: pass ? null : 'Failed Merkle invariant addition or corrupted base invariants' };
    }
  },
  {
    id: "TASK_03_GATES",
    name: "Introduce Gate D Resource Envelope",
    prompt: `TASK: Introduce 'GATE_D' (resource limit validation) to decoder strict gates.
REQUIREMENTS:
1. In decoder component, add 'GATE_D' to strict_gates.
2. Preserve existing GATE_A and GATE_B.
3. Add invariant 'GATE_D_BOUNDED_MEMORY' to invariants.rules.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_gate",
  "new_gate": "GATE_D",
  "new_invariant": "GATE_D_BOUNDED_MEMORY"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_gate' || !patch.new_gate) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (dec && !dec.strict_gates.includes(patch.new_gate)) dec.strict_gates.push(patch.new_gate);
      if (patch.new_invariant && !c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const gates = mutated.ir?.components?.find(x => x.name === 'decoder')?.strict_gates || [];
      const invs = mutated.invariants?.rules || [];
      const pass = gates.includes('GATE_A') && gates.includes('GATE_B') && gates.includes('GATE_D') && invs.includes('GATE_D_BOUNDED_MEMORY');
      return { pass, error: pass ? null : 'Failed Gate D addition or broke Gate A/B' };
    }
  },
  {
    id: "TASK_04_CAPABILITY",
    name: "Add Network Ingress Policy Capability",
    prompt: `TASK: Add capability 'cap:net_ingress_policy' to capabilities while preserving existing capabilities.
REQUIREMENTS:
1. Add 'cap:net_ingress_policy' to capabilities.
2. Add 'network_ingress_policed' to invariants.rules.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_capability",
  "new_capability": "cap:net_ingress_policy",
  "new_invariant": "network_ingress_policed"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_capability' || !patch.new_capability) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      if (!c.capabilities.includes(patch.new_capability)) c.capabilities.push(patch.new_capability);
      if (patch.new_invariant && !c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const caps = mutated.capabilities || [];
      const invs = mutated.invariants?.rules || [];
      const pass = caps.includes('cap:compression_native') && caps.includes('cap:net_ingress_policy') && invs.includes('network_ingress_policed');
      return { pass, error: pass ? null : 'Failed capability extension or lost base capabilities' };
    }
  },
  {
    id: "TASK_05_CHUNKING",
    name: "Add Configurable Chunk Window Size",
    prompt: `TASK: Add 'chunk_size_max: 2048' property to protocol component.
REQUIREMENTS:
1. In protocol component, set chunk_size_max to 2048.
2. Preserve chunk_size_default (500) and 0-based indexing.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "configure_chunking",
  "chunk_size_max": 2048
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'configure_chunking' || typeof patch.chunk_size_max !== 'number') return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const p = c.ir.components.find(x => x.name === 'protocol');
      if (p) p.chunk_size_max = patch.chunk_size_max;
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const p = mutated.ir?.components?.find(x => x.name === 'protocol');
      const pass = p?.chunk_size_max === 2048 && p?.chunk_size_default === 500 && p?.indexing === "0-based";
      return { pass, error: pass ? null : 'Failed chunk_size_max configuration or corrupted indexing contract' };
    }
  },
  {
    id: "TASK_06_VERSIONING",
    name: "Bump Protocol Specification to v1.2.0",
    prompt: `TASK: Evolve protocol core version to '1.2.0' and record backward compatibility with '1.1.0'.
REQUIREMENTS:
1. Update version to '1.2.0'.
2. Add 'compatible_with: ["1.1.0", "1.0.0"]' to protocol component.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "upgrade_version",
  "version": "1.2.0",
  "compatible_with": ["1.1.0", "1.0.0"]
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'upgrade_version' || !patch.version) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      c.ir.version = patch.version;
      const p = c.ir.components.find(x => x.name === 'protocol');
      if (p && patch.compatible_with) p.compatible_with = patch.compatible_with;
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const v = mutated.ir?.version;
      const p = mutated.ir?.components?.find(x => x.name === 'protocol');
      const pass = v === '1.2.0' && Array.isArray(p?.compatible_with) && p.compatible_with.includes('1.1.0');
      return { pass, error: pass ? null : 'Failed version upgrade or missing backward compatibility record' };
    }
  },
  {
    id: "TASK_07_ERROR_HANDLING",
    name: "Add Strict Error Schema Manifest",
    prompt: `TASK: Add error_policy: 'fail_closed_with_error_code' to decoder component.
REQUIREMENTS:
1. Add error_policy: 'fail_closed_with_error_code' in decoder component.
2. Preserve policy_checks (allowed_effects, authorized_capabilities).
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "set_error_policy",
  "error_policy": "fail_closed_with_error_code"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'set_error_policy' || !patch.error_policy) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      const dec = c.ir.components.find(x => x.name === 'decoder');
      if (dec) dec.error_policy = patch.error_policy;
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const dec = mutated.ir?.components?.find(x => x.name === 'decoder');
      const pass = dec?.error_policy === 'fail_closed_with_error_code' && Array.isArray(dec?.policy_checks) && dec.policy_checks.includes('allowed_effects');
      return { pass, error: pass ? null : 'Failed error policy configuration or lost policy check guards' };
    }
  },
  {
    id: "TASK_08_CANONICALIZATION",
    name: "Enforce Recursive Key Ordering Invariant",
    prompt: `TASK: Add invariant 'CANONICAL_JSON_STRICT_KEY_ORDER' to invariants.rules.
REQUIREMENTS:
1. Add 'CANONICAL_JSON_STRICT_KEY_ORDER' to invariants.rules.
2. Preserve all baseline invariants.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_canonical_invariant",
  "new_invariant": "CANONICAL_JSON_STRICT_KEY_ORDER"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_canonical_invariant' || !patch.new_invariant) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      if (!c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const invs = mutated.invariants?.rules || [];
      const pass = invs.includes('CANONICAL_JSON_STRICT_KEY_ORDER') && invs.includes('CAPSULE_SEMANTIC_HASH_VALID');
      return { pass, error: pass ? null : 'Failed canonical ordering invariant addition' };
    }
  },
  {
    id: "TASK_09_TARGET_PROVENANCE",
    name: "Add Empirical WASM Target Provenance Evidence",
    prompt: `TASK: Register target 'wasm' in provenance.known_good_targets with status 'EQUIVALENT' and evidence_id 'ev_wasm_01'.
REQUIREMENTS:
1. In provenance.known_good_targets, add wasm: { status: 'EQUIVALENT', evidence_id: 'ev_wasm_01' }.
2. Preserve existing rust and zig provenance records.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_target_provenance",
  "target": "wasm",
  "evidence": { "status": "EQUIVALENT", "evidence_id": "ev_wasm_01" }
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_target_provenance' || !patch.target || !patch.evidence) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      if (!c.provenance) c.provenance = { known_good_targets: {} };
      c.provenance.known_good_targets[patch.target] = patch.evidence;
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const kgt = mutated.provenance?.known_good_targets || {};
      const pass = kgt.wasm?.status === 'EQUIVALENT' && kgt.wasm?.evidence_id === 'ev_wasm_01' && kgt.rust?.status === 'EQUIVALENT' && kgt.zig?.status === 'EQUIVALENT';
      return { pass, error: pass ? null : 'Failed WASM provenance registration or lost Rust/Zig evidence' };
    }
  },
  {
    id: "TASK_10_EFFECT_ISOLATION",
    name: "Add Effect Boundary Whitelist Token",
    prompt: `TASK: Add 'io:crypto_random' to effects without breaking pure boundary contracts.
REQUIREMENTS:
1. Add 'io:crypto_random' to effects list.
2. Preserve existing 'io:pure' and 'io:buffer_alloc'.
3. Add invariant 'crypto_random_isolated' to invariants.rules.
OUTPUT: Output ONLY JSON patch:
\`\`\`json
{
  "action": "add_effect",
  "new_effect": "io:crypto_random",
  "new_invariant": "crypto_random_isolated"
}
\`\`\``,
    applyPatch: (base, patch) => {
      if (patch.action !== 'add_effect' || !patch.new_effect) return { ok: false, error: 'Malformed patch' };
      const c = JSON.parse(JSON.stringify(base));
      if (!c.effects.includes(patch.new_effect)) c.effects.push(patch.new_effect);
      if (patch.new_invariant && !c.invariants.rules.includes(patch.new_invariant)) c.invariants.rules.push(patch.new_invariant);
      c.semantic_hash = sha256(canonicalJson(c.ir));
      return { ok: true, linobj: c };
    },
    oracle: (mutated) => {
      const effs = mutated.effects || [];
      const invs = mutated.invariants?.rules || [];
      const pass = effs.includes('io:pure') && effs.includes('io:buffer_alloc') && effs.includes('io:crypto_random') && invs.includes('crypto_random_isolated');
      return { pass, error: pass ? null : 'Failed crypto effect addition or broke pure/buffer effect baseline' };
    }
  }
];
