#!/usr/bin/env node
/**
 * LIN Target Quality Benchmark
 * FULL = compile+run PASS on all 7 real nucleus langs. COMPILE_ONLY is not done.
 * INTEL/stub auto-PASS is forbidden. Wipes .lin_quality_work each run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileLia } from '../src/multi_emit.mjs';
import { ensureToolchains } from './ensure_toolchains.mjs';

ensureToolchains({ quiet: true });

const WIN = process.platform === 'win32';
const linCode = fs.readFileSync('tests/target_quality.lin', 'utf8');
const targets = ['js', 'ts', 'py', 'go', 'rust', 'c', 'java'];
const workRoot = path.join(process.cwd(), '.lin_quality_work');
fs.rmSync(workRoot, { recursive: true, force: true });

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout || 60_000,
    shell: opts.shell ?? WIN,
    env: opts.env || process.env,
    cwd: opts.cwd,
    windowsHide: true,
  });
  const err = r.error ? String(r.error.message || r.error) : '';
  const out = `${r.stdout || ''}${r.stderr || ''}${err ? `\n${err}` : ''}`.slice(0, 800);
  return { status: r.status, out, error: err };
}

function runLooksOk(out) {
  const t = String(out || '');
  if (!t.includes('3628800')) return false;
  if (!t.includes('5050')) return false;
  if (!/\b64\b/.test(t)) return false;
  if (!/\b10\b/.test(t)) return false;
  return /false|False|\b0\b/.test(t);
}

function checkTarget(target, code) {
  const work = path.join(workRoot, target);
  fs.mkdirSync(work, { recursive: true });
  let fileName = `bench.${target === 'js' ? 'cjs' : target === 'ts' ? 'ts' : target === 'py' ? 'py' : target === 'rust' ? 'rs' : target === 'go' ? 'go' : target === 'c' ? 'c' : 'java'}`;
  if (target === 'java') {
    const m = code.match(/public class ([A-Za-z][A-Za-z0-9]*)/);
    if (m) fileName = `${m[1]}.java`;
  }
  const filePath = path.join(work, fileName);
  fs.writeFileSync(filePath, code, 'utf8');

  let compileOk = false;
  let runOk = false;
  let detail = '';

  if (target === 'js' || target === 'ts') {
    let jsFile = filePath;
    if (target === 'ts') {
      const tscPath = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
      const r1 = run('node', [tscPath, '--target', 'es2020', '--module', 'commonjs', '--outDir', work, filePath], { shell: false });
      compileOk = r1.status === 0;
      detail = r1.out;
      jsFile = path.join(work, path.basename(fileName, '.ts') + '.js');
      const cjsFile = path.join(work, 'bench.cjs');
      if (compileOk && fs.existsSync(jsFile)) {
        fs.copyFileSync(jsFile, cjsFile);
        jsFile = cjsFile;
      }
    } else {
      compileOk = true;
    }
    const runner = path.join(work, 'run_quality.cjs');
    const reqName = path.basename(jsFile);
    fs.writeFileSync(runner, `'use strict';
const m = require('./${reqName}');
const f = m.default && m.default.factorial ? m.default : m;
const d = f.double_ || f.double;
console.log(JSON.stringify([f.factorial(10), f.isEven(7), f.sumTo(100), f.square(8), d(5)]));
`, 'utf8');
    const r2 = run('node', [runner], { cwd: work, shell: false });
    if (target === 'js') compileOk = r2.status === 0;
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || detail;
  } else if (target === 'py') {
    const r1 = run('python', ['-m', 'py_compile', filePath]);
    compileOk = r1.status === 0;
    const runner = path.join(work, 'run_quality.py');
    fs.writeFileSync(runner, `import importlib.util
spec = importlib.util.spec_from_file_location("m", "bench.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ie = getattr(mod, "is_even", None) or getattr(mod, "isEven")
st = getattr(mod, "sum_to", None) or getattr(mod, "sumTo")
d = getattr(mod, "double_", None) or getattr(mod, "double")
print(mod.factorial(10), ie(7), st(100), mod.square(8), d(5))
`, 'utf8');
    const r2 = run('python', [runner], { cwd: work });
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || r1.out;
  } else if (target === 'go') {
    fs.writeFileSync(path.join(work, 'go.mod'), 'module bench\n\ngo 1.22\n');
    const r1 = run('go', ['build', '-o', WIN ? 'bench.exe' : 'bench', 'bench.go'], { cwd: work });
    compileOk = r1.status === 0;
    const exe = path.join(work, WIN ? 'bench.exe' : 'bench');
    const r2 = compileOk ? run(exe, [], { cwd: work, shell: false }) : r1;
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || r1.out;
  } else if (target === 'rust') {
    const exe = path.join(work, WIN ? 'bench.exe' : 'bench');
    const r1 = run('rustc', [filePath, '-o', exe, '--cap-lints', 'allow']);
    compileOk = r1.status === 0;
    const r2 = compileOk ? run(exe, [], { cwd: work, shell: false }) : r1;
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || r1.out;
  } else if (target === 'c') {
    const exe = path.join(work, WIN ? 'bench.exe' : 'bench');
    const r1 = run('gcc', ['-std=gnu11', filePath, '-o', exe]);
    compileOk = r1.status === 0;
    const r2 = compileOk ? run(exe, [], { cwd: work, shell: false }) : r1;
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || r1.out;
  } else if (target === 'java') {
    const r1 = run('javac', [filePath]);
    compileOk = r1.status === 0;
    const className = path.basename(fileName, '.java');
    const r2 = compileOk ? run('java', ['-cp', work, className]) : r1;
    runOk = r2.status === 0 && runLooksOk(r2.out);
    detail = r2.out || r1.out;
  }

  return { compileOk, runOk, detail, bytes: Buffer.byteLength(code, 'utf8') };
}

console.log('====================================================================');
console.log('LIN TARGET QUALITY BENCHMARK');
console.log('====================================================================\n');

const scores = {};
for (const t of targets) {
  const emitted = compileLia(linCode, { target: t, stubRuntime: false });
  const code = emitted.code || '';
  const check = checkTarget(t, code);
  scores[t] = check;
}

console.log('| Target | Compile | Run | Bytes | Quality Note |');
console.log('|--------|---------|-----|-------|--------------|');
for (const t of targets) {
  const s = scores[t];
  const note = s.compileOk && s.runOk ? 'FULL' : s.compileOk ? 'COMPILE_ONLY' : 'FAIL';
  console.log(`| ${t.padEnd(6)} | ${s.compileOk ? 'PASS' : 'FAIL'}    | ${s.runOk ? 'PASS' : (s.compileOk ? 'N/A' : 'FAIL')} | ${String(s.bytes).padStart(5)} | ${note.padEnd(12)} |`);
}

console.log('\n====================================================================');
console.log('NOTES');
console.log('====================================================================');
for (const t of targets) {
  const s = scores[t];
  if (!s.compileOk || !s.runOk) {
    console.log(`${t}: ${s.detail.slice(0, 240)}`);
  }
}
console.log('====================================================================');
