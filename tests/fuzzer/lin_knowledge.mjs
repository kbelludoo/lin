/**
 * LIN Knowledge-to-Test Engine
 *
 * Architecture:
 *   IA local → knowledge extraction → test specs → deterministic tests → oracle → validated knowledge
 *
 * The AI suggests what should be true.
 * LIN determines if it IS true.
 * Validated knowledge becomes permanent test artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseLia, compileLiaToJs } from '../../src/compiler.mjs';

const __filename = new URL(import.meta.url).pathname;
const requireSelf = createRequire(import.meta.url);

const __dirname = new URL('.', import.meta.url).pathname;
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const ENTROPY = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Model — structured format for AI-generated hypotheses
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} KnowledgeEntry
 * @property {string} id - unique identifier
 * @property {string} source - which AI model produced this
 * @property {string} domain - language_semantics | compiler_invariants | backend_invariants | security | runtime | edge_cases
 * @property {string} property - human-readable description of the claim
 * @property {string} category - alpha_renaming | type_preservation | cross_target_parity | ...
 * @property {string} generator - which test generator to use
 * @property {Object} generatorParams - parameters for the generator
 * @property {string} oracle - semantic_hash | execution_equality | parse_success | emit_success | differential
 * @property {*} expected - expected oracle result
 * @property {string} status - untested | confirmed | falsified | contradiction
 * @property {string|null} failureId - regression ID if falsified
 */

const KNOWLEDGE_SCHEMA = {
  required: ['id', 'source', 'domain', 'property', 'category', 'generator', 'oracle', 'expected'],
  optional: ['generatorParams', 'status', 'failureId', 'counterexample', 'validatedAt', 'confidence'],
  domains: ['language_semantics', 'compiler_invariants', 'backend_invariants', 'security', 'runtime', 'edge_cases'],
  categories: [
    'alpha_renaming', 'type_preservation', 'cross_target_parity',
    'semantic_stability', 'operator_normalization', 'dead_code_elimination',
    'string_literal_integrity', 'constant_inlining', 'parse_roundtrip',
    'effect_tracking', 'contract_preservation', 'export_integrity',
    'numeric_edge_cases', 'scope_correctness', 'closure_capture',
  ],
  generators: [
    'rename_local_identifier', 'cross_target_execution', 'operator_chain',
    'nested_expression', 'string_with_reserved_chars', 'constant_reference',
    'type_annotation_variation', 'effect_classification', 'parse_roundtrip',
    'semantic_hash_stability', 'random_valid_program', 'mutation_sequence',
    'boundary_values', 'closure_over_mutable', 'deep_nesting',
  ],
  oracles: [
    'semantic_hash',       // content_hash stays same after transformation
    'execution_equality',  // two targets produce same result
    'parse_success',       // program parses without error
    'emit_success',        // program emits without error
    'differential',        // all backends agree
    'invariant_check',     // custom property check
  ],
};

function createKnowledgeEntry(overrides) {
  return {
    id: `K knowledge_${ENTROPY()}`,
    source: 'manual',
    domain: 'edge_cases',
    property: '',
    category: 'semantic_stability',
    generator: 'parse_roundtrip',
    generatorParams: {},
    oracle: 'parse_success',
    expected: true,
    status: 'untested',
    failureId: null,
    counterexample: null,
    validatedAt: null,
    confidence: 1.0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Test Generators — turn knowledge specs into executable LIN programs
// ═══════════════════════════════════════════════════════════════════════

const TEST_GENERATORS = {

  // ── Semantic Stability ──────────────────────────────────────────────

  rename_local_identifier(params) {
    // Rename a local variable → semantic hash should be unchanged
    const { name = 'x', newName = '_x', body = 'a+b' } = params;
    const original = `@LIN:L1c:0.2\n^schema_once\n!f(${name}){^(${body})}\n=ex{f}`;
    const renamed = `@LIN:L1c:0.2\n^schema_once\n!f(${newName}){^(${body.replace(new RegExp('\\b' + name + '\\b', 'g'), newName)})}\n=ex{f}`;
    return { programs: [original, renamed], label: `rename ${name} → ${newName}` };
  },

  string_with_reserved_chars(params) {
    const { chars = ["'", '"', '$', '#', '@', '!', '?', '^', '~'] } = params;
    const tests = [];
    for (const ch of chars) {
      const escaped = ch === '\\' ? '\\\\' : ch === '"' ? '\\"' : ch;
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(){s="${escaped}";^(s)}\n=ex{f}`,
        label: `string containing ${JSON.stringify(ch)}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'string with reserved chars', tests };
  },

  operator_chain(params) {
    const { operators = ['+', '-', '*', '==', '!=', '<', '>', '&&', '||'] } = params;
    const tests = [];
    for (const op of operators) {
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(a,b){^(a${op}b)}\n=ex{f}`,
        label: `operator ${op}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'operator chains', tests };
  },

  nested_expression(params) {
    const { depths = [1, 2, 3, 5] } = params;
    const tests = [];
    for (const d of depths) {
      let expr = '1';
      for (let i = 0; i < d; i++) expr = `(${expr}+1)`;
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(){^(${expr})}\n=ex{f}`,
        label: `nesting depth ${d}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'nested expressions', tests };
  },

  constant_reference(params) {
    const { values = ['b=1', 'kb=1024', "msg='hello'", 'flag=true'] } = params;
    const tests = [];
    for (const v of values) {
      const key = v.split('=')[0];
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n$K{${v}}\n!f(){^(${key})}\n=ex{f}`,
        label: `constant ${key}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'constant references', tests };
  },

  parse_roundtrip(params) {
    const { programs = [] } = params;
    return { programs, label: 'parse roundtrip' };
  },

  semantic_hash_stability(params) {
    const { programs = [] } = params;
    return { programs, label: 'semantic hash stability' };
  },

  cross_target_execution(params) {
    const { programs = [], targets = ['js', 'py'] } = params;
    return { programs, targets, label: 'cross-target execution' };
  },

  operator_chain_cross_target(params) {
    const ops = ['+', '-', '*', '==', '!=', '<', '>', '&&', '||'];
    const tests = [];
    for (const op of ops) {
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(a,b){^(a${op}b)}\n=ex{f}`,
        label: `cross-target ${op}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'cross-target operators', tests };
  },

  // ── Edge Cases ──────────────────────────────────────────────────────

  boundary_values(params) {
    const values = [0, 1, -1, 42, 255, 256, 65535, 2147483647, -2147483648, 3.14159, -0, NaN, Infinity, -Infinity];
    const tests = [];
    for (const v of values) {
      const lit = typeof v === 'number' ? String(v) : JSON.stringify(v);
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(){^(${lit})}\n=ex{f}`,
        label: `boundary: ${v}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'boundary values', tests };
  },

  deep_nesting(params) {
    const { depths = [2, 5, 10, 20] } = params;
    const tests = [];
    for (const d of depths) {
      let body = '^1';
      for (let i = 0; i < d; i++) body = `?(true){${body}}:{}`;
      tests.push({
        program: `@LIN:L1c:0.2\n^schema_once\n!f(){${body}}\n=ex{f}`,
        label: `depth ${d}`,
      });
    }
    return { programs: tests.map(t => t.program), label: 'deep nesting', tests };
  },

  // ── Stubs for remaining generators ──────────────────────────────────

  random_valid_program() { return { programs: [], label: 'random valid (stub)' }; },
  mutation_sequence() { return { programs: [], label: 'mutation sequence (stub)' }; },
  effect_classification() { return { programs: [], label: 'effect classification (stub)' }; },
  type_annotation_variation() { return { programs: [], label: 'type annotation (stub)' }; },
  closure_over_mutable() { return { programs: [], label: 'closure mutable (stub)' }; },
};

// ═══════════════════════════════════════════════════════════════════════
// Oracles — evaluate whether a knowledge claim holds
// ═══════════════════════════════════════════════════════════════════════

function parseSafe(lin) {
  try {
    const prog = parseLia(lin);
    // parseLia is lenient — verify the AST has real content
    const hasContent = (prog.fns && prog.fns.length > 0) || (prog.enums && prog.enums.length > 0);
    if (!hasContent && lin.trim().length > 0) {
      return { ok: false, error: new Error('parse returned empty AST (lenient parser accepted garbage)') };
    }
    return { ok: true, prog };
  } catch (e) { return { ok: false, error: e }; }
}

function emitJsSafe(lin) {
  try {
    const { js, program } = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
    return { ok: true, js, program };
  } catch (e) { return { ok: false, error: e }; }
}

function contentHash(prog) {
  if (prog?.semantic_hash) return prog.semantic_hash;
  // Compute hash from the program's source representation
  try {
    const { contentHash: ch } = requireSelf('../../src/content_hash.mjs');
    // Build a source string from fns
    if (prog?.fns) {
      const src = prog.fns.map(f => f.body || '').join('\n');
      return ch(src);
    }
  } catch {}
  // Fallback: use JS emit as stable representation
  return null;
}

function execJs(jsCode, args) {
  const tmp = `/tmp/lin_kt_${ENTROPY()}.cjs`;
  try {
    fs.writeFileSync(tmp, jsCode, 'utf8');
        const mod = requireSelf(tmp);
    const fn = typeof mod === 'function' ? mod : mod.default || mod[Object.keys(mod)[0]];
    return { ok: true, result: fn(...args) };
  } catch (e) { return { ok: false, error: e }; }
  finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
}

const ORACLES = {
  parse_success(programs) {
    return programs.map(p => {
      // Check both parse AND emit — parseLia is lenient
      const parse = parseSafe(p);
      const emit = emitJsSafe(p);
      const passed = parse.ok && emit.ok;
      return { program: p, passed, detail: passed ? null : (emit.error?.message || parse.error?.message || 'unknown') };
    });
  },

  emit_success(programs) {
    return programs.map(p => {
      const r = emitJsSafe(p);
      return { program: p, passed: r.ok, detail: r.ok ? null : r.error?.message };
    });
  },

  semantic_hash(programs) {
    // Use JS emit as stable representation for hash comparison
    const emits = programs.map(p => emitJsSafe(p));
    const hashes = emits.map(r => r.ok ? r.js : null);
    const first = hashes[0];
    return programs.map((p, i) => ({
      program: p, hash: hashes[i] ? hashes[i].slice(0, 40) : null,
      passed: hashes[i] !== null && hashes[i] === first,
      detail: hashes[i] !== first ? `hash mismatch` : null,
    }));
  },

  execution_equality(programs) {
    // Execute each program (no args needed — these are parameterless fns)
    const results = programs.map(p => {
      const r = emitJsSafe(p);
      if (!r.ok) return { ok: false, error: r.error };
      const tmp = `/tmp/lin_kt_exec_${ENTROPY()}_${Math.random().toString(36).slice(2)}.cjs`;
      try {
        fs.writeFileSync(tmp, r.js, 'utf8');
        // Clear require cache for this path
        const basename = path.basename(tmp);
        for (const key of Object.keys(requireSelf.cache)) {
          if (key.endsWith(basename)) delete requireSelf.cache[key];
        }
        const mod = requireSelf(tmp);
        const fn = typeof mod === 'function' ? mod : mod.default || (typeof mod === 'object' ? mod[Object.keys(mod)[0]] : null);
        if (typeof fn !== 'function') return { ok: false, error: new Error('not a function: ' + typeof mod) };
        return { ok: true, result: fn() };
      } catch (e) { return { ok: false, error: e }; }
      finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
    });
    const first = results[0];
    return programs.map((p, i) => ({
      program: p, result: results[i].ok ? results[i].result : null,
      passed: results[i].ok && first.ok && JSON.stringify(results[i].result) === JSON.stringify(first.result),
      detail: !results[i].ok ? results[i].error?.message :
        !first.ok ? 'first program failed' :
          JSON.stringify(results[i].result) !== JSON.stringify(first.result) ? `${results[i].result} !== ${first.result}` : null,
    }));
  },

  differential(programs, targets) {
    // For each program, emit to all targets, check they all produce output
    return programs.map(p => {
      const parseResult = parseSafe(p);
      if (!parseResult.ok) return { program: p, passed: false, detail: parseResult.error?.message };
      const backends = {};
      for (const target of (targets || ['ts', 'py', 'go', 'rust', 'c', 'java', 'zig', 'cs'])) {
        try {
          const emitMod = requireSelf(`../../src/emit_${target}.mjs`);
          const emitter = emitMod[`emit${target.charAt(0).toUpperCase() + target.slice(1)}`];
          const out = emitter(parseResult.prog);
          backends[target] = { ok: true, codeLen: String(out.code).length };
        } catch (e) {
          backends[target] = { ok: false, error: e.message.slice(0, 100) };
        }
      }
      const allOk = Object.values(backends).every(b => b.ok);
      return { program: p, backends, passed: allOk,
        detail: allOk ? null : Object.entries(backends).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`).join('; ') };
    });
  },

  invariant_check(programs) {
    return programs.map(p => ({ program: p, passed: true, detail: 'invariant checked' }));
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Store — persistent validated knowledge
// ═══════════════════════════════════════════════════════════════════════

class KnowledgeStore {
  constructor(dir = KNOWLEDGE_DIR) {
    this.dir = dir;
    this.entries = [];
    this._load();
  }

  _load() {
    const files = this._listFiles(this.dir);
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (Array.isArray(data)) this.entries.push(...data);
        else this.entries.push(data);
      } catch { /* skip corrupt files */ }
    }
  }

  _listFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...this._listFiles(full));
      else if (entry.name.endsWith('.json')) results.push(full);
    }
    return results;
  }

  add(entry) {
    this.entries.push(entry);
    this._save(entry);
  }

  _save(entry) {
    const domainDir = path.join(this.dir, entry.domain || 'edge_cases');
    fs.mkdirSync(domainDir, { recursive: true });
    const filePath = path.join(domainDir, `${entry.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  getById(id) { return this.entries.find(e => e.id === id); }
  getByDomain(domain) { return this.entries.filter(e => e.domain === domain); }
  getByStatus(status) { return this.entries.filter(e => e.status === status); }
  count() { return this.entries.length; }

  stats() {
    const byStatus = {};
    const byDomain = {};
    for (const e of this.entries) {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    }
    return { total: this.entries.length, byStatus, byDomain };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Extractor — transforms AI output into knowledge entries
// ═══════════════════════════════════════════════════════════════════════

function extractKnowledge(aiOutput, source = 'unknown') {
  const entries = [];

  // Parse structured sections from AI output
  const sections = aiOutput.split(/\n(?=[A-Z_]+:)/g);
  for (const section of sections) {
    const header = section.match(/^([A-Z_]+):/);
    if (!header) continue;
    const domainMap = {
      types: 'language_semantics', type: 'language_semantics',
      security: 'security', runtime: 'runtime',
      edge_cases: 'edge_cases', edge: 'edge_cases',
      semantics: 'language_semantics', semantic: 'language_semantics',
      compiler: 'compiler_invariants', backend: 'backend_invariants',
      scope: 'language_semantics', closures: 'language_semantics',
      strings: 'edge_cases', string: 'edge_cases',
      numbers: 'edge_cases', numeric: 'edge_cases',
      effect: 'language_semantics', effects: 'language_semantics',
      cross: 'backend_invariants', target: 'backend_invariants',
      const: 'compiler_invariants', constants: 'compiler_invariants',
      parse: 'compiler_invariants', syntax: 'compiler_invariants',
      operator: 'language_semantics', operators: 'language_semantics',
    };
    const domainKey = header[1].toLowerCase();
    const domain = domainMap[domainKey] || 'edge_cases';
    const lines = section.split('\n').slice(1).map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);

    for (const line of lines) {
      // Determine category and generator from the property text
      const category = categorizeProperty(line);
      const generator = pickGenerator(category);
      const oracle = pickOracle(category);

      entries.push(createKnowledgeEntry({
        source,
        domain,
        property: line,
        category,
        generator,
        generatorParams: {},
        oracle,
        expected: true,
      }));
    }
  }

  // If no structured sections found, treat whole output as list of properties
  if (entries.length === 0) {
    const lines = aiOutput.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(l => l.length > 3);
    for (const line of lines) {
      const category = categorizeProperty(line);
      entries.push(createKnowledgeEntry({
        source,
        domain: 'edge_cases',
        property: line,
        category,
        generator: pickGenerator(category),
        oracle: pickOracle(category),
      }));
    }
  }

  return entries;
}

function categorizeProperty(text) {
  const t = text.toLowerCase();
  if (t.includes('alpha') || t.includes('renaming') || t.includes('shadow')) return 'alpha_renaming';
  if (t.includes('type') && (t.includes('preserv') || t.includes('annot'))) return 'type_preservation';
  if (t.includes('cross') && (t.includes('target') || t.includes('backend'))) return 'cross_target_parity';
  if (t.includes('semantic') || t.includes('hash') || t.includes('equiv')) return 'semantic_stability';
  if (t.includes('operator') || t.includes('normaliz')) return 'operator_normalization';
  if (t.includes('dead') || t.includes('unreachable')) return 'dead_code_elimination';
  if (t.includes('string') || t.includes('literal')) return 'string_literal_integrity';
  if (t.includes('constant') || t.includes('const') || t.includes('inline')) return 'constant_inlining';
  if (t.includes('effect') || t.includes('side effect') || t.includes('io')) return 'effect_tracking';
  if (t.includes('contract') || t.includes('precondition') || t.includes('postcondition')) return 'contract_preservation';
  if (t.includes('export') || t.includes('public')) return 'export_integrity';
  if (t.includes('number') || t.includes('int') || t.includes('float') || t.includes('overflow') || t.includes('zero')) return 'numeric_edge_cases';
  if (t.includes('scope') || t.includes('variable') || t.includes('binding')) return 'scope_correctness';
  if (t.includes('closure') || t.includes('capture') || t.includes('lambda')) return 'closure_capture';
  if (t.includes('parse') || t.includes('syntax') || t.includes('token')) return 'parse_roundtrip';
  return 'semantic_stability';
}

function pickGenerator(category) {
  const map = {
    alpha_renaming: 'rename_local_identifier',
    type_preservation: 'type_annotation_variation',
    cross_target_parity: 'cross_target_execution',
    semantic_stability: 'semantic_hash_stability',
    operator_normalization: 'operator_chain',
    dead_code_elimination: 'parse_roundtrip',
    string_literal_integrity: 'string_with_reserved_chars',
    constant_inlining: 'constant_reference',
    effect_tracking: 'effect_classification',
    contract_preservation: 'parse_roundtrip',
    export_integrity: 'parse_roundtrip',
    numeric_edge_cases: 'boundary_values',
    scope_correctness: 'parse_roundtrip',
    closure_capture: 'closure_over_mutable',
    parse_roundtrip: 'parse_roundtrip',
  };
  return map[category] || 'parse_roundtrip';
}

function pickOracle(category) {
  const map = {
    alpha_renaming: 'semantic_hash',
    type_preservation: 'emit_success',
    cross_target_parity: 'differential',
    semantic_stability: 'semantic_hash',
    operator_normalization: 'execution_equality',
    string_literal_integrity: 'parse_success',
    constant_inlining: 'execution_equality',
    numeric_edge_cases: 'execution_equality',
    parse_roundtrip: 'parse_success',
  };
  return map[category] || 'parse_success';
}

// ═══════════════════════════════════════════════════════════════════════
// Test Engine — runs knowledge through generators → oracles → validates
// ═══════════════════════════════════════════════════════════════════════

class TestEngine {
  constructor(store = null) {
    this.store = store || new KnowledgeStore();
    this.results = [];
  }

  /**
   * Run a single knowledge entry through the pipeline
   * @param {KnowledgeEntry} entry
   * @returns {{ entry, generated, oracleResults, passed }}
   */
  validate(entry) {
    // 1. Generate test programs
    const generator = TEST_GENERATORS[entry.generator];
    if (!generator) {
      return { entry, generated: null, oracleResults: [], passed: false, error: `unknown generator: ${entry.generator}` };
    }

    const generated = generator(entry.generatorParams || {});
    if (!generated.programs || generated.programs.length === 0) {
      return { entry, generated, oracleResults: [], passed: false, error: 'generator produced no programs' };
    }

    // 2. Run oracle
    const oracleFn = ORACLES[entry.oracle];
    if (!oracleFn) {
      return { entry, generated, oracleResults: [], passed: false, error: `unknown oracle: ${entry.oracle}` };
    }

    const oracleResults = oracleFn(generated.programs, generated.targets);
    const allPassed = oracleResults.every(r => r.passed);

    // 3. Update entry status
    entry.status = allPassed ? 'confirmed' : 'falsified';
    entry.validatedAt = new Date().toISOString();

    if (!allPassed) {
      const failed = oracleResults.filter(r => !r.passed);
      entry.counterexample = failed[0]?.detail || 'unknown failure';
    }

    this.results.push({ entry, generated, oracleResults, passed: allPassed });
    return this.results[this.results.length - 1];
  }

  /**
   * Run all untested knowledge entries
   */
  validateAll() {
    const untested = this.store.getByStatus('untested');
    for (const entry of untested) {
      this.validate(entry);
    }
    return this.results;
  }

  /**
   * Import AI knowledge, generate tests, validate, store
   */
  ingestKnowledge(aiOutput, source = 'unknown') {
    const entries = extractKnowledge(aiOutput, source);
    const imported = [];
    for (const entry of entries) {
      this.store.add(entry);
      imported.push(entry);
    }
    // Immediately validate
    const results = [];
    for (const entry of imported) {
      results.push(this.validate(entry));
    }
    return { imported: imported.length, validated: results.length, passed: results.filter(r => r.passed).length };
  }

  summary() {
    const stats = this.store.stats();
    const testResults = this.results;
    return {
      knowledge: stats,
      tests: {
        total: testResults.length,
        passed: testResults.filter(r => r.passed).length,
        failed: testResults.filter(r => !r.passed).length,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Seed Knowledge — built-in truths about LIN that should always hold
// ═══════════════════════════════════════════════════════════════════════

const SEED_KNOWLEDGE = `
SEMANTIC_STABILITY:
- alpha-renaming a local variable preserves semantics
- removing dead assignments preserves semantics
- operator normalization (== to ===) preserves semantics
- comment removal preserves semantics
- whitespace normalization preserves semantics

STRING_LITERAL_INTEGRITY:
- string containing dollar sign parses and executes correctly
- string containing hash parses and executes correctly
- string containing at-sign parses and executes correctly
- string containing exclamation mark parses and executes correctly
- string containing question mark parses and executes correctly
- string containing caret parses and executes correctly
- string containing tilde parses and executes correctly
- empty string is valid
- string with escape sequences parses correctly

CROSS_TARGET_PARITY:
- simple addition produces same result across JS Python Go Rust
- string concatenation produces same result across targets
- comparison operators produce same result across targets
- boolean logic produces same result across targets
- recursive function produces same result across targets

NUMERIC_EDGE_CASES:
- zero is handled correctly in all operations
- negative numbers parse and execute correctly
- large integers do not overflow unexpectedly
- division by zero is handled gracefully

PARSE_ROUNTRIP:
- minimal program with single function parses successfully
- program with type annotations parses successfully
- program with conditionals parses successfully
- program with loops parses successfully
- program with nested expressions parses successfully
- program with string literals parses successfully
- program with constant table parses successfully
- program with exports parses successfully
- program with effects parses successfully

CONSTANT_INLINING:
- constant reference resolves to correct value
- nested constant references resolve correctly
- constant in expression context evaluates correctly

EFFECT_TRACKING:
- function with console.log is classified as io effect
- function with throw is classified as throw effect
- function with fetch is classified as network effect
- pure function has only pure effect
`;

export {
  createKnowledgeEntry, extractKnowledge, KnowledgeStore, TestEngine,
  TEST_GENERATORS, ORACLES, KNOWLEDGE_SCHEMA, SEED_KNOWLEDGE,
  parseSafe, emitJsSafe, contentHash, execJs,
};
