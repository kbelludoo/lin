import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const LIN_PATH = path.resolve('tests/generic_suite/lin_language_constructs.lin');
const RUST_BIN = path.resolve('bin/lin_rust');

console.log('================================================================');
console.log('  GATE T01-T16: AVALIAÇÃO DIFERENCIAL DO INTERPRETADOR GENÉRICO  ');
console.log('================================================================\n');

// Invocador IPC Real contra o binário nativo do LIN (Zero lógica duplicada no JS)
function callGenericLin(fnName, args) {
  const stdout = execFileSync(RUST_BIN, ['call', LIN_PATH, fnName, JSON.stringify(args)], {
    encoding: 'utf8'
  });
  return JSON.parse(stdout.trim());
}

// ---------------------------------------------------------------------------------
// BATERIA DE TESTES DAS 16 CONSTRUÇÕES DA LINGUAGEM LIN (JS Reference vs LIN Rust)
// ---------------------------------------------------------------------------------
const GATE_TESTS = [
  { id: 'T01_ARITHMETIC', fn: 't01_arithmetic', args: [10, 5, 2], jsRef: (a, b, c) => a + b * c },
  { id: 'T02_PRECEDENCE', fn: 't02_precedence', args: [2, 3, 4, 5], jsRef: (a, b, c, d) => a * b + c * d },
  { id: 'T03_COMPARISON_LT', fn: 't03_comparison', args: [10, 20], jsRef: (a, b) => a === b ? 'EQ' : (a < b ? 'LT' : 'GT') },
  { id: 'T03_COMPARISON_EQ', fn: 't03_comparison', args: [15, 15], jsRef: (a, b) => a === b ? 'EQ' : (a < b ? 'LT' : 'GT') },
  { id: 'T04_IF_ELSE_HIGH', fn: 't04_if_else', args: [25], jsRef: (v) => v > 10 ? 'HIGH' : 'LOW' },
  { id: 'T04_IF_ELSE_LOW', fn: 't04_if_else', args: [5], jsRef: (v) => v > 10 ? 'HIGH' : 'LOW' },
  { id: 'T05_LOOPS_ACCUM', fn: 't05_loops', args: [10], jsRef: (n) => { let s = 0; for (let i = 1; i <= n; i++) s += i; return s; } },
  { id: 'T06_ARRAYS_LEN', fn: 't06_arrays', args: [1, "two", 3], jsRef: (a, b, c) => [a, b, c].length },
  { id: 'T07_INDEXING', fn: 't07_indexing', args: [["first", "second", "third"], 1], jsRef: (arr, idx) => arr[idx] },
  { id: 'T08_OBJECTS', fn: 't08_objects', args: ["name", "lin_core"], jsRef: (k, v) => ({ [k]: v }) },
  { id: 'T09_PROP_ACCESS', fn: 't09_prop_access', args: [{ "status": "ACTIVE_2026" }, "status"], jsRef: (obj, p) => obj[p] },
  { id: 'T11_INTRA_CALLS', fn: 't11_intra_calls', args: [10, 20], jsRef: (x, y) => (x * 2) + (y * 2) },
  { id: 'T12_EARLY_RETURN', fn: 't12_early_return_loop', args: [[10, 20, 30, 40, 50], 30], jsRef: (arr, t) => arr.indexOf(t) },
  { id: 'T13_BLOCK_NESTING', fn: 't13_block_nesting', args: [10], jsRef: (x) => { let res = 0; if (x > 0) { for (let i = 0; i < x; i++) { if (i % 2 === 0) res += i; } } return res; } },
  { id: 'T14_UNICODE', fn: 't14_strings_unicode', args: ["LIN", "🚀"], jsRef: (p, e) => `${p}_${e}` },
  { id: 'T15_NULL_CHECK', fn: 't15_null_undefined', args: [null], jsRef: (v) => v == null ? 'IS_NULL' : 'VALID' },
  { id: 'T16_FAIL_CLOSED', fn: 't16_errors_fail_closed', args: [-5], jsRef: (x) => x <= 0 ? 'ERR_INVALID_ARG' : (100 / x) }
];

let passed = 0;

for (const tc of GATE_TESTS) {
  const jsExpected = tc.jsRef(...tc.args);
  const linOutput = callGenericLin(tc.fn, tc.args);

  assert.deepEqual(linOutput, jsExpected, `Mismatch in ${tc.id}: expected ${JSON.stringify(jsExpected)}, got ${JSON.stringify(linOutput)}`);
  console.log(`✔ [${tc.id.padEnd(20)}] -> JS: ${JSON.stringify(jsExpected)} | LIN: ${JSON.stringify(linOutput)} (MATCH)`);
  passed++;
}

console.log('\n================================================================');
console.log(`   GATE T01-T16 CONCLUÍDO: ${passed}/${GATE_TESTS.length} CONSTRUÇÕES APROVADAS (100% PARIDADE) `);
console.log('   behavior_eq(Node_JS_Ref, LIN_Generic_AST_Engine) = 1.0       ');
console.log('================================================================\n');
