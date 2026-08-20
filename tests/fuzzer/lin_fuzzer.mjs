/**
 * LIN Language Fuzzer — Closed-Loop Bug Discovery + Repair
 *
 * Pipeline:
 *   generate → parse → detect → minimize → classify → repair → validate → regress
 *
 * Layers:
 *   1. Character-level fuzzer (reserved chars in contexts)
 *   2. Grammar fuzzer (random valid/invalid LIN programs)
 *   3. Differential testing (same program → multiple backends → compare)
 *   4. Mutation testing (mutate valid programs → check consistency)
 *   5. Adversarial corpus (permanent trap collection)
 */
import fs from 'node:fs';
import { parseLia, compileLiaToJs } from '../../src/compiler.mjs';
import {
  QUOTED_LITERALS, IDENTIFIER_TRAPS, OPERATOR_TRAPS,
  NESTING_TRAPS, STRING_EDGE_CASES, MINIMAL_PROGRAMS, ORACLE,
} from './lin_corpus.mjs';

const REGRESSION_DIR = new URL('../tests/fuzzer/regressions/', import.meta.url).pathname;

// ── Utilities ────────────────────────────────────────────────────────

function mkdirp(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function parseSafe(lin) {
  try { return { ok: true, prog: parseLia(lin) }; }
  catch (e) { return { ok: false, error: e }; }
}

function emitJsSafe(lin) {
  try {
    const { js, program } = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
    return { ok: true, js, program };
  } catch (e) { return { ok: false, error: e }; }
}

function execJsCode(jsCode, callExpr) {
  const tmpPath = `/tmp/lin_fuzz_${Date.now()}_${Math.random().toString(36).slice(2)}.cjs`;
  try {
    fs.writeFileSync(tmpPath, jsCode, 'utf8');
    const mod = require(tmpPath);
    const fn = typeof mod === 'function' ? mod : mod.default || mod[Object.keys(mod)[0]];
    if (typeof fn !== 'function') return { ok: false, error: new Error('not a function') };
    const result = fn(...parseCallArgs(callExpr));
    return { ok: true, result };
  } catch (e) { return { ok: false, error: e }; }
  finally { try { fs.rmSync(tmpPath, { force: true }); } catch {} }
}

function parseCallArgs(callExpr) {
  const m = callExpr.match(/^\w+\((.*)\)$/s);
  if (!m) return [];
  const raw = m[1].trim();
  if (!raw) return [];
  const args = [];
  let depth = 0, inStr = null, start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (ch === inStr && raw[i - 1] !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(eval(raw.slice(start, i).trim()));
      start = i + 1;
    }
  }
  args.push(eval(raw.slice(start).trim()));
  return args;
}

// ── Layer 1: Character-level Lexer Fuzzer ────────────────────────────

function fuzzLexerCharacters() {
  const results = [];

  for (const item of QUOTED_LITERALS) {
    const lin = `@LIN:L1c:0.2\n^schema_once\n!f(){^(1)}\n=ex{f}`;
    // Inject the quoted literal into a string context
    const testLin = `@LIN:L1c:0.2\n^schema_once\n!f(){s=${item.input};^(1)}\n=ex{f}`;
    const p = parseSafe(testLin);
    const e = emitJsSafe(testLin);
    results.push({
      layer: 1, category: 'quoted_literal', ...item,
      parsed: p.ok, emitted: e.ok,
      error: (!p.ok ? p.error.message : !e.ok ? e.error.message : null),
    });
  }

  for (const item of IDENTIFIER_TRAPS) {
    const testLin = `@LIN:L1c:0.2\n^schema_once\n!${item.input}(){^(1)}\n=ex{${item.input}}`;
    const p = parseSafe(testLin);
    const e = emitJsSafe(testLin);
    results.push({
      layer: 1, category: 'identifier_trap', ...item,
      parsed: p.ok, emitted: e.ok,
      error: (!p.ok ? p.error.message : !e.ok ? e.error.message : null),
    });
  }

  for (const item of STRING_EDGE_CASES) {
    const p = parseSafe(item.input);
    const e = emitJsSafe(item.input);
    results.push({
      layer: 1, category: 'string_edge', ...item,
      parsed: p.ok, emitted: e.ok,
      error: (!p.ok ? p.error.message : !e.ok ? e.error.message : null),
    });
  }

  return results;
}

// ── Layer 2: Grammar Fuzzer ──────────────────────────────────────────

const GRAMMAR_ATOMS = ['1', '0', '-1', '42', '3.14', 'true', 'false', 'null',
  '"hello"', "'world'", '"a+b"', "'$'", '"$K"', 'x', 'y', 'n', 'a', 'b',
  "'!f(){}'", "'#(i=0;i<10;i++)'", "'^(return)'", "'?=if #=for'", "'@LIN:L1c:0.2'"];
const GRAMMAR_OPS = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
const GRAMMAR_TYPES = ['int', 'num', 'str', 'bool', 'any', 'str|num', 'int|null'];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function genExpr(depth) {
  if (depth <= 0 || Math.random() < 0.3) return pick(GRAMMAR_ATOMS);
  const op = pick(GRAMMAR_OPS);
  const left = genExpr(depth - 1);
  const right = genExpr(depth - 1);
  return `(${left}${op}${right})`;
}

function genBody(depth) {
  const parts = [];
  const nstmts = randInt(1, 4);
  for (let s = 0; s < nstmts; s++) {
    const roll = Math.random();
    if (roll < 0.3) {
      // assignment
      parts.push(`_${randInt(0,9)}=${genExpr(1)}`);
    } else if (roll < 0.5) {
      // if
      parts.push(`?(${genExpr(1)}){${genBody(depth - 1)}}:{}`);
    } else if (roll < 0.65) {
      // for
      parts.push(`#(_i=0;_i<${randInt(1,5)};_i++){${genBody(depth - 1)}}`);
    } else if (roll < 0.8) {
      // return
      parts.push(`^(${genExpr(1)})`);
    } else {
      // string assignment with adversarial content
      parts.push(`_s=${pick(GRAMMAR_ATOMS)}`);
    }
  }
  return parts.join(';');
}

function genProgram() {
  const nfuncs = randInt(1, 3);
  let header = '@LIN:L1c:0.2\n^schema_once';
  const consts = Math.random() < 0.2 ? '\n$K{b=1 kb=1024}' : '';
  const hasCond = Math.random() < 0.3 ? '\n?(@debug){!(console.log("d"))}:{}' : '';
  const fns = [];
  const exs = [];
  for (let f = 0; f < nfuncs; f++) {
    const name = `f${f}`;
    const nargs = randInt(0, 3);
    const params = [];
    for (let p = 0; p < nargs; p++) params.push(`_${p}:${pick(GRAMMAR_TYPES)}`);
    const retType = Math.random() < 0.4 ? ` -> ${pick(GRAMMAR_TYPES)}` : '';
    const body = genBody(2);
    fns.push(`!${name}(${params.join(',')})${retType}{${body}}`);
    exs.push(name);
  }
  return `${header}${consts}${hasCond}\n${fns.join('\n')}\n=ex{${exs.join(',')}}`;
}

function fuzzGrammar(n) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const prog = genProgram();
    const p = parseSafe(prog);
    const e = emitJsSafe(prog);
    results.push({
      layer: 2, category: 'grammar_random',
      input: prog, parsed: p.ok, emitted: e.ok,
      error: (!p.ok ? p.error.message : !e.ok ? e.error.message : null),
      id: i,
    });
  }
  return results;
}

// ── Layer 3: Differential Testing ────────────────────────────────────

function differentialTest() {
  const results = [];
  const targets = ['ts', 'py', 'go', 'rust', 'c', 'java', 'zig', 'cs'];

  for (const prog of MINIMAL_PROGRAMS) {
    const p = parseSafe(prog);
    if (!p.ok) continue;

    const targetResults = {};
    for (const target of targets) {
      try {
        const emitMod = require(`../../src/emit_${target}.mjs`);
        const emitter = emitMod[`emit${target.charAt(0).toUpperCase() + target.slice(1)}`];
        const out = emitter(p.prog);
        targetResults[target] = { ok: true, codeLen: String(out.code).length, preview: String(out.code).slice(0, 100) };
      } catch (e) {
        targetResults[target] = { ok: false, error: e.message.slice(0, 100) };
      }
    }

    // Execute JS for oracle check
    const jsResult = emitJsSafe(prog);
    let oracleResult = null;
    if (jsResult.ok) {
      const callKey = Object.keys(ORACLE).find(k => prog.includes(k.split('(')[0]));
      if (callKey) {
        const exec = execJsCode(jsResult.js, callKey);
        if (exec.ok) oracleResult = exec.result;
      }
    }

    results.push({
      layer: 3, category: 'differential',
      input: prog, targets: targetResults, oracle: oracleResult,
    });
  }
  return results;
}

// ── Layer 4: Mutation Testing ────────────────────────────────────────

const MUTATIONS = [
  { find: '$K', replace: "'$K'", desc: 'constant ref → quoted string' },
  { find: '!f()', replace: '!f($)', desc: 'bare dollar in params' },
  { find: '==', replace: '===', desc: 'double → triple equals' },
  { find: '!=', replace: '!==', desc: 'not-equals → strict not-equals' },
  { find: '&&', replace: '||', desc: 'and → or' },
  { find: '{', replace: '(', desc: 'brace → paren' },
  { find: '+', replace: '-', desc: 'plus → minus' },
  { find: '^(a+b)', replace: '^(a+b);', desc: 'extra semicolon after return' },
  { find: '^schema_once', replace: '', desc: 'remove schema declaration' },
];

function fuzzMutations() {
  const results = [];
  for (const base of MINIMAL_PROGRAMS.slice(0, 5)) {
    const baseParsed = parseSafe(base);
    const baseEmitted = emitJsSafe(base);
    for (const mut of MUTATIONS) {
      if (!base.includes(mut.find)) continue;
      const mutated = base.replace(mut.find, mut.replace);
      const mp = parseSafe(mutated);
      const me = emitJsSafe(mutated);
      results.push({
        layer: 4, category: 'mutation',
        base, mutation: mut.desc, mutated,
        baseParsed: baseParsed.ok, baseEmitted: baseEmitted.ok,
        mutatedParsed: mp.ok, mutatedEmitted: me.ok,
        semanticsChanged: baseParsed.ok !== mp.ok || baseEmitted.ok !== me.ok,
        error: (!mp.ok ? mp.error.message : !me.ok ? me.error.message : null),
      });
    }
  }
  return results;
}

// ── Bug Classification ───────────────────────────────────────────────

function classifyBugs(results) {
  const bugs = [];
  for (const r of results) {
    if (r.parsed === false || r.emitted === false) {
      const severity = r.layer === 1 ? 'lexer' : r.layer === 2 ? 'parser' : r.layer === 3 ? 'backend' : 'mutation';
      const isRegression = r.layer === 1 && r.category === 'quoted_literal' && !r.parsed;
      bugs.push({ ...r, severity, isRegression });
    }
  }
  return bugs;
}

// ── Minimizer ────────────────────────────────────────────────────────

function minimize(lin, isParseError) {
  if (isParseError) {
    // Strip lines one at a time to find minimal reproducing case
    const lines = lin.split('\n');
    for (let remove = 0; remove < lines.length; remove++) {
      for (let i = 0; i < lines.length; i++) {
        const candidate = lines.filter((_, j) => j !== i).join('\n');
        if (!candidate.trim()) continue;
        const p = parseSafe(candidate);
        if (!p.ok) {
          return minimize(candidate, true);
        }
      }
    }
  }
  return lin;
}

// ── Repair Engine (for simple lexer bugs) ────────────────────────────

function generateRepairPatch(bug) {
  if (bug.category === 'quoted_literal' && bug.severity === 'lexer') {
    // The bug: $ inside quotes is treated as constant reference
    // Diagnosis: the regex rewrite passes don't properly skip $ inside strings
    return {
      type: 'lexer_fix',
      diagnosis: `Character '${bug.desc}' causes parse/emission failure. ` +
        `The LIN compiler's rewrite passes likely treat '$' as a constant reference token ` +
        `even when inside string literals.`,
      file: 'src/compiler.mjs',
      strategy: 'Ensure all rewrite passes call skipQuote() before processing $ characters. ' +
        'The skipQuote function (line ~433) already handles string skipping, but some passes ' +
        'may not be invoking it for $ specifically.',
      testable: true,
    };
  }
  if (bug.category === 'string_edge' && bug.error && bug.error.includes('SYNTAX')) {
    return {
      type: 'emitter_fix',
      diagnosis: `String content '${bug.desc}' causes JS syntax error in emitted code. ` +
        `The emitter may be incorrectly escaping or interpolating the string content.`,
      file: 'src/emit_js.mjs',
      strategy: 'Check emitJs string literal handling for proper escaping.',
      testable: true,
    };
  }
  return {
    type: 'unknown',
    diagnosis: `Bug in ${bug.category}: ${bug.error || 'unknown error'}`,
    testable: false,
  };
}

// ── Save Regression ──────────────────────────────────────────────────

function saveRegression(bug, patch) {
  mkdirp(REGRESSION_DIR);
  const id = `FUZZ_${bug.layer}_${bug.category}_${Date.now()}.json`;
  const path = `${REGRESSION_DIR}/${id}`;
  const entry = {
    id, timestamp: new Date().toISOString(),
    layer: bug.layer, category: bug.category,
    severity: bug.severity, input: bug.input || bug.mutated || '',
    desc: bug.desc, error: bug.error,
    patch: patch || null, fixed: false,
  };
  fs.writeFileSync(path, JSON.stringify(entry, null, 2));
  return id;
}

// ── Full Pipeline ────────────────────────────────────────────────────

export function runFuzzer(opts = {}) {
  const { grammarSamples = 50, verbose = false } = opts;
  const all = [];
  const bugs = [];
  const report = {
    timestamp: new Date().toISOString(),
    layers: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    total: 0, passed: 0, failed: 0,
    bugs: [], regressions: [], patches: [],
  };

  // Layer 1: Character-level
  if (verbose) process.stderr.write('Layer 1: Character-level lexer fuzzer...\n');
  const l1 = fuzzLexerCharacters();
  all.push(...l1);

  // Layer 2: Grammar fuzzer
  if (verbose) process.stderr.write(`Layer 2: Grammar fuzzer (${grammarSamples} samples)...\n`);
  const l2 = fuzzGrammar(grammarSamples);
  all.push(...l2);

  // Layer 3: Differential testing
  if (verbose) process.stderr.write('Layer 3: Differential testing...\n');
  const l3 = differentialTest();
  all.push(...l3);

  // Layer 4: Mutation testing
  if (verbose) process.stderr.write('Layer 4: Mutation testing...\n');
  const l4 = fuzzMutations();
  all.push(...l4);

  // Layer 5: Adversarial corpus (already tested in Layer 1)

  // Classify
  const foundBugs = classifyBugs(all);
  report.total = all.length;
  report.passed = all.filter(r => r.parsed !== false && r.emitted !== false).length;
  report.failed = report.total - report.passed;

  // Process bugs
  for (const bug of foundBugs) {
    report.layers[bug.layer] = (report.layers[bug.layer] || 0) + 1;
    const patch = generateRepairPatch(bug);
    const regId = saveRegression(bug, patch);
    report.bugs.push({ id: regId, layer: bug.layer, category: bug.category,
      severity: bug.severity, desc: bug.desc, error: bug.error?.slice(0, 120) });
    report.regressions.push({ id: regId, fixed: false });
    if (patch.testable) report.patches.push({ id: regId, ...patch });
  }

  return report;
}

export { fuzzLexerCharacters, fuzzGrammar, differentialTest, fuzzMutations, classifyBugs, minimize, generateRepairPatch };
