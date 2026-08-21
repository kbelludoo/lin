import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const RUST_DIR = path.resolve('src_rust');
const MAIN_RS = path.resolve(RUST_DIR, 'src/main.rs');
const BACKUP_MAIN_RS = path.resolve(RUST_DIR, 'src/main.rs.bak');

console.log('================================================================');
console.log('   MUTATION TESTING ADVERSARIAL DO PRÓPRIO RUNTIME LIN (RUST)   ');
console.log('================================================================\n');

// 1. Criar backup do código original do runtime
fs.copyFileSync(MAIN_RS, BACKUP_MAIN_RS);

const MUTATIONS = [
  {
    name: "Mutação M1: Corrupção do Operador '+' para '-' no runtime",
    from: 'return Value::from(n1 + n2);',
    to: 'return Value::from(n1 - n2);'
  },
  {
    name: "Mutação M2: Inversão de Operador Lógico '&&' para '||'",
    from: 'if let Some(pos) = find_binary_op(s, "&&") {',
    to: 'if let Some(pos) = find_binary_op(s, "||") {'
  },
  {
    name: "Mutação M3: Corrupção da Comparação '<' para '<='",
    from: 'return Value::Bool(n1 < n2);',
    to: 'return Value::Bool(n1 <= n2);'
  },
  {
    name: "Mutação M4: Deslocamento de Step em Loop (i++ para i+=2)",
    from: 'scope.vars.insert(v.to_string(), Value::from(cur + 1));',
    to: 'scope.vars.insert(v.to_string(), Value::from(cur + 2));'
  }
];

let killedMutants = 0;

try {
  for (let i = 0; i < MUTATIONS.length; i++) {
    const mut = MUTATIONS[i];
    console.log(`▶ Injetando ${mut.name}...`);

    let source = fs.readFileSync(BACKUP_MAIN_RS, 'utf8');
    assert.ok(source.includes(mut.from), `Target snippet not found for mutation: ${mut.from}`);
    source = source.replace(mut.from, mut.to);
    fs.writeFileSync(MAIN_RS, source);

    // Recompilar binário com a mutação ativa
    execFileSync('cargo', ['build', '--release', '--manifest-path', path.join(RUST_DIR, 'Cargo.toml')]);
    execFileSync('cp', [path.join(RUST_DIR, 'target/release/lin_runtime'), path.resolve('bin/lin_rust')]);

    // Executar suíte de validação para verificar se o oráculo detecta a falha
    let detected = false;
    try {
      execFileSync('node', ['tests/lin_generic_interpreter_gate_runner.mjs'], { stdio: 'pipe' });
    } catch (e) {
      detected = true;
    }

    if (detected) {
      console.log(`  ✔ MUTANTE DETECTADO E ELIMINADO COM SUCESSO PELO ORÁCULO!\n`);
      killedMutants++;
    } else {
      console.error(`  ❌ FALHA: Mutante sobreviveu sem ser detectado!\n`);
    }
  }
} finally {
  // Restaurar runtime original limpo
  fs.copyFileSync(BACKUP_MAIN_RS, MAIN_RS);
  fs.unlinkSync(BACKUP_MAIN_RS);
  execFileSync('cargo', ['build', '--release', '--manifest-path', path.join(RUST_DIR, 'Cargo.toml')]);
  execFileSync('cp', [path.join(RUST_DIR, 'target/release/lin_runtime'), path.resolve('bin/lin_rust')]);
  console.log('✔ Runtime Rust original restaurado com integridade.');
}

console.log('================================================================');
console.log(`   MUTATION SCORE: ${killedMutants}/${MUTATIONS.length} (${((killedMutants / MUTATIONS.length) * 100).toFixed(0)}% DE SENSIBILIDADE PROVADA)`);
console.log('================================================================\n');
