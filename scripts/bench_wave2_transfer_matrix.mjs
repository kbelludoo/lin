/**
 * LIN WAVE 2: H_TRANSFER-01 Semantic Cross-Target Audit Matrix
 *
 * Targets:
 * - Wave 2 Target: Java (javac + java Native/JVM)
 * - Wave 1 Certified Targets (Audit): C (gcc), Rust (rustc), Go (go build)
 *
 * Protocol:
 * - 6 adversarial vectors (26 boundary trials)
 * - Real compiler invocations
 * - Strict observable parity against Node V8 / independent oracle
 * - Regression audit: C, Rust, Go MUST maintain 26/26 (100%)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileLiaToJs } from '../src/compiler.mjs';
import { compileLia } from '../src/multi_emit.mjs';
import { GATE_13C_ADVERSARIAL_CORPUS } from './bench_linobj_cross_target_zig_adversarial_13c.mjs';

const FAIL_DIR = path.resolve('.tmp/wave2_transfer_audit');
fs.mkdirSync(FAIL_DIR, { recursive: true });

function evalJsModule(jsCode, fnName, args) {
  try {
    const fnBody = `
      const logs = [];
      const module = { exports: {} };
      const exports = module.exports;
      const process = { env: { NODE_ENV: 'test' } };
      ${jsCode}
      const targetFn = (typeof module.exports === 'function') ? module.exports : (module.exports.${fnName} || module.exports.default);
      if (typeof targetFn !== 'function') {
        throw new Error('Target function ' + '${fnName}' + ' not found in module.exports');
      }
      const res = targetFn(...inputArgs);
      return { status: 0, return_json: JSON.stringify(res), stdout: logs.join(" ") };
    `;
    const fn = new Function('inputArgs', fnBody);
    return fn(args);
  } catch (err) {
    return { status: 1, return_json: null, stdout: '', error: err.message };
  }
}

function evalC(cCode, fnName, args, modId, inputId) {
  const runnerFile = path.join(FAIL_DIR, `${modId}_${inputId}_c_runner.c`);
  const binFile = path.join(FAIL_DIR, `${modId}_${inputId}_c_bin`);

  const argList = args.map(a => {
    if (typeof a === 'number') return `${a}LL`;
    if (typeof a === 'string') return `"${a}"`;
    if (typeof a === 'boolean') return a ? 'true' : 'false';
    return '0';
  }).join(', ');

  const isStringReturn = modId.includes('unicode') || modId.includes('badge') || modId.includes('branch');

  const mainRunner = `
${cCode}

int main(void) {
  ${isStringReturn ? `
    const char *res = ${fnName}(${argList});
    printf("\\"%s\\"", res ? res : "");
  ` : `
    long long res = ${fnName}(${argList});
    printf("%lld", res);
  `}
  return 0;
}
`;

  fs.writeFileSync(runnerFile, mainRunner, 'utf8');
  const build = spawnSync('/usr/bin/gcc', ['-O2', runnerFile, '-o', binFile]);
  if (build.status !== 0) {
    return { status: 2, return_json: null, error: `C_BUILD_FAIL: ${build.stderr?.toString()}` };
  }

  const run = spawnSync(binFile, { timeout: 5000 });
  try { fs.unlinkSync(binFile); } catch {}
  try { fs.unlinkSync(runnerFile); } catch {}

  return { status: run.status || 0, return_json: (run.stdout?.toString() || '').trim(), error: run.stderr?.toString() || null };
}

function evalRust(rsCode, fnName, args, modId, inputId) {
  const runnerFile = path.join(FAIL_DIR, `${modId}_${inputId}_rs_runner.rs`);
  const binFile = path.join(FAIL_DIR, `${modId}_${inputId}_rs_bin`);

  const argList = args.map(a => {
    if (typeof a === 'number') return `${a}i64`;
    if (typeof a === 'string') return `"${a}".to_string()`;
    if (typeof a === 'boolean') return a ? 'true' : 'false';
    return '0i64';
  }).join(', ');

  const mainRunner = `
${rsCode}

fn main() {
    let res = ${fnName}(${argList});
    print!("{}", res);
}
`;

  fs.writeFileSync(runnerFile, mainRunner, 'utf8');
  const build = spawnSync('/home/k/.cargo/bin/rustc', ['-O', runnerFile, '-o', binFile]);
  if (build.status !== 0) {
    return { status: 2, return_json: null, error: `RS_BUILD_FAIL: ${build.stderr?.toString()}` };
  }

  const run = spawnSync(binFile, { timeout: 5000 });
  try { fs.unlinkSync(binFile); } catch {}
  try { fs.unlinkSync(runnerFile); } catch {}

  return { status: run.status || 0, return_json: (run.stdout?.toString() || '').trim(), error: run.stderr?.toString() || null };
}

function evalGo(goCode, fnName, args, modId, inputId) {
  const runnerFile = path.join(FAIL_DIR, `${modId}_${inputId}_go_runner.go`);
  const binFile = path.join(FAIL_DIR, `${modId}_${inputId}_go_bin`);

  const argList = args.map(a => {
    if (typeof a === 'number') return `${a}`;
    if (typeof a === 'string') return `"${a}"`;
    if (typeof a === 'boolean') return a ? 'true' : 'false';
    return '0';
  }).join(', ');

  const mainRunner = `
${goCode}

func main() {
    res := ${fnName}(${argList})
    print(res)
}
`;

  fs.writeFileSync(runnerFile, mainRunner, 'utf8');
  const build = spawnSync('/home/k/.local/bin/go', ['build', '-o', binFile, runnerFile]);
  if (build.status !== 0) {
    return { status: 2, return_json: null, error: `GO_BUILD_FAIL: ${build.stderr?.toString()}` };
  }

  const run = spawnSync(binFile, { timeout: 5000 });
  try { fs.unlinkSync(binFile); } catch {}
  try { fs.unlinkSync(runnerFile); } catch {}

  const out = (run.stdout?.toString() || run.stderr?.toString() || '').trim();
  return { status: run.status || 0, return_json: out, error: run.status !== 0 ? run.stderr?.toString() : null };
}

function evalJava(javaCode, fnName, args, modId, inputId) {
  const className = `Runner_${modId}_${inputId}`;
  const srcFile = path.join(FAIL_DIR, `${className}.java`);

  const argList = args.map(a => {
    if (typeof a === 'number') return `${a}L`;
    if (typeof a === 'string') return `"${a}"`;
    if (typeof a === 'boolean') return a ? 'true' : 'false';
    return '0L';
  }).join(', ');

  const codeWithMain = javaCode.replace(`public class LinEmit {`, `public class ${className} {\n  public static void main(String[] args) {\n    Object res = ${fnName}(${argList});\n    System.out.print(res);\n  }`);

  fs.writeFileSync(srcFile, codeWithMain, 'utf8');
  const build = spawnSync('/home/k/.local/bin/javac', [srcFile]);
  if (build.status !== 0) {
    return { status: 2, return_json: null, error: `JAVA_BUILD_FAIL: ${build.stderr?.toString()}` };
  }

  const run = spawnSync('/home/k/.local/bin/java', ['-cp', FAIL_DIR, className], { timeout: 5000 });
  try { fs.unlinkSync(srcFile); } catch {}
  try { fs.unlinkSync(path.join(FAIL_DIR, `${className}.class`)); } catch {}

  const out = (run.stdout?.toString() || '').trim();
  return { status: run.status || 0, return_json: out, error: run.stderr?.toString() || null };
}

export async function runWave2TransferMatrix() {
  console.log('=== Running Wave 2: H_TRANSFER-01 Cross-Target Audit Matrix ===\n');

  const targets = [
    { id: 'c', name: 'C (GCC Native)', evalFn: evalC, wave: 1 },
    { id: 'rust', name: 'Rust (rustc Native)', evalFn: evalRust, wave: 1 },
    { id: 'go', name: 'Go (go build Native)', evalFn: evalGo, wave: 1 },
    { id: 'java', name: 'Java (javac / JVM)', evalFn: evalJava, wave: 2 }
  ];

  const results = {};

  for (const target of targets) {
    console.log(`Auditing Target: [${target.id.toUpperCase()}] — ${target.name} (Wave ${target.wave})`);
    let passed = 0;
    let total = 0;

    for (const mod of GATE_13C_ADVERSARIAL_CORPUS) {
      const codeJs = compileLiaToJs(mod.lin).js;
      const codeTarget = compileLia(mod.lin, { target: target.id }).code;
      const fnNameMatch = mod.lin.match(/!([A-Za-z0-9_]+)\(/);
      const fnName = fnNameMatch ? fnNameMatch[1] : 'solve';

      for (const inp of mod.inputs) {
        total++;
        const resJs = evalJsModule(codeJs, fnName, inp.args);
        const resTarget = target.evalFn(codeTarget, fnName, inp.args, mod.id, inp.id);

        let match = false;
        if (resTarget.status === 0 && resJs.status === 0) {
          const normJs = String(resJs.return_json || '').replace(/^"|"$/g, '');
          const normTarget = String(resTarget.return_json || '').replace(/^"|"$/g, '');
          match = (normJs === normTarget);
        }

        if (match) {
          passed++;
        }
      }
    }

    const currentScore = total > 0 ? (passed / total) : 0;

    results[target.id] = {
      name: target.name,
      wave: target.wave,
      totalTrials: total,
      passedTrials: passed,
      score: currentScore,
      certified: currentScore === 1.0
    };

    console.log(`  ✔ Passed: ${passed}/${total} (${(currentScore * 100).toFixed(2)}%)\n`);
  }

  console.log('======================================================================');
  console.log('        WAVE 2 H_TRANSFER-01 AUDIT & REGRESSION SUMMARY MATRIX        ');
  console.log('======================================================================');
  console.log('| Target | Wave | Trials | Passed | Soundness | Status     | Regress? |');
  console.log('|:------:|:----:|:------:|:------:|:---------:|:----------:|:--------:|');
  for (const [tId, data] of Object.entries(results)) {
    const regr = (data.wave === 1 && data.passedTrials < 26) ? 'FAIL ❌' : 'ZERO ✅';
    console.log(`| ${tId.padEnd(6)} | ${String(data.wave).padStart(4)} | ${String(data.totalTrials).padStart(6)} | ${String(data.passedTrials).padStart(6)} | ${(data.score * 100).toFixed(1).padStart(8)}% | ${data.certified ? 'CERTIFIED ' : 'PENDING   '} | ${regr.padStart(8)} |`);
  }
  console.log('======================================================================\n');

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWave2TransferMatrix();
}
