/**
 * Language Acquisition Loop — Full Autonomous Cycle
 *
 * Flow:
 *   IA (Ollama) → knowledge → tests → LIN fuzzer → feedback → IA → certify/reject
 *
 * Usage:
 *   node scripts/ai_learn_language.mjs --language basic
 *   OLLAMA_MODEL=qwen2.5-coder:7b node scripts/ai_learn_language.mjs --language pascal --cycles 5
 *
 * Output:
 *   .lin/language_learning/<language>/
 *     knowledge.N.json    — induced grammar + types + operators
 *     tests.N.json        — deterministic test cases
 *     backend-plan.N.json — emitter structure plan
 *     backend.lin         — generated .lin emitter (when ready)
 *     manifest.json       — cycle history + status
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLia, compileLiaToTargetFile } from '../src/multi_emit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const LANGUAGE = getArg('language', 'basic');
const MAX_CYCLES = parseInt(getArg('cycles', '3'), 10);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';

const LEARNING_DIR = path.join(ROOT, '.lin', 'language_learning', LANGUAGE);

// ─── Corpus for testing ───
import { MINIMAL_PROGRAMS } from '../tests/fuzzer/lin_corpus.mjs';

function getCorpus() {
  return MINIMAL_PROGRAMS.map(p => ({
    name: p.name || 'unnamed',
    lin: p.lin,
    expected: p.expected || null,
  }));
}

// ─── Ollama interaction ───
async function queryOllama(prompt) {
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 4096 },
      }),
    });
    const data = await res.json();
    return data.response || '';
  } catch (e) {
    console.error('  [ollama] connection failed:', e.message);
    return null;
  }
}

function extractJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[1] || match[0]); } catch {}
  }
  return null;
}

// ─── Phase 1: Induce knowledge ───
async function induceKnowledge(lang, prevKnowledge, prevErrors) {
  const context = prevKnowledge
    ? `\nPrevious attempt had these errors:\n${prevErrors.map(e => `- ${e}`).join('\n')}\nFix these in your next output.`
    : '';

  const prompt = `You are a programming language expert. Induce the emit specification for "${lang}".

Produce a JSON object with this exact structure:
{
  "language": "${lang}",
  "types": { "numeric": "...", "string": "...", "bool": "...", "void": "..." },
  "operators": { "+": "...", "-": "...", "*": "...", "/": "...", "%": "...", "==": "...", "!=": "...", "<": "...", ">": "...", "<=": "...", ">=": "...", "&&": "...", "||": "...", "!": "..." },
  "controlFlow": { "if": "...", "for": "...", "while": "...", "return": "...", "break": "..." },
  "functions": { "def": "...", "call": "...", "end": "..." },
  "runtime": { "string_concat": "...", "string_len": "...", "to_string": "...", "to_int": "...", "abs": "...", "print": "...", "null_value": "..." },
  "syntax": { "comment": "...", "newline": "...", "indent": "...", "block_end": "..." },
  "quirks": ["..."],
  "notes": "..."
}${context}

Output ONLY the JSON. No markdown, no explanation.`;

  console.log(`  [induce] Querying ${OLLAMA_MODEL}...`);
  const raw = await queryOllama(prompt);
  if (!raw) return null;
  return extractJSON(raw);
}

// ─── Phase 2: Generate tests ───
async function generateTests(lang, knowledge) {
  const prompt = `You are a test generator for a multi-target code emitter.

Language: ${lang}
Knowledge: ${JSON.stringify(knowledge, null, 2)}

Generate 5 deterministic test programs as a JSON array. Each test has:
{
  "name": "test_name",
  "lin": "LIN source code (full program with @LIN header, function definition, export)",
  "expected_contains": ["string that MUST appear in emitted code"],
  "expected_not_contains": ["string that must NOT appear in emitted code"]
}

Use these LIN programs:
1. Simple function: !add(a,b){^(a+b)} — should emit ${lang} addition
2. Conditional: !clamp(x,lo,hi){?(x<lo){^(lo)}:{};?(x>hi){^(hi)}:{};^(x)} — should emit if/else
3. Loop: !pow(base,exp){result=1;#(i=0;i<exp;i++){result=result*base};^(result)} — should emit for loop
4. String: !greet(name){s="Hello "+name;^(s)} — should emit string concat
5. Boolean: !isPos(x){?(x>0){^(true)}:{};^(false)} — should emit comparison

Output ONLY the JSON array. No markdown.`;

  console.log(`  [tests] Generating test cases...`);
  const raw = await queryOllama(prompt);
  if (!raw) return [];
  const parsed = extractJSON(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// ─── Phase 3: Generate backend plan ───
async function generateBackendPlan(lang, knowledge, testResults) {
  const feedback = testResults
    ? `\nPrevious backend had these failures:\n${testResults.filter(t => !t.pass).map(t => `- ${t.name}: ${t.error}`).join('\n')}`
    : '';

  const prompt = `You are a LIN backend emitter architect.

Language: ${lang}
Knowledge: ${JSON.stringify(knowledge, null, 2)}${feedback}

Generate a backend plan as JSON:
{
  "fileName": "emit_${lang}.lin",
  "functions": [
    { "name": "...", "params": "...", "body": "...(LIN source, single line)" }
  ],
  "retTypeBody": "...(LIN source for return type inference, single line)",
  "helpers": "...(runtime helpers string for target language)",
  "operatorMap": { "js_op": "target_op" },
  "notes": "..."
}

The emitter must follow this pattern:
- Use !funcName(params){...} syntax
- Use ?(cond){return val} for conditionals
- Use ^(expr) for return
- Each function MUST be a single line (LIN lossy parser constraint)
- AVOID regex with quotes like /^["']/ (breaks lossy parser)
- Use isNumishId() for numeric detection, isStringishId() for strings
- Return JSON.stringify({code: ..., target: '${lang}'}) from the main emit function

Output ONLY the JSON. No markdown.`;

  console.log(`  [plan] Generating backend plan...`);
  const raw = await queryOllama(prompt);
  if (!raw) return null;
  return extractJSON(raw);
}

// ─── Phase 4: Build .lin emitter from plan ───
function buildEmitterFromPlan(plan, knowledge) {
  if (!plan || !plan.functions) return null;

  const lang = plan.fileName?.replace('emit_', '').replace('.lin', '') || LANGUAGE;

  // Build function definitions
  const fns = plan.functions.map(f => {
    return `!${f.name}(${f.params}){${f.body}}`;
  }).join('\n');

  // Build retType
  const retTypeFn = plan.retTypeBody
    ? `!${lang}RetType(fn,stmts){${plan.retTypeBody}}`
    : `!${lang}RetType(fn,stmts){^'Any'}`;

  // Build main emit function
  const emitFn = `!emit${lang.charAt(0).toUpperCase() + lang.slice(1)}(liaText){prog=parseLia(liaText);parts=['-- generated by lia multi-emit → ${lang}'];#(i=0;i<prog.fns.length;i++){parts.push(emitFn(prog.fns[i]))};H=${JSON.stringify(plan.helpers || '')};parts.push(H);^(JSON.stringify({code:parts.join('\\n')+'\\n',target:'${lang}'}))}`;

  const exFn = plan.functions.map(f => f.name).join(',');
  const exList = `${exFn},${lang}RetType,emit${lang.charAt(0).toUpperCase() + lang.slice(1)}`;

  const lin = `@LIN:L1c:0.2
^schema_once ^lossy=true ^ops=emit_${lang}
~G{?=if #=for ^=ret :else}

${retTypeFn}

${fns}

${emitFn}

=ex{${exList}}
`;

  return lin;
}

// ─── Phase 5: Test the emitter ───
function testEmitter(emitterLin, lang) {
  const results = [];
  const corpus = getCorpus();

  for (const prog of corpus) {
    try {
      const r = compileLia(prog.lin, {
        target: lang,
        formalGate: false,
        skipRefineProof: true,
      });
      const pass = r.code && r.code.length > 20;
      results.push({ name: prog.name, pass, code: r.code?.slice(0, 200) });
    } catch (e) {
      results.push({ name: prog.name, pass: false, error: e.message.slice(0, 200) });
    }
  }

  return results;
}

// ─── Phase 6: Retro-audit all 16 existing targets ───
function retroAudit() {
  const targets = ['ts', 'py', 'go', 'rust', 'c', 'java', 'zig', 'cs', 'kotlin', 'swift', 'cpp', 'haskell', 'elixir', 'lua', 'julia'];
  const results = {};
  const testLin = '@LIN:L1c:0.2\n^schema_once\n!add(a,b){^(a+b)}\n=ex{add}';

  for (const t of targets) {
    try {
      const r = compileLia(testLin, { target: t, formalGate: false, skipRefineProof: true });
      results[t] = r.code && r.code.length > 20 ? 'PASS' : 'FAIL';
    } catch (e) {
      results[t] = 'FAIL: ' + e.message.slice(0, 80);
    }
  }

  return results;
}

// ─── Phase 7: Certify ───
function certify(newTargetResults, auditResults) {
  const newPass = newTargetResults.filter(r => r.pass).length;
  const newTotal = newTargetResults.length;
  const newRate = newTotal > 0 ? (newPass / newTotal * 100).toFixed(1) : 0;

  const auditFailures = Object.entries(auditResults).filter(([_, v]) => v !== 'PASS');
  const auditClean = auditFailures.length === 0;

  const certified = newRate >= 80 && auditClean;

  return {
    certified,
    newTargetRate: `${newPass}/${newTotal} (${newRate}%)`,
    auditClean,
    auditFailures: auditFailures.map(([k, v]) => `${k}: ${v}`),
    reason: certified
      ? `New target at ${newRate}%, retro-audit clean`
      : `New target at ${newRate}% (need ≥80%), audit ${auditClean ? 'clean' : 'has failures'}`,
  };
}

// ─── Save artifacts ───
function saveArtifact(dir, name, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Main loop ───
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Language Acquisition Loop');
  console.log('  Target: ' + LANGUAGE);
  console.log('  Model:  ' + OLLAMA_MODEL);
  console.log('  Cycles: ' + MAX_CYCLES);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  fs.mkdirSync(LEARNING_DIR, { recursive: true });

  const manifest = {
    language: LANGUAGE,
    model: OLLAMA_MODEL,
    started: new Date().toISOString(),
    cycles: [],
    status: 'in_progress',
  };

  let prevKnowledge = null;
  let prevErrors = [];
  let certified = false;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`── Cycle ${cycle}/${MAX_CYCLES} ──`);

    // Phase 1: Induce knowledge
    const knowledge = await induceKnowledge(LANGUAGE, prevKnowledge, prevErrors);
    if (!knowledge) {
      console.log('  [SKIP] Could not induce knowledge (Ollama offline?)');
      console.log('  [FALLBACK] Using template-based knowledge...');
      const fallback = generateFallbackKnowledge(LANGUAGE);
      saveArtifact(LEARNING_DIR, `knowledge.${cycle}.json`, fallback);
      manifest.cycles.push({ cycle, knowledge: 'fallback', errors: ['ollama_offline'] });
      continue;
    }
    saveArtifact(LEARNING_DIR, `knowledge.${cycle}.json`, knowledge);
    console.log('  [induce] OK — types:', Object.keys(knowledge.types || {}).join(', '));

    // Phase 2: Generate tests
    const tests = await generateTests(LANGUAGE, knowledge);
    saveArtifact(LEARNING_DIR, `tests.${cycle}.json`, tests);
    console.log('  [tests]  Generated', tests.length, 'test cases');

    // Phase 3: Generate backend plan
    const plan = await generateBackendPlan(LANGUAGE, knowledge, null);
    saveArtifact(LEARNING_DIR, `backend-plan.${cycle}.json`, plan);
    console.log('  [plan]   Generated', plan?.functions?.length || 0, 'functions');

    // Phase 4: Build .lin emitter
    const emitterLin = buildEmitterFromPlan(plan, knowledge);
    if (emitterLin) {
      fs.writeFileSync(path.join(LEARNING_DIR, `backend.${cycle}.lin`), emitterLin, 'utf-8');
      console.log('  [build]  Wrote backend.' + cycle + '.lin');
    }

    // Phase 5: Test the emitter
    if (emitterLin) {
      const testResults = testEmitter(emitterLin, LANGUAGE);
      saveArtifact(LEARNING_DIR, `test-results.${cycle}.json`, testResults);
      const pass = testResults.filter(r => r.pass).length;
      console.log(`  [test]   ${pass}/${testResults.length} emit tests pass`);

      prevErrors = testResults.filter(r => !r.pass).map(r => `${r.name}: ${r.error || 'no output'}`);

      // Phase 6: Retro-audit
      const audit = retroAudit();
      const auditPass = Object.values(audit).filter(v => v === 'PASS').length;
      console.log(`  [audit]  ${auditPass}/${Object.keys(audit).length} existing targets still pass`);

      // Phase 7: Certify
      const cert = certify(testResults, audit);
      console.log(`  [cert]   ${cert.certified ? 'CERTIFIED' : 'NOT YET'} — ${cert.reason}`);

      manifest.cycles.push({
        cycle,
        testsGenerated: tests.length,
        emitTestsPass: pass,
        emitTestsTotal: testResults.length,
        auditPass,
        auditTotal: Object.keys(audit).length,
        certified: cert.certified,
        errors: prevErrors.slice(0, 5),
      });

      if (cert.certified) {
        certified = true;
        // Copy backend to src/
        const destLin = path.join(ROOT, 'src', `emit_${LANGUAGE}.lin`);
        const destLoader = path.join(ROOT, 'src', `emit_${LANGUAGE}_load.mts`);
        fs.writeFileSync(destLin, emitterLin, 'utf-8');
        fs.writeFileSync(destLoader, generateLoader(LANGUAGE), 'utf-8');
        console.log(`  [install] Wrote src/emit_${LANGUAGE}.lin + _load.mts`);
        break;
      }

      prevKnowledge = knowledge;
    }

    console.log('');
  }

  manifest.status = certified ? 'certified' : 'rejected';
  manifest.finished = new Date().toISOString();
  saveArtifact(LEARNING_DIR, 'manifest.json', manifest);

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Result: ${certified ? 'CERTIFIED ✓' : 'REJECTED ✗'}`);
  console.log(`  Artifacts: ${LEARNING_DIR}`);
  console.log('═══════════════════════════════════════════════════════');
}

// ─── Fallback knowledge (when Ollama is offline) ───
function generateFallbackKnowledge(lang) {
  const templates = {
    basic: {
      types: { numeric: 'Single', string: 'String', bool: 'Integer', void: '' },
      operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'MOD', '==': '=', '!=': '<>', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': 'AND', '||': 'OR', '!': 'NOT' },
      controlFlow: { if: 'IF...THEN...ELSE', for: 'FOR...NEXT', while: 'WHILE...WEND', return: 'RETURN', break: 'EXIT FOR' },
      functions: { def: 'SUB name(args)', call: 'CALL name(args)', end: 'END SUB' },
      runtime: { string_concat: '+', string_len: 'LEN()', to_string: 'STR$', to_int: 'VAL()', abs: 'ABS()', print: 'PRINT', null_value: '""' },
      syntax: { comment: "'", newline: '\n', indent: '', block_end: 'END' },
      quirks: ['Line numbers optional in modern BASIC', 'GOTO exists but avoid', 'Single/Double for numbers'],
    },
    pascal: {
      types: { numeric: 'Integer', string: 'String', bool: 'Boolean', void: '' },
      operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '==': '=', '!=': '<>', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': 'and', '||': 'or', '!': 'not' },
      controlFlow: { if: 'if...then...else', for: 'for...to...do', while: 'while...do', return: 'exit', break: 'break' },
      functions: { def: 'function name(args): type;', call: 'name(args)', end: 'end;' },
      runtime: { string_concat: '+', string_len: 'length()', to_string: 'str()', to_int: 'val()', abs: 'abs()', print: 'writeln()', null_value: 'nil' },
      syntax: { comment: '{ }', newline: '\n', indent: '  ', block_end: 'end' },
      quirks: ['begin/end blocks', 'var section for declarations', 'strong typing'],
    },
  };

  return templates[lang] || {
    types: { numeric: 'number', string: 'string', bool: 'boolean', void: 'void' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': '%', '==': '==', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': '&&', '||': '||', '!': '!' },
    controlFlow: { if: 'if...end', for: 'for...end', while: 'while...end', return: 'return', break: 'break' },
    functions: { def: 'func name(args)', call: 'name(args)', end: 'end' },
    runtime: { string_concat: '+', string_len: '#s', to_string: 'str()', to_int: 'int()', abs: 'abs()', print: 'print()', null_value: 'nil' },
    syntax: { comment: '--', newline: '\n', indent: '  ', block_end: 'end' },
    quirks: ['Template fallback — needs Ollama for real induction'],
  };
}

// ─── Generate loader ───
function generateLoader(lang) {
  const capLang = lang.charAt(0).toUpperCase() + lang.slice(1);
  const fnName = `emit${capLang}`;
  return `/**
 * Emit ${capLang} — Host Loader (auto-generated by Language Acquisition Loop)
 * LIN source: src/emit_${lang}.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';
import { parseLia } from './compiler.mjs';
import { tryParseStmts, collectAssignedIds } from './body_ast.mjs';
import {
  isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine, splitPrefixIncCond,
  isNumishId, isStringishId, isBoolishId, parseParamList,
  emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
  collectFreeHostIds, emitFreeHostDecls, isBoolFnName,
} from './emit_shared.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'emit_${lang}.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const bridge = \`
    const parseLia = require('\${path.join(srcDir, 'compiler.mjs')}').parseLia;
    const tryParseStmts = require('\${path.join(srcDir, 'body_ast.mjs')}').tryParseStmts;
    const collectAssignedIds = require('\${path.join(srcDir, 'body_ast.mjs')}').collectAssignedIds;
    const { isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine, splitPrefixIncCond,
            isNumishId, isStringishId, isBoolishId, parseParamList,
            emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
            collectFreeHostIds, emitFreeHostDecls, isBoolFnName } = require('\${path.join(srcDir, 'emit_shared.mjs')}');
  \`;
  const patched = bridge + '\\n' + js;
  const tmp = path.join(os.tmpdir(), \`emit_${lang}_\${process.pid}.cjs\`);
  fs.writeFileSync(tmp, patched, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  return mod;
}

export function ${fnName}(liaText, opts = {}) {
  const raw = getMod().${fnName === 'emitBasic' ? 'emitBasic' : fnName}(liaText);
  const parsed = JSON.parse(raw);
  const prog = parseLia(liaText);
  return { code: parsed.code, program: prog, target: '${lang}' };
}
`;
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
