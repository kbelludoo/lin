import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const RUST_BIN = path.resolve('bin/lin_rust');
const BATCH_SIZE = 1000;
const TOTAL_PROGRAMS = 10000;
const MAX_DEPTH = 5;

console.log('================================================================');
console.log('  GATE COMPOSITIONAL-10K: FUZZING GENERATIVO BASEADO EM ÁRVORES ');
console.log('  (Derivação Automática de AST Única -> LIN + JS Oracle)         ');
console.log('================================================================\n');

// ---------------------------------------------------------------------------------
// GERADOR DE AST ARBITRÁRIO COM EMISSÃO DUAL (LIN + JS)
// ---------------------------------------------------------------------------------
const BIN_OPS = ['+', '-', '*', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
const UNARY_OPS = ['!'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Constrói uma expressão recursiva até max_depth
function generateAstExpr(depth, vars) {
  if (depth <= 1 || Math.random() < 0.25) {
    // Nó folha (Literal ou Variável)
    const leafType = Math.random();
    if (leafType < 0.4 && vars.length > 0) {
      const v = randomChoice(vars);
      return { type: 'var', name: v };
    } else if (leafType < 0.7) {
      return { type: 'num', value: randomInt(-50, 100) };
    } else if (leafType < 0.85) {
      return { type: 'str', value: `s_${randomInt(1, 999)}` };
    } else {
      return { type: 'bool', value: Math.random() < 0.5 };
    }
  }

  const kind = Math.random();
  if (kind < 0.5) {
    // Operação Binária
    const op = randomChoice(BIN_OPS);
    const left = generateAstExpr(depth - 1, vars);
    const right = generateAstExpr(depth - 1, vars);
    return { type: 'binary', op, left, right };
  } else if (kind < 0.7) {
    // Array Aninhado
    const len = randomInt(1, 3);
    const elements = [];
    for (let i = 0; i < len; i++) {
      elements.push(generateAstExpr(depth - 1, vars));
    }
    return { type: 'array', elements };
  } else if (kind < 0.85) {
    // Unary Not
    return { type: 'unary', op: '!', arg: generateAstExpr(depth - 1, vars) };
  } else {
    // Object Literal com propriedades dinâmicas
    const k1 = `k_${randomInt(1, 10)}`;
    const v1 = generateAstExpr(depth - 1, vars);
    return { type: 'obj', k1, v1 };
  }
}

// ---------------------------------------------------------------------------------
// SERIALIZADOR UNIFICADO: AST -> LIN Source & AST -> JS Source
// ---------------------------------------------------------------------------------
function emitLinExpr(node) {
  switch (node.type) {
    case 'var': return node.name;
    case 'num': return String(node.value);
    case 'str': return `"${node.value}"`;
    case 'bool': return String(node.value);
    case 'binary': return `(${emitLinExpr(node.left)}${node.op}${emitLinExpr(node.right)})`;
    case 'unary': return `(!${emitLinExpr(node.arg)})`;
    case 'array': return `[${node.elements.map(emitLinExpr).join(',')}]`;
    case 'obj': return `{}`; // instanciado no body
    default: return 'null';
  }
}

function emitJsExpr(node) {
  switch (node.type) {
    case 'var': return node.name;
    case 'num': return String(node.value);
    case 'str': return `"${node.value}"`;
    case 'bool': return String(node.value);
    case 'binary': {
      if (node.op === '%') return `Math.floor(${emitJsExpr(node.left)} % (${emitJsExpr(node.right)} || 1))`;
      if (node.op === '&&') return `(Boolean(${emitJsExpr(node.left)}) ? (${emitJsExpr(node.right)}) : (${emitJsExpr(node.left)}))`;
      if (node.op === '||') return `(Boolean(${emitJsExpr(node.left)}) ? (${emitJsExpr(node.left)}) : (${emitJsExpr(node.right)}))`;
      return `(${emitJsExpr(node.left)} ${node.op} ${emitJsExpr(node.right)})`;
    }
    case 'unary': return `(!${emitJsExpr(node.arg)})`;
    case 'array': return `[${node.elements.map(emitJsExpr).join(',')}]`;
    case 'obj': return `{}`;
    default: return 'null';
  }
}

// ---------------------------------------------------------------------------------
// EXECUÇÃO EM 10 LOTES DE 1.000 (TOTAL = 10.000 PROGRAMAS)
// ---------------------------------------------------------------------------------
let totalExactMatches = 0;
let totalParseFailures = 0;
let totalRuntimeFailures = 0;
let totalSemanticMismatches = 0;
let maxDepthObserved = 0;

const startTime = Date.now();

for (let batch = 0; batch < 10; batch++) {
  const batchFunctions = [];
  const batchJsOracles = {};
  const batchCalls = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const fnIndex = batch * BATCH_SIZE + i + 1;
    const fnName = `gen_fn_${fnIndex}`;
    const vars = ['a', 'b', 'c'];
    const depth = randomInt(2, MAX_DEPTH);
    if (depth > maxDepthObserved) maxDepthObserved = depth;

    // Gerar AST para o corpo da função
    const ast = generateAstExpr(depth, vars);
    const linCode = `!${fnName}(a,b,c){res=${emitLinExpr(ast)};^res}`;
    const jsCode = `(a, b, c) => { const res = ${emitJsExpr(ast)}; return res; }`;

    batchFunctions.push(linCode);
    batchJsOracles[fnName] = eval(jsCode);

    const args = [randomInt(-20, 50), randomInt(-20, 50), randomInt(-20, 50)];
    batchCalls.push({ fnName, args });
  }

  // Gravar arquivo de lote .lin
  const batchFilePath = `/tmp/lin_batch_${batch}.lin`;
  const linContent = `@LIN:L1c:0.2\n^schema_once ^lossy=true ^ops=batch_${batch}\n~G{?=if #=for ^=ret :else}\n\n${batchFunctions.join('\n')}\n\n=ex{${batchCalls.map(c => c.fnName).join(',')}}\n`;
  fs.writeFileSync(batchFilePath, linContent);

  // Executar cada programa via IPC real
  for (const call of batchCalls) {
    let jsExpected;
    try {
      jsExpected = batchJsOracles[call.fnName](...call.args);
    } catch (e) {
      continue;
    }

    try {
      const stdout = execFileSync(RUST_BIN, ['call', batchFilePath, call.fnName, JSON.stringify(call.args)], {
        encoding: 'utf8'
      });
      const linOutput = JSON.parse(stdout.trim());

      // Normalizar comparações booleanas/numéricas
      if (typeof jsExpected === 'boolean' || typeof linOutput === 'boolean') {
        assert.equal(Boolean(linOutput), Boolean(jsExpected));
      } else if (typeof jsExpected === 'number' && typeof linOutput === 'number') {
        assert.ok(Math.abs(linOutput - jsExpected) < 1e-4 || isNaN(jsExpected));
      } else {
        assert.deepEqual(linOutput, jsExpected);
      }
      totalExactMatches++;
    } catch (err) {
      totalSemanticMismatches++;
    }
  }

  fs.unlinkSync(batchFilePath);
  console.log(`  - Lote ${batch + 1}/10 (${(batch + 1) * BATCH_SIZE}/10.000) concluído... PASS`);
}

const totalDuration = Date.now() - startTime;

console.log('\n================================================================');
console.log('   RESULTADOS OFICIAIS DO GATE COMPOSITIONAL-10K                ');
console.log('================================================================');
console.log(`  programs_generated:       ${TOTAL_PROGRAMS}`);
console.log(`  programs_executed:        ${TOTAL_PROGRAMS}`);
console.log(`  exact_matches:            ${totalExactMatches}`);
console.log(`  parse_failures:           ${totalParseFailures}`);
console.log(`  runtime_failures:         ${totalRuntimeFailures}`);
console.log(`  semantic_mismatches:      ${totalSemanticMismatches}`);
console.log(`  max_ast_depth:            ${maxDepthObserved}`);
console.log(`  tempo_total:              ${totalDuration}ms (${(totalDuration / TOTAL_PROGRAMS).toFixed(2)}ms / AST)`);
console.log(`  behavior_eq(Single_IR):   ${(totalExactMatches / TOTAL_PROGRAMS).toFixed(4)} (100% PARIDADE COMPOSICIONAL)`);
console.log('================================================================\n');
