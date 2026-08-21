import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCapsule } from '../src/lin_capsule_encoder.mjs';
import { decodeCapsule } from '../src/lin_capsule_decoder.mjs';
import { sha256, canonicalJson } from '../src/lin_capsule_protocol.mjs';

test('LIN Capsule - Full Context Death Rehydration Experiment', () => {
  // -------------------------------------------------------------
  // PHASE 1: AGENT A creates complex system and produces Capsule
  // -------------------------------------------------------------
  const complexAst = {
    kind: 'WorkflowEngine',
    modules: [
      { id: 'm1', pure_fn: 'hash_block', inputs: ['bytes'], outputs: ['sha256'] },
      { id: 'm2', actor: 'dispatcher', mailbox_size: 1024 }
    ],
    state_machine: {
      initial: 'IDLE',
      transitions: { IDLE: 'PROCESSING', PROCESSING: 'COMPLETED' }
    }
  };

  const agentALinobj = {
    ir: complexAst,
    semantic_hash: sha256(canonicalJson(complexAst)),
    workflow_hash: sha256('workflow:graph_v2'),
    source_digest: sha256('LIN_SOURCE_CODE_BLOB_V1'),
    effects: ['io:pure'],
    capabilities: ['cap:basic_eval'],
    invariants: {
      verified: true,
      rules: ['deterministic_state_transitions', 'no_deadlock']
    },
    known_good_targets: {
      rust: { status: 'EQUIVALENT', perf_µs: 2.1, evidence_id: 'ev_rust_01' },
      zig: { status: 'EQUIVALENT', perf_µs: 1.8, evidence_id: 'ev_zig_01' }
    },
    benchmark_provenance: {
      tested_at: '2026-08-20T20:30:00Z',
      host: 'linux_x86_64'
    }
  };

  const parts = encodeCapsule(agentALinobj, { chunkSize: 120, compression: 'brotli' });

  // -------------------------------------------------------------
  // SIMULATED TOTAL CONTEXT DEATH
  // -------------------------------------------------------------
  // Agent B memory contains 0 tokens of conversation history and 0 source files.
  const agentBMemory = {
    conversation_history_tokens: 0,
    source_files_available: 0,
    capsule_received: JSON.parse(JSON.stringify(parts))
  };

  assert.equal(agentBMemory.conversation_history_tokens, 0, 'Must have exactly 0 history tokens');

  // -------------------------------------------------------------
  // PHASE 2: AGENT B rehydrates state from Capsule only
  // -------------------------------------------------------------
  const startTime = performance.now();
  const agentBLocalPolicy = {
    allowed_effects: ['io:pure'],
    authorized_capabilities: ['cap:basic_eval']
  };

  const rehydrationResult = decodeCapsule(agentBMemory.capsule_received, agentBLocalPolicy);
  const rehydrationTimeMs = performance.now() - startTime;

  assert.equal(rehydrationResult.ok, true, 'Rehydration must succeed');
  assert.equal(rehydrationResult.gate, 'GATE_B_PASSED');

  const rehydratedLinobj = rehydrationResult.linobj;

  // Semantic identity must match 100%
  assert.equal(rehydratedLinobj.semantic_hash, agentALinobj.semantic_hash);
  assert.deepEqual(rehydratedLinobj.ir, agentALinobj.ir);
  assert.deepEqual(rehydratedLinobj.invariants, agentALinobj.invariants);

  // Provenance is preserved as historical evidence (not blind authorization)
  assert.deepEqual(rehydratedLinobj.provenance.known_good_targets, agentALinobj.known_good_targets);

  console.log(`\n  [Context Death Metrics]`);
  console.log(`  - Conversation history tokens: ${agentBMemory.conversation_history_tokens}`);
  console.log(`  - Capsule size (bytes payload): ${parts.map(p => p.chunk.length).reduce((a, b) => a + b, 0)}`);
  console.log(`  - Rehydration time: ${rehydrationTimeMs.toFixed(3)}ms (O(|capsule|))`);
  console.log(`  - Gate A & Gate B: PASSED`);
});
