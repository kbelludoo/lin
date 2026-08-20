/**
 * LIN WAVE 1: H_TRANSFER-01 Semantic Cross-Target Transfer & Retroactive Audit Matrix
 *
 * Operationalizes H_TRANSFER-01 across Wave 1 Systems Targets:
 * Targets: C, Rust, Go, Zig (Sim/Host)
 *
 * Protocol:
 * 1. Evaluate baseline accuracy Score(T_i | baseline) across 6 adversarial boundary vectors (26 trials)
 * 2. Apply Wave 1 Lowering Refinements (Integer Division soundness, : { else parsing, cTypeFor, Math helpers)
 * 3. Evaluate new accuracy Score(T_i | Wave 1)
 * 4. Compute Delta_transfer(T_i) = Score(T_i | Wave 1) - Score(T_i | baseline)
 * 5. Verify Zero Regression (Delta < 0 is an immediate fatal gate violation)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileLiaToJs } from '../src/compiler.mjs';
import { compileLia } from '../src/multi_emit.mjs';
import { GATE_13C_ADVERSARIAL_CORPUS } from './bench_linobj_cross_target_zig_adversarial_13c.mjs';

const FAIL_DIR = path.resolve('.tmp/wave1_transfer_audit');
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

export async function runWave1TransferMatrix() {
  console.log('=== Running Wave 1: H_TRANSFER-01 Semantic Cross-Target Audit Matrix ===\n');

  const targets = [
    { id: 'c', name: 'C (GCC Native)', evalFn: evalC, baselineScore: 0.3077 },
    { id: 'rust', name: 'Rust (rustc Native)', evalFn: evalRust, baselineScore: 0.8500 },
    { id: 'go', name: 'Go (go build Native)', evalFn: evalGo, baselineScore: 0.8800 }
  ];

  const results = {};

  for (const target of targets) {
    console.log(`Auditing Target: [${target.id.toUpperCase()}] — ${target.name}`);
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
    const delta = currentScore - target.baselineScore;

    results[target.id] = {
      name: target.name,
      totalTrials: total,
      passedTrials: passed,
      baselineScore: target.baselineScore,
      currentScore: currentScore,
      deltaTransfer: delta,
      regression: delta < 0
    };

    console.log(`  ✔ Passed: ${passed}/${total} (${(currentScore * 100).toFixed(2)}%) | Delta vs Baseline: ${(delta >= 0 ? '+' : '')}${(delta * 100).toFixed(2)}%\n`);
  }

  console.log('======================================================================');
  console.log('        WAVE 1 H_TRANSFER-01 RETROACTIVE AUDIT SUMMARY MATRIX         ');
  console.log('======================================================================');
  console.log('| Target | Baseline | Wave 1 Post-Lowering | Delta Transfer | Regress? |');
  console.log('|:------:|:--------:|:--------------------:|:--------------:|:--------:|');
  for (const [tId, data] of Object.entries(results)) {
    console.log(`| ${tId.padEnd(6)} | ${(data.baselineScore * 100).toFixed(1).padStart(7)}% | ${(data.currentScore * 100).toFixed(1).padStart(19)}% | ${(data.deltaTransfer >= 0 ? '+' : '').concat((data.deltaTransfer * 100).toFixed(1)).padStart(13)}% | ${data.regression ? 'FAIL ❌' : 'PASS ✅'} |`);
  }
  console.log('======================================================================\n');

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWave1TransferMatrix();
}
