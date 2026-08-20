/**
 * Language Acquisition Loop — Host Runner
 *
 * Compiles .lin/language_learning_loop.lin → JS,
 * injects SYNCHRONOUS host primitives (http_post, write_file, run_test),
 * executes main(language, cycles).
 *
 * Usage:
 *   node scripts/run_acquisition_loop.mjs --language basic --cycles 3
 *   OLLAMA_MODEL=llama3 node scripts/run_acquisition_loop.mjs --language pascal
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from '../src/compiler.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ─── CLI ───
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const LANGUAGE = getArg('language', 'basic');
const CYCLES = parseInt(getArg('cycles', '3'), 10);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

// ─── Synchronous host primitives (LIN generates sync JS) ───
function httpPostSync(url, model, prompt) {
  const { execSync } = require('child_process');
  // Build proper JSON in JS — avoids LIN string escaping issues
  const body = JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, seed: 42 } });
  const curlBody = body.replace(/'/g, "'\\''");
  try {
    const out = execSync(
      'curl -s -X POST -H "Content-Type: application/json" -d ' + "'" + curlBody + "'" + ' "' + url + '"',
      { timeout: 120000, encoding: 'utf-8' }
    );
    return out;
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

function writeFileSync(filePath, content) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return 'wrote ' + abs + ' (' + content.length + ' bytes)';
}

function runTestSync(command, cwd) {
  const { execSync } = require('child_process');
  try {
    const out = execSync(command, { cwd: cwd || process.cwd(), timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out;
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || e.message);
  }
}

// ─── Compile LIN → JS and run ───
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Language Acquisition Loop — Host Runner');
  console.log('  Target:  ' + LANGUAGE);
  console.log('  Model:   ' + OLLAMA_MODEL);
  console.log('  Cycles:  ' + CYCLES);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Compile the LIN orchestrator
  const linPath = path.join(ROOT, '.lin', 'language_learning_loop.lin');
  const lin = fs.readFileSync(linPath, 'utf-8');

  console.log('  [compile] Compiling LIN orchestrator...');
  let js;
  try {
    const result = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
    js = result.js;
    console.log('  [compile] OK —', js.length, 'bytes');
  } catch (e) {
    console.error('  [compile] FAILED:', e.message.slice(0, 300));
    process.exit(1);
  }

  // Step 2: Build host bridge with SYNCHRONOUS primitives
  const bridge = `
    // ─── Host primitives (synchronous, injected by run_acquisition_loop.mjs) ───
    const http_post = ${httpPostSync.toString()};
    const _fs = require('fs');
    const _path = require('path');
    const _ROOT = ${JSON.stringify(ROOT)};
    const write_file = function(filePath, content) {
      const abs = _path.isAbsolute(filePath) ? filePath : _path.join(_ROOT, filePath);
      _fs.mkdirSync(_path.dirname(abs), { recursive: true });
      _fs.writeFileSync(abs, content, 'utf-8');
      return 'wrote ' + abs + ' (' + content.length + ' bytes)';
    };
    const run_test = ${runTestSync.toString()};
    const includes = function(s, sub) { return String(s).includes(sub); };

    // ─── extract_text: parse Ollama JSON and extract response text ───
    const extract_text = function(raw) {
      if (typeof raw !== 'string') return raw;
      if (!raw.includes('created_at')) return raw;
      try {
        const obj = JSON.parse(raw);
        return obj.response || obj.error || raw;
      } catch(e) { return raw; }
    };

    // ─── Ollama model override ───
    const OLLAMA_MODEL = ${JSON.stringify(OLLAMA_MODEL)};

    // ─── extract_text: parse Ollama JSON and extract response text ───
    const extract_text = function(raw) {
      try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return obj.response || obj.error || raw;
      } catch(e) { return raw; }
    };

    // ─── Re-inject shared helpers ───
    const parseLia = require('${path.join(ROOT, 'src', 'compiler.mjs')}').parseLia;
    const tryParseStmts = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').tryParseStmts;
    const collectAssignedIds = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').collectAssignedIds;
    const { isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine, splitPrefixIncCond,
            isNumishId, isStringishId, isBoolishId, parseParamList,
            emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
            collectFreeHostIds, emitFreeHostDecls, isBoolFnName } = require('${path.join(ROOT, 'src', 'emit_shared.mjs')}');
  `;

  const patched = bridge + '\n' + js;

  // Step 3: Write CJS to temp and require
  const tmp = path.join(os.tmpdir(), 'lin_acquire_' + process.pid + '.cjs');
  fs.writeFileSync(tmp, patched, 'utf-8');
  console.log('  [bridge]  Wrote CJS bridge:', tmp);

  let mod;
  try {
    mod = createRequire(import.meta.url)(tmp);
  } catch (e) {
    console.error('  [bridge]  Load FAILED:', e.message.slice(0, 300));
    const lines = patched.split('\n');
    const errLine = parseInt((e.message.match(/:(\d+)/) || [])[1] || '0');
    if (errLine > 0) {
      console.error('  [bridge]  Around line', errLine, ':');
      for (let i = Math.max(0, errLine - 3); i < Math.min(lines.length, errLine + 3); i++) {
        console.error('  ' + (i === errLine - 1 ? '>>>' : '   ') + ' ' + (i + 1) + ': ' + lines[i].slice(0, 120));
      }
    }
    process.exit(1);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }

  console.log('  [bridge]  Module loaded OK');
  console.log('  [bridge]  Exports:', Object.keys(mod).join(', '));
  console.log('');

  // Step 4: Execute main(language, cycles)
  if (typeof mod.main !== 'function') {
    console.error('  [exec] main() not exported. Available:', Object.keys(mod).join(', '));
    process.exit(1);
  }

  console.log('  [exec] Calling main(' + LANGUAGE + ', ' + CYCLES + ')...');
  try {
    const result = mod.main(LANGUAGE, CYCLES);
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Result:');
    console.log(result);
    console.log('═══════════════════════════════════════════════════════');
  } catch (e) {
    console.error('  [exec] FAILED:', e.message);
    console.error('  [exec] Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
