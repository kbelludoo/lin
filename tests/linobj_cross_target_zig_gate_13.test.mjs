import assert from 'node:assert/strict';
import { runCrossTargetGate13 } from '../scripts/bench_linobj_cross_target_zig.mjs';

console.log('=== Running Gate 13: Zig-as-Default & Cross-Target Invariance Gate ===\n');

const res = await runCrossTargetGate13();

assert.equal(res.identityChecksPassed, res.corpusCount, 'All corpus modules must maintain identical H_semantic across E0, E1, E2');
assert.equal(res.crossTargetChecksPassed, res.corpusCount, 'All corpus modules must emit valid cross-target JS and Zig code');
assert.equal(res.fn, 0, 'Zero Under-invalidation required (FN == 0)');
assert.equal(res.fp, 0, 'Zero Over-invalidation required (FP == 0)');
assert.equal(res.recall, 1.0, 'Soundness / Recall must be 100.00%');
assert.equal(res.accuracy, 1.0, 'Accuracy must be 100.00%');
assert.equal(res.nucleusUntouched, true, 'Immutable LIN nucleus must remain completely untouched');

console.log('\n============================================================');
console.log('Gate 13 (Zig-as-Default & Cross-Target Invariance) PASSED.');
console.log('============================================================\n');
