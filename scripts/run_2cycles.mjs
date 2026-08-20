#!/usr/bin/env node
/**
 * Language Acquisition Loop — 2 Cycles
 *
 * Runs the LIN acquisition loop for 2 cycles on a target language.
 * Each cycle: knowledge induction → test generation → fuzzer → refinement → transfer.
 *
 * Usage:
 *   node scripts/run_2cycles.mjs
 *   node scripts/run_2cycles.mjs --language pascal
 *   OLLAMA_MODEL=llama3 node scripts/run_2cycles.mjs --language cobol
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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
const CYCLES = 2;

// ─── Synchronous host primitives ───
function httpPostSync(url, model, prompt) {
  const { execSync: exec } = require('child_process');
  const body = JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, seed: 42 } });
  const curlBody = body.replace(/'/g, "'\\''");
  try {
    return exec(
      'curl -s -X POST -H "Content-Type: application/json" -d ' + "'" + curlBody + "'" + ' "' + url + '"',
      { timeout: 120000, encoding: 'utf-8' }
    );
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

function runTestSync(command) {
  const { execSync: exec } = require('child_process');
  try {
    return exec(command, { cwd: process.cwd(), timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || e.message);
  }
}

function extractText(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return obj.response || obj.error || raw;
  } catch { return raw; }
}

// ─── Compile and run ───
async function main() {
  const banner = `
═══════════════════════════════════════════════════════
  Language Acquisition Loop — 2 Cycles
  Target:  ${LANGUAGE}
  Model:   ${OLLAMA_MODEL}
═══════════════════════════════════════════════════════`;
  console.log(banner);

  // Compile LIN orchestrator
  const linPath = path.join(ROOT, '.lin', 'language_learning_loop.lin');
  const lin = fs.readFileSync(linPath, 'utf-8');

  console.log('\n  [compile] Compiling LIN orchestrator...');
  let js;
  try {
    const result = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
    js = result.js;
    console.log('  [compile] OK —', js.length, 'bytes');
  } catch (e) {
    console.error('  [compile] FAILED:', e.message.slice(0, 300));
    process.exit(1);
  }

  // Build host bridge
  const bridge = `
    const http_post = ${httpPostSync.toString()};
    const _fs = require('fs');
    const _path = require('path');
    const _ROOT = ${JSON.stringify(ROOT)};
    const write_file = function(fp, c) {
      const a = _path.isAbsolute(fp) ? fp : _path.join(_ROOT, fp);
      _fs.mkdirSync(_path.dirname(a), { recursive: true });
      _fs.writeFileSync(a, c, 'utf-8');
      return 'wrote ' + a + ' (' + c.length + ' bytes)';
    };
    const run_test = ${runTestSync.toString()};
    const OLLAMA_MODEL = ${JSON.stringify(OLLAMA_MODEL)};
    const extract_text = ${extractText.toString()};
    const parseLia = require('${path.join(ROOT, 'src', 'compiler.mjs')}').parseLia;
    const tryParseStmts = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').tryParseStmts;
    const collectAssignedIds = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').collectAssignedIds;
    const { isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine, splitPrefixIncCond,
            isNumishId, isStringishId, isBoolishId, parseParamList,
            emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
            collectFreeHostIds, emitFreeHostDecls, isBoolFnName } = require('${path.join(ROOT, 'src', 'emit_shared.mjs')}');
  `;

  const patched = bridge + '\n' + js;

  // Load CJS
  const tmp = path.join(os.tmpdir(), 'lin_2cycles_' + process.pid + '.cjs');
  fs.writeFileSync(tmp, patched, 'utf-8');

  let mod;
  try {
    mod = createRequire(import.meta.url)(tmp);
  } catch (e) {
    console.error('  [bridge] Load FAILED:', e.message.slice(0, 300));
    process.exit(1);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }

  console.log('  [bridge] Module loaded — exports:', Object.keys(mod).join(', '));

  if (typeof mod.main !== 'function') {
    console.error('  [exec] main() not exported');
    process.exit(1);
  }

  // Execute 2 cycles
  console.log(`\n  [exec] Running ${CYCLES} cycles for "${LANGUAGE}"...\n`);
  try {
    const result = mod.main(LANGUAGE, CYCLES);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  RESULT:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(result);
    console.log('═══════════════════════════════════════════════════════');

    // Show artifacts
    const dir = path.join(ROOT, '.lin', 'language_learning', LANGUAGE);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      console.log(`\n  Artifacts in .lin/language_learning/${LANGUAGE}/:`);
      files.forEach(f => {
        const s = fs.statSync(path.join(dir, f));
        console.log(`    ${f} (${s.size} bytes)`);
      });
    }

    console.log('\n  DONE.');
  } catch (e) {
    console.error('  [exec] FAILED:', e.message);
    console.error('  [exec] Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
