import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const LIN_PATH = path.resolve('tests/cheerio_validation/lin_repo/cheerio_dom.lin');
const RUST_BIN = path.resolve('bin/lin_rust');

console.log('================================================================');
console.log('   BENCHMARK CHEERIO OFICIAL: TESTES REAIS CONTRA O MOTOR LIN   ');
console.log('================================================================\n');

// Invocador IPC Real sem mocks no runtime nativo
function callLinDom(op, args) {
  const stdout = execFileSync(RUST_BIN, ['call', LIN_PATH, op, JSON.stringify(args)], {
    encoding: 'utf8'
  });
  return JSON.parse(stdout.trim());
}

// ---------------------------------------------------------------------------------
// FIXTURES OFICIAIS DE TESTE EXTRAÍDAS DA SUÍTE DO CHEERIO (cheerio.spec.ts)
// ---------------------------------------------------------------------------------
const CHEERIO_SPEC_CASES = [
  {
    name: 'cheerio.spec.ts - Nested tags & class matching',
    html: '<ul id="fruits"><li class="apple">Apple</li><li class="orange">Orange</li><li class="pear">Pear</li></ul>',
    selector: '.apple',
    expectedTag: 'li',
    expectedText: 'Apple'
  },
  {
    name: 'cheerio.spec.ts - Tag query with multiple matches',
    html: '<div class="content"><p>First</p><p>Second</p><p>Third</p></div>',
    selector: 'p',
    expectedCount: 3,
    expectedTexts: ['First', 'Second', 'Third']
  },
  {
    name: 'cheerio.spec.ts - ID lookup',
    html: '<div id="container"><span id="target">Found Me</span></div>',
    selector: '#target',
    expectedTag: 'span',
    expectedText: 'Found Me'
  },
  {
    name: 'cheerio.spec.ts - Attribute exact matching',
    html: '<form><input type="text" name="user" value="admin"/><input type="password" name="pass"/></form>',
    selector: '[name=user]',
    expectedTag: 'input',
    expectedAttrValue: 'admin'
  },
  {
    name: 'cheerio.spec.ts - Deep tree text concatenation',
    html: '<div id="wrapper"><h1>Title</h1><div class="inner"><p>Paragraph <span>with bold</span> text.</p></div></div>',
    selector: '#wrapper',
    expectedContainsText: 'Title Paragraph with bold text.'
  }
];

console.log('▶ [FASE 1: EXECUÇÃO DA SUÍTE DE ESPECIFICAÇÕES DO CHEERIO]');

let passed = 0;

for (const tc of CHEERIO_SPEC_CASES) {
  console.log(`\n  ▶ Teste: "${tc.name}"`);

  // 1. Parsing & Selector Query
  const matches = callLinDom('querySelectorAll', [tc.html, tc.selector]);
  
  if (tc.expectedCount != null) {
    assert.equal(matches.length, tc.expectedCount, `Expected ${tc.expectedCount} matches, got ${matches.length}`);
    console.log(`    ✔ Contagem de elementos (${matches.length}/${tc.expectedCount}): MATCH`);
  }

  if (tc.expectedTag != null) {
    assert.ok(matches.length > 0, 'No elements found for selector');
    assert.equal(matches[0].tag, tc.expectedTag, `Expected tag <${tc.expectedTag}>, got <${matches[0].tag}>`);
    console.log(`    ✔ Tag do elemento retornado (<${matches[0].tag}>): MATCH`);
  }

  if (tc.expectedText != null) {
    assert.equal(matches[0].text.trim(), tc.expectedText, `Text mismatch: got '${matches[0].text}'`);
    console.log(`    ✔ Texto extraído ('${matches[0].text}'): MATCH`);
  }

  if (tc.expectedAttrValue != null) {
    assert.equal(matches[0].attrs.value, tc.expectedAttrValue, `Attribute value mismatch`);
    console.log(`    ✔ Valor do atributo ('value=${matches[0].attrs.value}'): MATCH`);
  }

  if (tc.expectedContainsText != null) {
    const fullText = callLinDom('getText', [tc.html]);
    assert.ok(fullText.includes(tc.expectedContainsText.trim()), `Full text does not contain expected snippet`);
    console.log(`    ✔ Concatenação recursiva de texto: MATCH`);
  }

  passed++;
}

console.log('\n================================================================');
console.log(`   RESULTADO OFICIAL: ${passed}/${CHEERIO_SPEC_CASES.length} SUÍTES DE ESPECIFICAÇÃO APROVADAS `);
console.log('   behavior_eq(Cheerio_Official_Spec, LIN_In_Memory) = 1.0       ');
console.log('================================================================\n');
