import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { oracleFromFn } from '../scripts/clone_lia_oracle.mjs';
import {
  canPublishFullRepo, fileCoverage, isTypeOnlyModule, missedExtracts, normalizeSkipToFail, multiAllFull,
  honestNucleusMulti, formatStubIntel, defaultEmitTarget, futurePickBestLang, refuseStubBenchmark,
  rankQualityRows, allRowsFull, pickBestFromRows, benchRepeatCount,
} from '../scripts/clone_lin_full_repo_gate.mjs';
import { writeIntel } from '../scripts/clone_lin_improve.mjs';

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

const nucleusOk = {
  js: { PASS: 2, SKIP: 0, FAIL: 0 },
  ts: { PASS: 2, SKIP: 0, FAIL: 0 },
  py: { PASS: 2, SKIP: 0, FAIL: 0 },
  go: { PASS: 2, SKIP: 0, FAIL: 0 },
  rust: { PASS: 2, SKIP: 0, FAIL: 0 },
  c: { PASS: 0, SKIP: 2, FAIL: 0 },
  java: { PASS: 2, SKIP: 0, FAIL: 0 },
};
assert.equal(multiAllFull(nucleusOk), true);
assert.equal(multiAllFull({ ...nucleusOk, java: { PASS: 0, SKIP: 2, FAIL: 0 } }), false);
assert.equal(multiAllFull({ ...nucleusOk, c: { PASS: 0, SKIP: 0, FAIL: 2 } }), false);
assert.equal(multiAllFull({ ...nucleusOk, js: { PASS: 2, SKIP: 0, FAIL: 1 } }), false);
assert.equal(multiAllFull({
  ...nucleusOk,
  cs: { PASS: 2, SKIP: 0, FAIL: 0 },
  asm: { PASS: 2, SKIP: 0, FAIL: 0 },
}), true, 'stub langs must not enter the gate');

assert.equal(defaultEmitTarget(), 'ts');
assert.equal(futurePickBestLang().status, 'NOT_RUN');
assert.equal(refuseStubBenchmark('asm'), true);
assert.equal(refuseStubBenchmark('ts'), false);
assert.ok(Number(benchRepeatCount()) >= 5);

const rankIn = [
  { lang: 'ts', compileOk: true, runOk: true, ms: 10, bytes: 100 },
  { lang: 'c', compileOk: true, runOk: true, ms: 2, bytes: 200 },
  { lang: 'js', compileOk: true, runOk: true, ms: 2, bytes: 50 },
];
assert.equal(allRowsFull(rankIn), true);
const ranked = rankQualityRows(rankIn);
assert.equal(ranked[0].lang, 'js');
assert.equal(ranked[1].lang, 'c');
assert.equal(ranked[2].lang, 'ts');
assert.equal(ranked[0].rank, 1);
const picked = pickBestFromRows(rankIn);
assert.equal(picked.status, 'MEASURED');
assert.equal(picked.lang, 'js');
assert.equal(futurePickBestLang({ rows: rankIn }).lang, 'js');
assert.equal(pickBestFromRows([{ lang: 'ts', compileOk: true, runOk: false, ms: 1, bytes: 1 }]).status, 'NOT_FULL');
assert.equal(futurePickBestLang([{ lang: 'go', compileOk: true, runOk: true, ms: 3, bytes: 10 }]).status, 'MEASURED');

assert.doesNotMatch(honestNucleusMulti({ js: { PASS: 1, SKIP: 0, FAIL: 0 }, asm: { PASS: 15, SKIP: 0, FAIL: 0 } }), /asm:P/);
assert.match(formatStubIntel(), /EXPERIMENTAL_NOT_PASS/);
assert.doesNotMatch(formatStubIntel(), /:P\d+/);

const intelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lin_intel_'));
const intelPath = writeIntel(intelDir, {
  slug: 'honesty',
  status: 'PASS',
  suite_rate: 1,
  pass: 1,
  fail: 0,
  skip: 0,
  coverage: { files_ok: 1, files_total: 1 },
  source: 'https://example.com/x.git',
  multi: {
    js: { PASS: 1, SKIP: 0, FAIL: 0 },
    ts: { PASS: 1, SKIP: 0, FAIL: 0 },
    py: { PASS: 1, SKIP: 0, FAIL: 0 },
    go: { PASS: 1, SKIP: 0, FAIL: 0 },
    rust: { PASS: 1, SKIP: 0, FAIL: 0 },
    c: { PASS: 0, SKIP: 1, FAIL: 0 },
    java: { PASS: 1, SKIP: 0, FAIL: 0 },
    asm: { PASS: 15, SKIP: 0, FAIL: 0 },
    prolog: { PASS: 15, SKIP: 0, FAIL: 0 },
  },
  multi_line: 'js:P1/S0/F0 asm:P15/S0/F0 prolog:P15/S0/F0',
  stub_line: 'asm:P15/S0/F0',
  note_pt: 'DONE all-lang 1.0 asm:P15/S0/F0 prolog:P15/S0/F0',
  pass_names: ['index.js:fn'],
  improve_lin: 'loop_mode_no_improve',
});
const intelText = fs.readFileSync(intelPath, 'utf8');
assert.doesNotMatch(intelText, /\b(cs|lua|elixir|crystal|kotlin|hcl|julia|scala|haskell|prolog|zig|nim|asm):P\d+/);
assert.match(intelText, /multi="ts:P1\/S0\/F0 js:P1\/S0\/F0 py:P1\/S0\/F0 go:P1\/S0\/F0 rust:P1\/S0\/F0 c:P0\/S1\/F0 java:P1\/S0\/F0"/);
assert.match(intelText, /EXPERIMENTAL_NOT_PASS/);
assert.match(intelText, /stub_not_suite=true/);
fs.rmSync(intelDir, { recursive: true, force: true });

console.log('ok clone_full_repo_gate');
