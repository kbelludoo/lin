import assert from 'node:assert/strict';
import { runAdversarialScopeGate } from '../scripts/bench_linobj_adversarial_scope_gate.mjs';

console.log('=== Running Gate 12: Adversarial Scope Boundary Mutation Gate ===\n');

const res = await runAdversarialScopeGate();

assert.equal(res.fn, 0, 'Zero Under-invalidation required across adversarial scope boundary vectors (FN == 0)');
assert.equal(res.fp, 0, 'Zero Over-invalidation required across scope boundary vectors (FP == 0)');
assert.equal(res.recall, 1.0, 'Soundness / Recall must be 100.00%');
assert.equal(res.accuracy, 1.0, 'Overall accuracy across scope boundary gate must be 100.00%');
assert.equal(res.tp, res.semanticCount, 'All semantic mutations must trigger sound rebuilds');
assert.equal(res.tn, res.cosmeticCount, 'All valid alpha-equivalences must preserve cache');

console.log('\n============================================================');
console.log('Gate 12 (Adversarial Scope Boundary Mutation) PASSED (100%/100%).');
console.log('============================================================\n');
