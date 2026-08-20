/**
 * LIN Regression: Dollar Sign in String Literals
 *
 * Bug: The LIN compiler's rewrite passes treated '$' inside string literals
 * as a constant reference token ($K), causing LIN_EMIT_JS_SYNTAX errors.
 *
 * Discovered by: LIN Language Fuzzer (Layer 1, quoted_literal corpus)
 * Status: FIXED
 * Date: 2026-08-19
 *
 * Test: '$' inside single/double quotes must be treated as a string character,
 * never as a LIN constant reference token.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseLia, compileLiaToJs } from '../../../src/compiler.mjs';

const requireSelf = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message.slice(0, 100)}`); }
}

console.log('═══ Regression: Dollar Sign in Strings ═══\n');

const DOLLAR_TESTS = [
  { lin: '!f(){s="$";^(s)}', desc: '$ in double quotes' },
  { lin: "!f(){s='$';^(s)}", desc: '$ in single quotes' },
  { lin: '!f(){s="$K";^(s)}', desc: '$K in double quotes' },
  { lin: "!f(){s='$K';^(s)}", desc: '$K in single quotes' },
  { lin: '!f(){s="abc$def";^(s)}', desc: 'dollar mid-string' },
  { lin: '!f(){s="$K + $";^(s)}', desc: '$K + $ in string' },
  { lin: "!f(){s='$K{b=1}';^(s)}", desc: 'constant decl syntax in string' },
  { lin: '!f(){s="@LIN:L1c:0.2";^(s)}', desc: '@ header in string' },
  { lin: "!f(){s='!f(){}';^(s)}", desc: 'function syntax in string' },
  { lin: "!f(){s='^(return)';^(s)}", desc: 'return sigil in string' },
  { lin: "!f(){s='?=if #=for';^(s)}", desc: 'sigil config in string' },
  { lin: '!f(){s="#(i=0;i<10;i++)";^(s)}', desc: 'for loop in string' },
];

const HEADER = '@LIN:L1c:0.2\n^schema_once\n';

for (const t of DOLLAR_TESTS) {
  test(`parse: ${t.desc}`, () => {
    const prog = parseLia(HEADER + t.lin + '\n=ex{f}');
    assert.ok(prog.fns.length > 0, 'should parse');
  });
}

for (const t of DOLLAR_TESTS) {
  test(`emit: ${t.desc}`, () => {
    const { js } = compileLiaToJs(HEADER + t.lin + '\n=ex{f}', { exportMode: 'multiple' });
    assert.ok(js.length > 50, 'should produce code');
    // The $ should be inside a string literal in the emitted JS, not a var $K={...} declaration
    const hasVarDecl = js.includes('var $K={');
    assert.equal(hasVarDecl, false, 'should not emit $K variable declaration for string contents');
  });
}

// Also verify that real $K constant references still work
test('real $K constant still works', () => {
  const lin = HEADER + '$K{b=1 kb=1024}\n!f(){^(b)}\n=ex{f}';
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  assert.ok(js.includes('var $K'), 'should emit $K variable');
});

// Verify execution correctness
test('execution: $ in string produces correct value', () => {
  const lin = HEADER + '!f(){s="$";^(s)}\n=ex{f}';
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = `/tmp/lin_reg_dollar_${Date.now()}.cjs`;
  fs.writeFileSync(tmp, js, 'utf8');
  const fn = requireSelf(tmp);
  assert.equal(fn(), '$');
  fs.rmSync(tmp, { force: true });
});

test('execution: $K in string produces correct value', () => {
  const lin = HEADER + '!f(){s="$K";^(s)}\n=ex{f}';
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = `/tmp/lin_reg_dollarK_${Date.now()}.cjs`;
  fs.writeFileSync(tmp, js, 'utf8');
  const fn = requireSelf(tmp);
  assert.equal(fn(), '$K');
  fs.rmSync(tmp, { force: true });
});

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
process.exit(failed > 0 ? 1 : 0);
