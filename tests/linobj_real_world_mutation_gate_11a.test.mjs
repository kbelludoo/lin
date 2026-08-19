import assert from 'node:assert/strict';
import { runRealWorldRawMutationBenchmark } from '../scripts/bench_linobj_real_world_mutation_raw.mjs';

console.log('=== Running Gate 11A: Historical Raw Real-World Mutation Gate ===\n');

const res = await runRealWorldRawMutationBenchmark();

assert.equal(res.totalFN, 0, 'Zero Under-invalidation required across raw baseline corpus (FN == 0)');
assert.equal(res.grandRecall, 1.0, 'Soundness / Recall against deep adversarial oracle must be 100.00%');
assert.equal(res.totalTP, res.grandSemantic, 'All ground-truth semantic mutations must be correctly rebuilt');

console.log('\n============================================================');
console.log('Gate 11A (Historical Raw Real-World Baseline) PASSED (100% Soundness).');
console.log('============================================================\n');
