import assert from 'node:assert/strict';
import { oracleFromFn } from '../scripts/clone_lia_oracle.mjs';
import {
  canPublishFullRepo, fileCoverage, isTypeOnlyModule, missedExtracts, normalizeSkipToFail,
} from '../scripts/clone_lin_full_repo_gate.mjs';

const remapped = normalizeSkipToFail([
  { status: 'pass', name: 'ok', srcRel: 'a.js' },
  { status: 'skip', name: 'hard', srcRel: 'a.js', reason: 'host_or_module_ref' },
]);
assert.equal(remapped.skip, 0);
assert.equal(remapped.pass, 1);
assert.equal(remapped.fail, 1);
assert.match(remapped.fail_names[0], /skip_eq_fail:host_or_module_ref/);

const cov = fileCoverage([
  { status: 'pass', name: 'ok', srcRel: 'a.js' },
  { status: 'fail', name: 'hard', srcRel: 'a.js' },
  { status: 'pass', name: 'b', srcRel: 'b.js' },
]);
assert.equal(cov.files_total, 2);
assert.equal(cov.files_ok, 1);
assert.equal(cov.full, false);

assert.equal(canPublishFullRepo({
  jsFull: true, allLangFull: true, filesFull: true, skip: 0, fail: 0, pass: 3,
}), true);
assert.equal(canPublishFullRepo({
  jsFull: true, allLangFull: true, filesFull: false, skip: 0, fail: 1, pass: 2,
}), false);
assert.equal(canPublishFullRepo({
  jsFull: true, allLangFull: false, filesFull: true, skip: 0, fail: 0, pass: 1,
}), false);

const missed = missedExtracts(
  'function keep(x){return x}\nfunction drop({a}){return a}\n',
  [{ name: 'keep' }],
);
assert.deepEqual(missed.map((m) => m.name), ['drop']);

const easy = oracleFromFn({ name: 'add', params: ['a', 'b'], body: 'return a+b', bindings: {}, siblings: [] });
assert.equal(easy.status, 'ok');
assert.equal(typeof easy.hash, 'string');
assert.equal(easy.hash.length, 64);

const host = oracleFromFn({
  name: 'load',
  params: [],
  body: 'yield 1',
  bindings: {},
  siblings: [],
});
assert.equal(host.status, 'fail');
assert.notEqual(host.status, 'skip');

const awaited = oracleFromFn({
  name: 'rainbow',
  params: ['string', 'offset'],
  body: 'return string;',
  bindings: {},
  siblings: [{ name: 'animateString', params: ['string'], body: 'await delay(2);' }],
});
assert.equal(awaited.status, 'ok');

assert.equal(isTypeOnlyModule('export type Foo = string;'), true);
assert.equal(isTypeOnlyModule('function add(a,b){return a+b}'), false);
assert.equal(isTypeOnlyModule('suite("x", () => { bench("y", () => {}); });'), true);

console.log('ok clone_full_repo_gate');
