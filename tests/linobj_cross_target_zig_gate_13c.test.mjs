import assert from 'node:assert/strict';
import { runGate13cAdversarialExecution } from '../scripts/bench_linobj_cross_target_zig_adversarial_13c.mjs';

console.log('=== Running Gate 13C: Adversarial Native Execution & Boundary Stress Gate ===\n');

const res = await runGate13cAdversarialExecution();

assert.equal(res.failedTrials, 0, 'Zero adversarial divergences permitted under boundary stress');
assert.equal(res.passedTrials, res.totalTrials, 'All adversarial boundary trials must pass observable parity');
assert.equal(res.passRate, 1.0, 'Adversarial soundness rate must be 100.00%');

console.log('\n============================================================');
console.log('Gate 13C (Adversarial Native Boundary Stress) PASSED.');
console.log('============================================================\n');
