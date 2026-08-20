import assert from 'node:assert/strict';
import { runGate13bNativeExecution } from '../scripts/bench_linobj_cross_target_zig_native.mjs';

console.log('=== Running Gate 13B: Native Cross-Target Execution & Promotion Gate ===\n');

const res = await runGate13bNativeExecution();

assert.equal(res.failedTrials, 0, 'Zero observable divergences permitted (Obs_JS == Obs_Zig)');
assert.equal(res.passedTrials, res.totalTrials, 'All trials in domain D_int & UTF-8 must pass observable parity');
assert.equal(res.passRate, 1.0, 'Observable parity rate must be 100.00%');
assert.equal(res.nucleusUntouched, true, 'Nucleus files must remain completely untouched under E2 promotion');

console.log('\n============================================================');
console.log('Gate 13B (Native Cross-Target Execution & Promotion) PASSED.');
console.log('============================================================\n');
