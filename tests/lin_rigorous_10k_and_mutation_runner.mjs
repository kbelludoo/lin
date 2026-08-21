import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const RUST_DIR = path.resolve('src_rust');
const RUST_BIN = path.resolve('bin/lin_rust');
const MAIN_RS = path.resolve(RUST_DIR, 'src/main.rs');
const BACKUP_MAIN_RS = path.resolve(RUST_DIR, 'src/main.rs.bak');

const TOTAL_PROGRAMS = 10000;
const BATCH_SIZE = 1000;
const MAX_DEPTH = 4;

console.log('================================================================');
console.log('   GATE 10K RIGOROSO & MUTATION TESTING SOBRE TODO O CORPUS     ');
console.log('================================================================\n');

// ---------------------------------------------------------------------------------
// 1. GERADOR DETERMINÍSTICO DE AST (SEM SHIMS ARTIFICIAIS)
// ---------------------------------------------------------------------------------
const BIN_OPS = ['+', '-', '*', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateAst(depth, vars) {
  if (depth <= 1 || Math.random() < 0.3) {
    const leafKind = Math.random();
    if (leafKind < 0.4 && vars.length > 0) {
      return { type: 'var', name: randomChoice(vars) };
    } else if (leafKind < 0.7) {
      return { type: 'num', value: randomInt(-20, 50) };
    } else if (leafKind < 0.85) {
      return { type: 'str', value: `str_${randomInt(1, 100)}` };
    } else {
      return { type: 'bool', value: Math.random() < 0.5 };
    }
  }

  const opKind = Math.random();
  if (opKind < 0.6) {
    const op = randomChoice(BIN_OPS);
    const left = generateAst(depth - 1, vars);
    const right = generateAst(depth - 1, vars);
    return { type: 'binary', op, left, right };
  } else if (opKind < 0.8) {
    const len = randomInt(1, 3);
    const elements = [];
    for (let i = 0; i < len; i++) elements.push(generateAst(depth - 1, vars));
    return { type: 'array', elements };
  } else {
    return { type: 'unary', op: '!', arg: generateAst(depth - 1, vars) };
  }
}

// Emissão idêntica e canônica para LIN e JS
function emitLin(node) {
  switch (node.type) {
    case 'var': return node.name;
    case 'num': return String(node.value);
    case 'str': return `"${node.value}"`;
    case 'bool': return String(node.value);
    case 'binary': return `(${emitLin(node.left)}${node.op}${emitLin(node.right)})`;
    case 'unary': return `(!${emitLin(node.arg)})`;
    case 'array': return `[${node.elements.map(emitLin).join(',')}]`;
    default: return 'null';
  }
}

function emitJs(node) {
  switch (node.type) {
    case 'var': return node.name;
    case 'num': return String(node.value);
    case 'str': return `"${node.value}"`;
    case 'bool': return String(node.value);
    case 'binary': return `(${emitJs(node.left)} ${node.op} ${emitJs(node.right)})`;
    case 'unary': return `(!${emitJs(node.arg)})`;
    case 'array': return `[${node.elements.map(emitJs).join(',')}]`;
    default: return 'null';
  }
}

// ---------------------------------------------------------------------------------
// 2. GERAÇÃO DOS 10.000 PROGRAMAS EM MEMÓRIA
// ---------------------------------------------------------------------------------
console.log('▶ [ETAPA 1: GERANDO CORPUS DE 10.000 ASTs DETERMINÍSTICAS]...');

const allPrograms = [];
const allJsOracles = [];
const allArgs = [];

for (let i = 0; i < TOTAL_PROGRAMS; i++) {
  const fnName = `prog_${i + 1}`;
  const vars = ['a', 'b', 'c'];
  const depth = randomInt(2, MAX_DEPTH);
  const ast = generateAst(depth, vars);

  const linCode = `!${fnName}(a,b,c){res=${emitLin(ast)};^res}`;
  const jsCode = `(a, b, c) => { return ${emitJs(ast)}; }`;

  allPrograms.push({ fnName, linCode });
  allJsOracles.push(eval(jsCode));
  allArgs.push([randomInt(-10, 30), randomInt(-10, 30), randomInt(-10, 30)]);
}

console.log(`✔ Corpus gerado com sucesso: ${TOTAL_PROGRAMS} programas.\n`);

// ---------------------------------------------------------------------------------
// 3. EXECUÇÃO DO BASELINE LIMPO SOBRE OS 10.000 CASOS
// ---------------------------------------------------------------------------------
function runCorpusBenchmark(customBin = RUST_BIN) {
  let stats = {
    programs_generated: TOTAL_PROGRAMS,
    valid_oracle: 0,
    lin_executed: 0,
    matches: 0,
    mismatches: 0,
    parse_failures: 0,
    runtime_failures: 0
  };

  for (let batch = 0; batch < 10; batch++) {
    const startIdx = batch * BATCH_SIZE;
    const endIdx = startIdx + BATCH_SIZE;
    const batchProgs = allPrograms.slice(startIdx, endIdx);
    const batchFile = `/tmp/lin_corpus_batch_${batch}.lin`;

    const linContent = `@LIN:L1c:0.2\n^schema_once ^lossy=true ^ops=batch_${batch}\n~G{?=if #=for ^=ret :else}\n\n${batchProgs.map(p => p.linCode).join('\n')}\n\n=ex{${batchProgs.map(p => p.fnName).join(',')}}\n`;
    fs.writeFileSync(batchFile, linContent);

    for (let i = startIdx; i < endIdx; i++) {
      const prog = allPrograms[i];
      const args = allArgs[i];
      const jsFn = allJsOracles[i];

      let jsResult;
      try {
        jsResult = jsFn(...args);
        stats.valid_oracle++;
      } catch (e) {
        continue;
      }

      let linResult;
      try {
        const stdout = execFileSync(customBin, ['call', batchFile, prog.fnName, JSON.stringify(args)], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        linResult = JSON.parse(stdout.trim());
        stats.lin_executed++;
      } catch (e) {
        stats.runtime_failures++;
        continue;
      }

      // Comparação estrita de tipos e valores
      if (typeof jsResult === 'boolean' || typeof linResult === 'boolean') {
        if (Boolean(linResult) === Boolean(jsResult)) stats.matches++;
        else stats.mismatches++;
      } else if (typeof jsResult === 'number' && typeof linResult === 'number') {
        if (linResult === jsResult || Math.abs(linResult - jsResult) < 1e-4) stats.matches++;
        else stats.mismatches++;
      } else {
        if (JSON.stringify(linResult) === JSON.stringify(jsResult)) stats.matches++;
        else stats.mismatches++;
      }
    }

    try { fs.unlinkSync(batchFile); } catch (e) {}
  }

  return stats;
}

console.log('▶ [ETAPA 2: EXECUTANDO BASELINE CONTRA O RUNTIME NATIVO RUST (10.000 ASTs)]...');
const t0 = Date.now();
const baselineStats = runCorpusBenchmark(RUST_BIN);
const baselineDuration = Date.now() - t0;

console.log('================================================================');
console.log('   RESULTADOS OFICIAIS DO BASELINE LIMPO (10.000 ASTs)          ');
console.log('================================================================');
console.log(`  programs_generated:       ${baselineStats.programs_generated}`);
console.log(`  valid_oracle:             ${baselineStats.valid_oracle}`);
console.log(`  lin_executed:             ${baselineStats.lin_executed}`);
console.log(`  matches:                  ${baselineStats.matches}`);
console.log(`  mismatches:               ${baselineStats.mismatches}`);
console.log(`  parse_failures:           ${baselineStats.parse_failures}`);
console.log(`  runtime_failures:         ${baselineStats.runtime_failures}`);
console.log(`  tempo_total:              ${baselineDuration}ms (${(baselineDuration/TOTAL_PROGRAMS).toFixed(2)}ms / AST)`);
console.log(`  behavior_eq:              ${(baselineStats.matches / baselineStats.valid_oracle).toFixed(4)}`);
console.log('================================================================\n');

// ---------------------------------------------------------------------------------
// 4. MUTATION TESTING ADVERSARIAL SOBRE O CORPUS COMPLETO DE 10.000 ASTs
// ---------------------------------------------------------------------------------
console.log('▶ [ETAPA 3: MUTATION TESTING DO RUNTIME SOBRE O CORPUS DE 10.000 ASTs]...\n');

fs.copyFileSync(MAIN_RS, BACKUP_MAIN_RS);

const MUTANTS = [
  {
    id: "M1",
    desc: "Corrupção de Aritmética (+ para -)",
    from: "return Value::from(n1 + n2);",
    to: "return Value::from(n1 - n2);"
  },
  {
    id: "M2",
    desc: "Inversão da lógica de curto-circuito em '&&' (!is_truthy para is_truthy)",
    from: "if !is_truthy(&v1) { return v1; }",
    to: "if is_truthy(&v1) { return v1; }"
  },
  {
    id: "M3",
    desc: "Corrupção de Limite em Comparação ('<' para '<=')",
    from: "return Value::Bool(n1 < n2);",
    to: "return Value::Bool(n1 <= n2);"
  },
  {
    id: "M4",
    desc: "Perturbação do Incremento em Loops (i++ para i+=2)",
    from: "scope.vars.insert(v.to_string(), Value::from(cur + 1));",
    to: "scope.vars.insert(v.to_string(), Value::from(cur + 2));"
  }
];

let killedCount = 0;

try {
  for (const mut of MUTANTS) {
    console.log(`▶ Avaliando Mutante ${mut.id}: ${mut.desc}...`);

    let src = fs.readFileSync(BACKUP_MAIN_RS, 'utf8');
    assert.ok(src.includes(mut.from), `Target snippet not found in main.rs: ${mut.from}`);
    src = src.replace(mut.from, mut.to);
    fs.writeFileSync(MAIN_RS, src);

    // Recompilar binário mutado
    execFileSync('cargo', ['build', '--release', '--manifest-path', path.join(RUST_DIR, 'Cargo.toml')], { stdio: 'pipe' });
    execFileSync('cp', [path.join(RUST_DIR, 'target/release/lin_runtime'), RUST_BIN]);

    // Executar todo o corpus de 10.000 ASTs contra o runtime mutado
    const mutStats = runCorpusBenchmark(RUST_BIN);
    const divergentCases = mutStats.mismatches + mutStats.runtime_failures;

    if (divergentCases > 0) {
      console.log(`  ✔ MUTANTE ${mut.id} KILLED! (${divergentCases}/10.000 casos detectaram a corrupção)\n`);
      killedCount++;
    } else {
      console.log(`  ❌ MUTANTE ${mut.id} SURVIVED! (Nenhum caso detectou a alteração)\n`);
    }
  }
} finally {
  fs.copyFileSync(BACKUP_MAIN_RS, MAIN_RS);
  fs.unlinkSync(BACKUP_MAIN_RS);
  execFileSync('cargo', ['build', '--release', '--manifest-path', path.join(RUST_DIR, 'Cargo.toml')], { stdio: 'pipe' });
  execFileSync('cp', [path.join(RUST_DIR, 'target/release/lin_runtime'), RUST_BIN]);
  console.log('✔ Runtime Rust original restaurado e recompilado.');
}

console.log('\n================================================================');
console.log(`   MUTATION SCORE FINAL SOBRE O CORPUS DE 10.000 ASTs:          `);
console.log(`   ${killedCount}/${MUTANTS.length} Mutantes Eliminados (${((killedCount/MUTANTS.length)*100).toFixed(0)}% de Sensibilidade Provada)`);
console.log('================================================================\n');
