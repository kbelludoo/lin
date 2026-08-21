import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { sha256, canonicalJson, compressPayload } from '../src/lin_capsule_protocol.mjs';

function buildMockLinobj() {
  const ir = {
    kind: 'Module',
    name: 'math_kernel',
    functions: [
      { name: 'add', params: ['a', 'b'], body: { op: '+', left: 'a', right: 'b' } },
      { name: 'safe_div', params: ['x', 'y'], body: { op: '/', left: 'x', right: 'y' } }
    ]
  };

  const semantic_hash = sha256(canonicalJson(ir));

  return {
    ir,
    semantic_hash,
    workflow_hash: sha256('workflow:math_v1'),
    source_digest: sha256('!fn add(a, b) ^ a + b'),
    effects: ['io:pure'],
    capabilities: ['cap:basic_eval'],
    invariants: {
      verified: true,
      rules: ['non_null', 'div_by_zero_guarded']
    },
    lowering_hints: { prefer: ['zig', 'rust'] },
    known_good_targets: {
      zig: { status: 'EQUIVALENT', evidence_id: 'ev_001' }
    }
  };
}

const defaultPolicy = {
  allowed_effects: ['io:pure', 'io:stdout'],
  authorized_capabilities: ['cap:basic_eval', 'cap:env_read']
};

test('LIN Capsule - 1. Valid Roundtrip (ACCEPT)', () => {
  const linobj = buildMockLinobj();
  const parts = encodeCapsule(linobj, { chunkSize: 80, compression: 'brotli' });

  assert.ok(parts.length > 1, 'Should have multiple parts');
  assert.equal(parts[0].display_badge, `[1/${parts.length}]`);

  const result = decodeCapsule(parts, defaultPolicy);
  assert.equal(result.ok, true);
  assert.equal(result.gate, 'GATE_B_PASSED');
  assert.equal(result.linobj.semantic_hash, linobj.semantic_hash);
  assert.deepEqual(result.linobj.ir, linobj.ir);
});

test('LIN Capsule - 2. Falsification: chunk_altered (REJECT)', () => {
  const linobj = buildMockLinobj();
  const parts = encodeCapsule(linobj, { chunkSize: 80 });

  // Tamper with chunk content
  const tamperedParts = JSON.parse(JSON.stringify(parts));
  tamperedParts[0].chunk = 'X' + tamperedParts[0].chunk.slice(1);

  const result = decodeCapsule(tamperedParts, defaultPolicy);
  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_PART_HASH_VALID/);
});

test('LIN Capsule - 3. Falsification: chunk_missing (REJECT)', () => {
  const linobj = buildMockLinobj();
  const parts = encodeCapsule(linobj, { chunkSize: 80 });

  // Drop last part
  const incompleteParts = parts.slice(0, parts.length - 1);

  const result = decodeCapsule(incompleteParts, defaultPolicy);
  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_PART_COUNT_VALID/);
});

test('LIN Capsule - 4. Falsification: chunk_swapped (REJECT)', () => {
  const linobj = buildMockLinobj();
  const parts = encodeCapsule(linobj, { chunkSize: 80 });

  // Swap indices
  const swappedParts = JSON.parse(JSON.stringify(parts));
  swappedParts[0].part_index = 1;
  swappedParts[1].part_index = 0;

  const result = decodeCapsule(swappedParts, defaultPolicy);
  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_PART_HASH_VALID|CAPSULE_PAYLOAD_HASH_VALID/);
});

test('LIN Capsule - 5. Falsification: payload_altered (REJECT)', () => {
  const linobj = buildMockLinobj();
  const parts = encodeCapsule(linobj, { chunkSize: 80 });

  // Forged part hash to bypass part check, but payload hash remains broken
  const tamperedParts = JSON.parse(JSON.stringify(parts));
  tamperedParts[0].chunk = 'AAAA' + tamperedParts[0].chunk.slice(4);
  tamperedParts[0].part_hash = sha256(tamperedParts[0].chunk);

  const result = decodeCapsule(tamperedParts, defaultPolicy);
  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_PAYLOAD_HASH_VALID/);
});

test('LIN Capsule - 6. Falsification: semantic_hash_forged (REJECT)', () => {
  const linobj = buildMockLinobj();
  const forgedHash = sha256('forged_identity');
  linobj.semantic_hash = forgedHash;

  const parts = encodeCapsule(linobj, { chunkSize: 80 });
  const result = decodeCapsule(parts, defaultPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_SEMANTIC_HASH_VALID/);
});

test('LIN Capsule - 7. Falsification: ir_altered (REJECT)', () => {
  const linobj = buildMockLinobj();
  const validParts = encodeCapsule(linobj, { chunkSize: 80 });

  // Construct artifact with modified IR but matching forged outer header
  const forgedArtifact = {
    protocol: 'LIN_CAPSULE/1.0',
    identity: {
      semantic_hash: validParts[0].semantic_hash, // keeps old hash
      workflow_hash: sha256('w'),
      source_digest: sha256('s')
    },
    contracts: { effects: ['io:pure'], capabilities: ['cap:basic_eval'], invariants: { verified: true } },
    ir: {
      canonical_ir: { kind: 'ModifiedModule' } // altered IR
    },
    provenance: {}
  };

  const canonicalJsonStr = canonicalJson(forgedArtifact);
  const { data: compressed } = compressPayload(canonicalJsonStr, 'brotli');
  const base64 = Buffer.from(compressed).toString('base64url');
  const payloadHash = sha256(base64);

  const forgedPart = {
    protocol: 'LIN_CAPSULE/1.0',
    part_index: 0,
    part_count: 1,
    part_hash: sha256(base64),
    payload_hash: payloadHash,
    semantic_hash: validParts[0].semantic_hash,
    compression: 'brotli',
    encoding: 'base64url',
    chunk: base64
  };

  const result = decodeCapsule([forgedPart], defaultPolicy);
  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_A');
  assert.match(result.error, /CAPSULE_SEMANTIC_HASH_VALID/);
});

test('LIN Capsule - 8. Falsification: effect_escalated (REJECT)', () => {
  const linobj = buildMockLinobj();
  linobj.effects = ['io:pure', 'net:raw_socket_escalate']; // Escalated effect

  const parts = encodeCapsule(linobj, { chunkSize: 80 });
  const result = decodeCapsule(parts, defaultPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_B');
  assert.match(result.error, /CAPSULE_EFFECTS_VALID/);
});

test('LIN Capsule - 9. Falsification: capability_unauthorized (REJECT)', () => {
  const linobj = buildMockLinobj();
  linobj.capabilities = ['cap:unauthorized_admin_access'];

  const parts = encodeCapsule(linobj, { chunkSize: 80 });
  const result = decodeCapsule(parts, defaultPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_B');
  assert.match(result.error, /CAPSULE_CAPABILITIES_VALID/);
});

test('LIN Capsule - 10. Falsification: invariant_false (REJECT)', () => {
  const linobj = buildMockLinobj();
  linobj.invariants = {
    verified: false, // Refinement invariant check failed
    rules: ['failed_rule']
  };

  const parts = encodeCapsule(linobj, { chunkSize: 80 });
  const result = decodeCapsule(parts, defaultPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.gate, 'GATE_B');
  assert.match(result.error, /CAPSULE_INVARIANTS_VALID/);
});
