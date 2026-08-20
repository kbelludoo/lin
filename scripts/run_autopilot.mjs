#!/usr/bin/env node
/**
 * Autopilot — Infinite Loop
 * Compiles .lin/autopilot.lin → JS, runs forever.
 * Ollama suggests new languages each round.
 *
 * Usage:
 *   node scripts/run_autopilot.mjs
 *   node scripts/run_autopilot.mjs --cycles 2
 *   Ctrl+C to stop
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

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const CYCLES = parseInt(getArg('cycles', '2'), 10);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

// ─── Host primitives ───
function execCmd(cmd) {
  const { execSync: exec } = require('child_process');
  try {
    return exec(cmd, { cwd: process.cwd(), timeout: 600000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || e.message);
  }
}

function writeAppend(filePath, content) {
  const _path = require('path');
  const _fs = require('fs');
  const abs = _path.isAbsolute(filePath) ? filePath : _path.join(process.cwd(), filePath);
  _fs.mkdirSync(_path.dirname(abs), { recursive: true });
  _fs.appendFileSync(abs, content, 'utf-8');
  return 'ok';
}

function httpPostSync(url, model, prompt) {
  const { execSync: exec } = require('child_process');
  const body = JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, seed: 42 } });
  const curlBody = body.replace(/'/g, "'\\''");
  try {
    return exec('curl -s -X POST -H "Content-Type: application/json" -d ' + "'" + curlBody + "'" + ' "' + url + '"', { timeout: 120000, encoding: 'utf-8' });
  } catch (e) { return JSON.stringify({ error: e.message }); }
}

// ─── Compile LIN ───
const linPath = path.join(ROOT, '.lin', 'autopilot.lin');
const lin = fs.readFileSync(linPath, 'utf-8');
const result = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
const js = result.js;

const bridge = `
  const exec_cmd = ${execCmd.toString()};
  const write_file = ${writeAppend.toString()};
  const http_post = ${httpPostSync.toString()};
  const OLLAMA_MODEL = ${JSON.stringify(OLLAMA_MODEL)};
  const split = function(s, d) { return String(s).split(d); };
  const length = function(a) { return Array.isArray(a) ? a.length : String(a).length; };
  const includes = function(s, sub) { return String(s).includes(sub); };
  const get_timestamp = function() { return new Date().toISOString().slice(11,19); };
  const parseLia = require('${path.join(ROOT, 'src', 'compiler.mjs')}').parseLia;
  const tryParseStmts = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').tryParseStmts;
  const collectAssignedIds = require('${path.join(ROOT, 'src', 'body_ast.mjs')}').collectAssignedIds;
  const { isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine, splitPrefixIncCond,
          isNumishId, isStringishId, isBoolishId, parseParamList,
          emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
          collectFreeHostIds, emitFreeHostDecls, isBoolFnName } = require('${path.join(ROOT, 'src', 'emit_shared.mjs')}');
`;

const patched = bridge + '\n' + js;
const tmp = path.join(os.tmpdir(), 'lin_autopilot_' + process.pid + '.cjs');
fs.writeFileSync(tmp, patched, 'utf-8');

let mod;
try {
  mod = createRequire(import.meta.url)(tmp);
} catch (e) {
  console.error('Load FAILED:', e.message.slice(0, 300));
  process.exit(1);
} finally {
  try { fs.rmSync(tmp, { force: true }); } catch {}
}

// ─── Infinite loop ───
const INITIAL_QUEUE = 'basic,pascal,forth,prolog,ada,scheme,fortran,cobol,smalltalk,lisp,ruby,perl,php,dart,r,matlab,bash,sql,assembly,verilog';

console.log('');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║  Autopilot INFINITO — LIN + Ollama                   ║');
console.log('║  Ctrl+C para parar                                   ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');

// Init
const init = mod.init(OLLAMA_MODEL);
if (init === 'no ollama') {
  console.error('FATAL: Ollama not running. Run: ollama serve');
  process.exit(1);
}
console.log('  Init OK — starting infinite loop\n');

let queue = INITIAL_QUEUE;
let done = '';
let round = 1;

// Graceful shutdown
let running = true;
process.on('SIGINT', () => { running = false; console.log('\n  Stopping after current language...'); });
process.on('SIGTERM', () => { running = false; });

while (running) {
  console.log(`\n═══ Round ${round} ═══`);
  console.log(`  Queue: ${queue.split(',').length} languages`);
  console.log(`  Done:  ${done ? done.split(',').length : 0} languages`);

  // Process one round
  done = mod.process_one_round(queue, done, CYCLES, OLLAMA_MODEL);

  if (!running) break;

  // Every 3 rounds, ask Ollama for new languages
  if (round % 3 === 0) {
    console.log('\n  Asking Ollama for new language suggestions...');
    const suggestions = mod.ask_new_langs(done, OLLAMA_MODEL);
    const newLangs = suggestions.split(',').map(s => s.trim()).filter(Boolean);
    for (const lang of newLangs) {
      if (!done.includes(lang) && !queue.includes(lang)) {
        queue += ',' + lang;
        console.log(`  + Added: ${lang}`);
      }
    }
  }

  round++;
}

// Save final state
const summary = { done, rounds: queue.split(',').length, completedAt: new Date().toISOString() };
fs.mkdirSync(path.join(ROOT, '.lin', 'language_learning'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.lin', 'language_learning', 'autopilot_final.json'), JSON.stringify(summary, null, 2));

console.log('\n  Stopped. Results saved to .lin/language_learning/autopilot_final.json');
console.log(`  Processed ${done.split(',').length} languages in ${round - 1} rounds`);
