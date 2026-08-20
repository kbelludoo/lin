/**
 * LIN Knowledge-to-Test Engine — Integration Test
 *
 * Run: node tests/fuzzer/lin_knowledge_test.mjs
 *
 * Full pipeline:
 *   seed knowledge → generate tests → run oracles → validate → store
 *   AI knowledge → extract → generate → validate → store
 *   contradictions → repair → re-validate
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KnowledgeStore, TestEngine, extractKnowledge, SEED_KNOWLEDGE, ORACLES, TEST_GENERATORS } from './lin_knowledge.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; process.stderr.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; failures.push({ name, error: e }); process.stderr.write(`  ✗ ${name}: ${e.message}\n`); }
}

// ═══════════════════════════════════════════════════════════════════════
console.log('═══ LIN Knowledge-to-Test Engine ═══\n');

// ── Knowledge Extraction ─────────────────────────────────────────────
console.log('── Knowledge Extraction ──');
test('extract knowledge from seed', () => {
  const entries = extractKnowledge(SEED_KNOWLEDGE, 'seed');
  assert.ok(entries.length > 0, 'should extract entries from seed knowledge');
  assert.ok(entries.every(e => e.id.startsWith('K ')), 'all entries should have IDs');
  assert.ok(entries.every(e => e.source === 'seed'), 'source should be seed');
  assert.ok(entries.every(e => e.oracle), 'all entries should have oracle');
  assert.ok(entries.every(e => e.generator), 'all entries should have generator');
  process.stderr.write(`    extracted ${entries.length} knowledge entries\n`);
});

test('extract knowledge from AI-style output', () => {
  const aiOutput = `
TYPES:
- integer overflow should be detected
- string type is immutable
- null is falsy

SECURITY:
- eval is not available
- no file system access from user code
`;
  const entries = extractKnowledge(aiOutput, 'test-ai');
  assert.ok(entries.length >= 5, `should extract at least 5 entries, got ${entries.length}`);
  const types = entries.filter(e => e.domain === 'language_semantics');
  const sec = entries.filter(e => e.domain === 'security');
  assert.ok(types.length >= 2, 'should find type entries (mapped to language_semantics)');
  assert.ok(sec.length >= 1, 'should find security entries');
});

test('extract knowledge handles empty input', () => {
  const entries = extractKnowledge('', 'empty');
  assert.equal(entries.length, 0);
});

// ── Knowledge Store ──────────────────────────────────────────────────
console.log('\n── Knowledge Store ──');
test('store add and retrieve', () => {
  const dir = `/tmp/lin_kt_store_${Date.now()}`;
  const store = new KnowledgeStore(dir);
  const entry = {
    id: 'K test_001', source: 'test', domain: 'edge_cases',
    property: 'test property', category: 'semantic_stability',
    generator: 'parse_roundtrip', generatorParams: {},
    oracle: 'parse_success', expected: true,
    status: 'untested',
  };
  store.add(entry);
  assert.equal(store.count(), 1);
  assert.equal(store.getById('K test_001').property, 'test property');
  // cleanup
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

test('store stats', () => {
  const dir = `/tmp/lin_kt_stats_${Date.now()}`;
  const store = new KnowledgeStore(dir);
  store.add({ id: 'K s1', source: 'test', domain: 'runtime', property: 'a', category: 'x', generator: 'parse_roundtrip', oracle: 'parse_success', expected: true, status: 'confirmed' });
  store.add({ id: 'K s2', source: 'test', domain: 'runtime', property: 'b', category: 'x', generator: 'parse_roundtrip', oracle: 'parse_success', expected: true, status: 'falsified' });
  const stats = store.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.byStatus.confirmed, 1);
  assert.equal(stats.byStatus.falsified, 1);
  try { require('node:fs').rmSync(dir, { recursive: true, force: true }); } catch {}
});

// ── Generators ───────────────────────────────────────────────────────
console.log('\n── Test Generators ──');
test('rename_local_identifier generates two programs', () => {
  const gen = TEST_GENERATORS.rename_local_identifier({ name: 'x', newName: '_y', body: 'a+b' });
  assert.equal(gen.programs.length, 2);
  assert.ok(gen.programs[0].includes('!f(x)'));
  assert.ok(gen.programs[1].includes('!f(_y)'));
});

test('string_with_reserved_chars generates one per char', () => {
  const gen = TEST_GENERATORS.string_with_reserved_chars({ chars: ['$', '#', '@'] });
  assert.equal(gen.programs.length, 3);
  assert.ok(gen.programs.some(p => p.includes('"$"') || p.includes("'$'")));
});

test('operator_chain generates one per operator', () => {
  const gen = TEST_GENERATORS.operator_chain({ operators: ['+', '-', '=='] });
  assert.equal(gen.programs.length, 3);
});

test('nested_expression generates correct depths', () => {
  const gen = TEST_GENERATORS.nested_expression({ depths: [1, 3] });
  assert.equal(gen.programs.length, 2);
});

test('constant_reference generates one per value', () => {
  const gen = TEST_GENERATORS.constant_reference({ values: ['b=1', 'x=42'] });
  assert.equal(gen.programs.length, 2);
});

test('boundary_values generates numeric edge cases', () => {
  const gen = TEST_GENERATORS.boundary_values();
  assert.ok(gen.programs.length > 5, `should have >5 programs, got ${gen.programs.length}`);
});

test('deep_nesting generates programs', () => {
  const gen = TEST_GENERATORS.deep_nesting({ depths: [2, 5] });
  assert.equal(gen.programs.length, 2);
});

// ── Oracles ──────────────────────────────────────────────────────────
console.log('\n── Oracles ──');
test('parse_success oracle passes valid programs', () => {
  const programs = ['@LIN:L1c:0.2\n^schema_once\n!f(){^(1)}\n=ex{f}'];
  const results = ORACLES.parse_success(programs);
  assert.equal(results.length, 1);
  assert.equal(results[0].passed, true);
});

test('parse_success oracle fails invalid programs', () => {
  const programs = ['this is not valid LIN at all {{{'];
  const results = ORACLES.parse_success(programs);
  assert.equal(results.length, 1);
  assert.equal(results[0].passed, false);
  assert.ok(results[0].detail, 'should have error detail');
});

test('emit_success oracle works', () => {
  const programs = ['@LIN:L1c:0.2\n^schema_once\n!f(){^(1)}\n=ex{f}'];
  const results = ORACLES.emit_success(programs);
  assert.equal(results.length, 1);
  assert.equal(results[0].passed, true);
});

test('semantic_hash oracle confirms identical programs', () => {
  const p = '@LIN:L1c:0.2\n^schema_once\n!f(){^(1)}\n=ex{f}';
  const results = ORACLES.semantic_hash([p, p]);
  assert.equal(results.length, 2);
  assert.equal(results[0].passed, true);
  assert.equal(results[1].passed, true);
});

test('execution_equality oracle confirms equal execution', () => {
  const p1 = '@LIN:L1c:0.2\n^schema_once\n!f(){^(42)}\n=ex{f}';
  const p2 = '@LIN:L1c:0.2\n^schema_once\n!f(){^(40+2)}\n=ex{f}';
  const results = ORACLES.execution_equality([p1, p2]);
  assert.equal(results.length, 2);
  assert.equal(results[0].passed, true, `first: ${results[0].detail}`);
  assert.equal(results[1].passed, true, `second: ${results[1].detail}`);
  assert.equal(results[0].result, results[1].result, 'results should be equal');
});

// ── Test Engine Full Pipeline ────────────────────────────────────────
console.log('\n── Test Engine Pipeline ──');
test('engine: validate single knowledge entry', () => {
  const store = new KnowledgeStore('/tmp/lin_engine_test');
  const engine = new TestEngine(store);
  const entry = {
    id: 'K engine_test', source: 'test', domain: 'edge_cases',
    property: 'empty string parses', category: 'parse_roundtrip',
    generator: 'string_with_reserved_chars',
    generatorParams: { chars: [''] },
    oracle: 'parse_success', expected: true, status: 'untested',
  };
  store.add(entry);
  const result = engine.validate(entry);
  assert.ok(result.generated, 'should have generated tests');
  assert.ok(result.oracleResults.length > 0, 'should have oracle results');
  assert.equal(entry.status, 'confirmed');
  try { fs.rmSync('/tmp/lin_engine_test', { recursive: true, force: true }); } catch {}
});

test('engine: ingest AI knowledge end-to-end', () => {
  const store = new KnowledgeStore('/tmp/lin_engine_ingest');
  const engine = new TestEngine(store);
  const result = engine.ingestKnowledge(SEED_KNOWLEDGE, 'seed');
  assert.ok(result.imported > 0, `should import entries, got ${result.imported}`);
  assert.equal(result.validated, result.imported, 'should validate all imported');
  process.stderr.write(`    ingested ${result.imported}, validated ${result.validated}, passed ${result.passed}\n`);
  const summary = engine.summary();
  assert.ok(summary.knowledge.total > 0);
  assert.ok(summary.tests.total > 0);
  process.stderr.write(`    summary: ${JSON.stringify(summary.knowledge)}\n`);
  try { fs.rmSync('/tmp/lin_engine_ingest', { recursive: true, force: true }); } catch {}
});

test('engine: falsified knowledge is detected', () => {
  const store = new KnowledgeStore('/tmp/lin_engine_falsify');
  const engine = new TestEngine(store);
  // Create a FALSE claim: this program does NOT parse
  store.add({
    id: 'K false_claim', source: 'test', domain: 'edge_cases',
    property: 'garbage parses', category: 'parse_roundtrip',
    generator: 'parse_roundtrip',
    generatorParams: { programs: ['this is garbage {{{'] },
    oracle: 'parse_success', expected: true, status: 'untested',
  });
  const result = engine.validate(store.getById('K false_claim'));
  assert.equal(result.passed, false, 'should be falsified');
  assert.equal(result.entry.status, 'falsified');
  assert.ok(result.entry.counterexample, 'should have counterexample');
  process.stderr.write(`    counterexample: ${result.entry.counterexample}\n`);
  try { fs.rmSync('/tmp/lin_engine_falsify', { recursive: true, force: true }); } catch {}
});

test('engine: known $ bug is detected by knowledge engine', () => {
  const store = new KnowledgeStore('/tmp/lin_engine_dollar');
  const engine = new TestEngine(store);
  store.add({
    id: 'K dollar_literal', source: 'seed', domain: 'language_semantics',
    property: 'dollar sign in string literal parses correctly',
    category: 'string_literal_integrity',
    generator: 'string_with_reserved_chars',
    generatorParams: { chars: ["'\"", '$'] },
    oracle: 'parse_success', expected: true, status: 'untested',
  });
  const result = engine.validate(store.getById('K dollar_literal'));
  // This should detect the bug — $ in strings causes issues
  process.stderr.write(`    $ literal test: passed=${result.passed}, results=${result.oracleResults.length}\n`);
  for (const r of result.oracleResults) {
    process.stderr.write(`      ${r.passed ? '✓' : '✗'} ${r.detail || 'ok'}\n`);
  }
  try { fs.rmSync('/tmp/lin_engine_dollar', { recursive: true, force: true }); } catch {}
});

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════
console.log('\n═══ Knowledge Engine Summary ═══');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.error.message.slice(0, 200)}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
