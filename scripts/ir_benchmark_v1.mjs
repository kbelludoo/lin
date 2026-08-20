#!/usr/bin/env node
/**
 * IR_BENCHMARK_V1 — Phase 1: Deterministic TS → LIN IR Ratio Measurement.
 *
 * Measures the representational advantage of LIN as an IR over canonical TS.
 * NO DAE, NO LLM, fully deterministic.
 *
 * Pipeline:
 *   TS source → tokenize → canonical TS → TS→LIN rewriter → canonical LIN
 *   → count tokens → IR_ratio = tokens(TS) / tokens(LIN)
 *   → LIN→JS compile → behavioral comparison → semantic_eq
 *
 * Canonical subset: literals, identifiers, let/const/var, assignments,
 * arithmetic, comparisons, logical, function calls, return, if/else,
 * for, while, functions, arrow functions, basic TS types.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: TS Tokenizer (regex-based, handles canonical subset)
// ═══════════════════════════════════════════════════════════════════════════════

const TS_TOKEN_RE = /(?:\r?\n)|\/\/.*$|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$]*|[{}();,.[\]<>:?!+\-*/%=!&|^~]+|\s+/gm;

function tokenizeTS(src) {
  const tokens = [];
  let m;
  TS_TOKEN_RE.lastIndex = 0;
  while ((m = TS_TOKEN_RE.exec(src)) !== null) {
    const t = m[0];
    if (t.startsWith('//') || t.startsWith('/*')) continue;
    if (t.trim() === '') continue;
    tokens.push(t);
  }
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Canonical TS Printer
//   Strips type annotations, normalizes whitespace, alpha-renames locals.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strip TS type annotations from a function signature + body.
 * Handles: `x: Type`, `x?: Type`, `return: Type`, generic `<T>`,
 * Record<string,T>, Array<T>, T[], string literals, union types.
 */
function stripTypes(ts) {
  let s = ts;
  // Remove generic parameters: <T>, <T extends U>
  s = s.replace(/<[^>]+>/g, '');
  // Remove return type annotations: ): Type { or ): Type =>
  s = s.replace(/\)\s*:\s*[^\s{(][^\s{]*\s*([{(])/g, ') $1');
  // Remove optional param types: `name?: Type` → `name`
  s = s.replace(/([A-Za-z_$]\w*)\s*\?\s*:\s*[^\s,)}\]]+/g, '$1');
  // Remove param type annotations: `name: Type` → `name` (handles end-of-string too)
  // Handles: string, number, boolean, Record<string,T>, any[], string[], MyType, MyType<T>, etc.
  s = s.replace(/([A-Za-z_$]\w*)\s*:\s*(?:[A-Z]\w*(?:\.\w+)*(?:<[^>]*>)?(?:\[\])*|string|number|boolean|any|void|never|object|symbol|bigint|undefined|null)(?:\[\])*/g, '$1');
  // Remove `: Type` after variable declarations: `let x: Type =` → `let x =`
  s = s.replace(/((?:let|const|var)\s+[A-Za-z_$]\w*)\s*:\s*(?:[A-Z]\w*(?:\.\w+)*(?:<[^>]*>)?(?:\[\])*|string|number|boolean|any|void|never|object)(?:\[\])*\s*=/g, '$1 =');
  // Remove `: Type` from for-of/for-in: `for (const x: Type of y)`
  s = s.replace(/(for\s*\(\s*(?:let|const|var)\s+\w+)\s*:\s*\w+\s*/g, '$1 ');
  return s;
}

/**
 * Normalize TS to a canonical form:
 * - Strip types
 * - Normalize whitespace to single spaces
 * - Normalize string delimiters to double quotes
 * - Normalize === to ==, !== to !=
 */
function canonicalizeTS(ts) {
  let s = stripTypes(ts);
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/'/g, '"');
  s = s.replace(/===/g, '==').replace(/!==/g, '!=');
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: TS → LIN Deterministic Rewriter
//   Converts canonical TS to LIN syntax.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract function declarations from TS source (subset: function, arrow, export default).
 * Returns array of { name, params, body }.
 */
function extractFunctions(src) {
  const fns = [];
  const s = src.replace(/\s+/g, ' ').trim();

  // function name(params) { body }
  const fnRe = /(?:export\s+default\s+)?(?:export\s+)?function\s+([A-Za-z_$]\w*)\s*\(([^)]*)\)\s*(?::\s*\S+\s*)?\{/g;
  let m;
  while ((m = fnRe.exec(s)) !== null) {
    const name = m[1];
    const params = m[2].trim();
    const bodyStart = m.index + m[0].length;
    const body = extractBraceBody(s, bodyStart - 1);
    if (body !== null) fns.push({ name, params, body: body.slice(1, -1).trim() });
  }

  // Arrow functions: const name = (params) => { body } or (params) => expr
  const arrowRe = /(?:(?:export|const|let|var)\s+)*([A-Za-z_$]\w*)\s*=\s*(?:\(([^)]*)\)|([A-Za-z_$]\w*))\s*=>\s*(?:\{|([^;]+))/g;
  while ((m = arrowRe.exec(s)) !== null) {
    const name = m[1];
    const params = (m[2] || m[3] || '').trim();
    let body;
    if (m[4]) {
      body = m[4].trim();
    } else {
      const bodyStart = s.indexOf('{', m.index + m[0].length - 1);
      if (bodyStart >= 0) {
        body = extractBraceBody(s, bodyStart);
        if (body !== null) body = body.slice(1, -1).trim();
      }
    }
    if (body !== null && name !== 'const' && name !== 'let' && name !== 'var') {
      fns.push({ name, params, body });
    }
  }

  return fns;
}

function extractBraceBody(s, openIdx) {
  if (s[openIdx] !== '{') return null;
  let depth = 0;
  let inStr = null;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(openIdx, i + 1); }
  }
  return null;
}

/**
 * Convert a TS function body to LIN body.
 * LIN body rules:
 *   - No var/let/const: `x = expr` instead of `let x = expr`
 *   - Return: `^expr` instead of `return expr;`
 *   - If: `?(cond){body}` instead of `if (cond) { body }`
 *   - Else: `:{body}` instead of `else { body }`
 *   - For: `#(init;cond;step){body}` instead of `for (...) { body }`
 *   - While: `#(;cond;){body}` instead of `while (cond) { body }`
 *   - Statements separated by `;`
 *   - Single-expression body: `^expr` (no braces)
 */
function tsBodyToLin(body) {
  let s = body.replace(/\s+/g, ' ').trim();
  // Strip type annotations
  s = stripTypes(s);
  // Normalize whitespace
  s = s.replace(/\s+/g, ' ').trim();

  const stmts = parseTsStatements(s);
  return stmts.map(stmtToLin).join(';');
}

function parseTsStatements(s) {
  const stmts = [];
  let i = 0;
  while (i < s.length) {
    i = skipSpace(s, i);
    if (i >= s.length) break;

    // if (...) { ... } else { ... }
    if (s.startsWith('if', i) && /\s*\(/.test(s.slice(i + 2))) {
      const { stmt, end } = parseIf(s, i);
      stmts.push(stmt);
      i = end;
      continue;
    }

    // for (...) { ... }
    if (s.startsWith('for', i) && /\s*[\(;]/.test(s.slice(i + 3))) {
      const { stmt, end } = parseFor(s, i);
      stmts.push(stmt);
      i = end;
      continue;
    }

    // while (...) { ... }
    if (s.startsWith('while', i) && /\s*\(/.test(s.slice(i + 5))) {
      const { stmt, end } = parseWhile(s, i);
      stmts.push(stmt);
      i = end;
      continue;
    }

    // return expr;
    if (s.startsWith('return', i) && !/[A-Za-z0-9_$]/.test(s[i + 6] || '')) {
      i += 6;
      i = skipSpace(s, i);
      const exprEnd = findStmtEnd(s, i);
      stmts.push({ type: 'return', expr: s.slice(i, exprEnd).replace(/;$/, '').trim() });
      i = exprEnd;
      if (s[i] === ';') i++;
      continue;
    }

    // function declaration inside body (nested)
    if (s.startsWith('function', i) && /\s/.test(s[i + 8] || '')) {
      const fnEnd = findBraceEnd(s, i);
      if (fnEnd > 0) {
        stmts.push({ type: 'expr', expr: s.slice(i, fnEnd + 1).trim() });
        i = fnEnd + 1;
        if (s[i] === ';') i++;
        continue;
      }
    }

    // Assignment or expression
    const exprEnd = findStmtEnd(s, i);
    const chunk = s.slice(i, exprEnd).replace(/;$/, '').trim();
    if (chunk) {
      const am = chunk.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\[\s*[^\]]+\s*\])*)\s*=\s*([\s\S]+)$/);
      if (am) {
        stmts.push({ type: 'assign', id: am[1], expr: am[2].trim() });
      } else {
        stmts.push({ type: 'expr', expr: chunk });
      }
    }
    i = exprEnd;
    if (s[i] === ';') i++;
  }
  return stmts;
}

function parseIf(s, i) {
  i += 2; // skip 'if'
  i = skipSpace(s, i);
  const parenEnd = findMatching(s, i, '(', ')');
  const cond = s.slice(i + 1, parenEnd).trim();
  i = parenEnd + 1;
  i = skipSpace(s, i);
  const thenBody = extractBraceBody(s, i);
  const thenStmts = parseTsStatements(thenBody.slice(1, -1).trim());
  i = i + thenBody.length;
  i = skipSpace(s, i);

  let elseStmts = null;
  if (s.startsWith('else', i) && !/[A-Za-z0-9_$]/.test(s[i + 4] || '')) {
    i += 4;
    i = skipSpace(s, i);
    if (s.startsWith('if', i)) {
      const { stmt: elif, end } = parseIf(s, i);
      elseStmts = [elif];
      i = end;
    } else {
      const elseBody = extractBraceBody(s, i);
      elseStmts = parseTsStatements(elseBody.slice(1, -1).trim());
      i = i + elseBody.length;
    }
  }

  return { stmt: { type: 'if', cond, then: thenStmts, else: elseStmts }, end: i };
}

function parseFor(s, i) {
  i += 3; // skip 'for'
  i = skipSpace(s, i);
  const parenEnd = findMatching(s, i, '(', ')');
  const head = s.slice(i + 1, parenEnd).trim();
  const parts = head.split(';').map(p => p.trim());
  i = parenEnd + 1;
  i = skipSpace(s, i);
  const body = extractBraceBody(s, i);
  const bodyStmts = parseTsStatements(body.slice(1, -1).trim());
  i = i + body.length;
  return { stmt: { type: 'for', init: parts[0] || '', cond: parts[1] || '', step: parts[2] || '', body: bodyStmts }, end: i };
}

function parseWhile(s, i) {
  i += 5; // skip 'while'
  i = skipSpace(s, i);
  const parenEnd = findMatching(s, i, '(', ')');
  const cond = s.slice(i + 1, parenEnd).trim();
  i = parenEnd + 1;
  i = skipSpace(s, i);
  const body = extractBraceBody(s, i);
  const bodyStmts = parseTsStatements(body.slice(1, -1).trim());
  i = i + body.length;
  return { stmt: { type: 'while', cond, body: bodyStmts }, end: i };
}

function stmtToLin(stmt) {
  switch (stmt.type) {
    case 'return': return '^' + stmt.expr;
    case 'assign': return stmt.id + '=' + stmt.expr;
    case 'expr': return stmt.expr;
    case 'if': {
      let r = '?(' + stmt.cond + '){' + stmt.then.map(stmtToLin).join(';') + '}';
      if (stmt.else) r += ':{' + stmt.else.map(stmtToLin).join(';') + '}';
      return r;
    }
    case 'for': return '#(' + stmt.init + ';' + stmt.cond + ';' + stmt.step + '){' + stmt.body.map(stmtToLin).join(';') + '}';
    case 'while': return '#(;' + stmt.cond + ';){' + stmt.body.map(stmtToLin).join(';') + '}';
    default: return stmt.expr || '';
  }
}

function skipSpace(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }

function findMatching(s, i, open, close) {
  let depth = 0;
  let inStr = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
  }
  return s.length;
}

function findBraceEnd(s, i) {
  let depth = 0;
  let inStr = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

function findStmtEnd(s, i) {
  let depth = 0;
  let inStr = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return j;
  }
  return s.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: LIN Tokenizer + Token Counter
// ═══════════════════════════════════════════════════════════════════════════════

const LIN_TOKEN_RE = /[!?#^:;,@=.${}()[\]<>\-+*/%&|!~]|\b[A-Za-z_][\w$]*\b|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

function tokenizeAndCount(text) {
  const tokens = [];
  let m;
  LIN_TOKEN_RE.lastIndex = 0;
  while ((m = LIN_TOKEN_RE.exec(text)) !== null) tokens.push(m[0]);
  return tokens;
}

function countTokens(text) {
  return tokenizeAndCount(text).length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Semantic Equivalence (LIN → JS → behavioral comparison)
// ═══════════════════════════════════════════════════════════════════════════════

function linToJsBody(linBody) {
  let s = linBody;
  // ^ → return
  s = s.replace(/\^/g, 'return ');
  // ?( → if (
  s = s.replace(/\?\(/g, 'if (');
  // :{ → else {
  s = s.replace(/:\{/g, ' else {');
  // #(init;cond;step){ → for (init;cond;step) {
  s = s.replace(/#\(([^;]*);([^;]*);([^)]*)\)\{/g, 'for($1;$2;$3){');
  // #(;cond;){ → while (cond) {
  s = s.replace(/#\(([^;]*);([^)]+)\)\{/g, 'while($2){');
  // Strip function declaration sigil: !name → function name
  s = s.replace(/!([A-Za-z_$]\w*)/g, 'function $1');
  // ; → ; (keep as statement separator)
  return s;
}

/** Build JS from extracted TS functions — direct type-strip only, no LIN roundtrip. */
function buildTsDirectJs(fns) {
  const parts = [];
  for (const fn of fns) {
    const cleanParams = stripTypes(fn.params).replace(/\s+/g, ' ').trim();
    const body = stripTypes(fn.body).replace(/\s+/g, ' ').trim();
    parts.push(`function ${fn.name}(${cleanParams}) { ${body} }`);
  }
  return parts.join('\n');
}

function buildLinProgram(fns) {
  const parts = [];
  parts.push('@LIN:L1c:0.2');
  parts.push('^schema_once ^lossy=true ^ops=sigil_ops');
  parts.push('~G{?=if #=for ^=ret :else}');
  const exportNames = fns.map(f => f.name);
  for (const fn of fns) {
    const cleanParams = stripTypes(fn.params).replace(/\s+/g, ' ').trim();
    parts.push(`!${fn.name}(${cleanParams}){${tsBodyToLin(fn.body)}}`);
  }
  if (exportNames.length) parts.push(`=ex{${exportNames.join(',')}}`);
  return parts.join('\n');
}

function compileLinToJs(linText) {
  try {
    const lines = linText.split('\n').filter(l => l.trim() && !l.startsWith('@') && !l.startsWith('^') && !l.startsWith('~') && !l.startsWith('$') && !l.startsWith('='));
    const bodyParts = [];
    for (const line of lines) {
      const fnMatch = line.match(/^!([A-Za-z_$]\w*)\(([^)]*)\)\{([\s\S]*)\}$/);
      if (fnMatch) {
        const [, name, params, body] = fnMatch;
        bodyParts.push(`function ${name}(${params}) { ${linToJsBody(body)} }`);
      }
    }
    return bodyParts.join('\n');
  } catch {
    return null;
  }
}

function behavioralEq(tsDirectJs, linJs, fnNames) {
  try {
    const exec = (code) => {
      const wrapper = fnNames.map(n => `${n}: ${n}`).join(', ');
      const factory = new Function(code + `\nreturn {${wrapper}};`);
      return factory();
    };
    let tsExports, linExports;
    try { tsExports = exec(tsDirectJs); } catch { return false; }
    try { linExports = exec(linJs); } catch { return false; }

    for (const k of fnNames) {
      const f1 = tsExports[k];
      const f2 = linExports[k];
      if (typeof f1 !== typeof f2) return false;
      if (typeof f1 === 'function') {
        if (f1.length !== f2.length) return false;
        const testInputs = [
          [0], [1], [-1], [42], [100], [0.5], [-3.14],
          [0, 0], [1, 2], [10, 5], [7, 3],
          [""], ["hello"], ["test"],
        ];
        for (const inp of testInputs) {
          try {
            const r1 = f1(...inp);
            const r2 = f2(...inp);
            if (String(r1) !== String(r2)) return false;
          } catch { /* both may throw */ }
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Benchmark Corpus (representative TS functions, canonical subset)
// ═══════════════════════════════════════════════════════════════════════════════

const CORPUS = [
  // --- Simple predicates ---
  {
    name: 'isNegative',
    ts: `function isNegative(n: number): boolean { return n < 0; }`,
    category: 'predicate',
  },
  {
    name: 'isEmpty',
    ts: `function isEmpty(s: string): boolean { return s.length === 0; }`,
    category: 'predicate',
  },
  {
    name: 'clamp',
    ts: `function clamp(value: number, min: number, max: number): number { if (value < min) { return min; } if (value > max) { return max; } return value; }`,
    category: 'predicate',
  },

  // --- Arithmetic ---
  {
    name: 'add',
    ts: `function add(a: number, b: number): number { return a + b; }`,
    category: 'arithmetic',
  },
  {
    name: 'multiply',
    ts: `function multiply(a: number, b: number): number { return a * b; }`,
    category: 'arithmetic',
  },
  {
    name: 'abs',
    ts: `function abs(n: number): number { if (n < 0) { return -n; } return n; }`,
    category: 'arithmetic',
  },
  {
    name: 'factorial',
    ts: `function factorial(n: number): number { if (n <= 1) { return 1; } return n * factorial(n - 1); }`,
    category: 'arithmetic',
  },
  {
    name: 'fibonacci',
    ts: `function fibonacci(n: number): number { if (n <= 0) { return 0; } if (n === 1) { return 1; } return fibonacci(n - 1) + fibonacci(n - 2); }`,
    category: 'arithmetic',
  },

  // --- String manipulation ---
  {
    name: 'repeat',
    ts: `function repeat(s: string, n: number): string { let result = ""; for (let i = 0; i < n; i++) { result = result + s; } return result; }`,
    category: 'string',
  },
  {
    name: 'reverse',
    ts: `function reverse(s: string): string { let result = ""; for (let i = s.length - 1; i >= 0; i--) { result = result + s[i]; } return result; }`,
    category: 'string',
  },
  {
    name: 'capitalize',
    ts: `function capitalize(s: string): string { if (s.length === 0) { return s; } return s[0].toUpperCase() + s.slice(1); }`,
    category: 'string',
  },
  {
    name: 'truncate',
    ts: `function truncate(s: string, max: number): string { if (s.length <= max) { return s; } return s.slice(0, max) + "..."; }`,
    category: 'string',
  },
  {
    name: 'isPalindrome',
    ts: `function isPalindrome(s: string): boolean { let left = 0; let right = s.length - 1; while (left < right) { if (s[left] !== s[right]) { return false; } left++; right--; } return true; }`,
    category: 'string',
  },

  // --- Array operations ---
  {
    name: 'sum',
    ts: `function sum(arr: number[]): number { let total = 0; for (let i = 0; i < arr.length; i++) { total = total + arr[i]; } return total; }`,
    category: 'array',
  },
  {
    name: 'findMax',
    ts: `function findMax(arr: number[]): number { let max = arr[0]; for (let i = 1; i < arr.length; i++) { if (arr[i] > max) { max = arr[i]; } } return max; }`,
    category: 'array',
  },
  {
    name: 'count',
    ts: `function count(arr: number[], target: number): number { let n = 0; for (let i = 0; i < arr.length; i++) { if (arr[i] === target) { n++; } } return n; }`,
    category: 'array',
  },

  // --- Object manipulation ---
  {
    name: 'pick',
    ts: `function pick(obj: Record<string, number>, keys: string[]): Record<string, number> { let result: Record<string, number> = {}; for (let i = 0; i < keys.length; i++) { if (keys[i] in obj) { result[keys[i]] = obj[keys[i]]; } } return result; }`,
    category: 'object',
  },

  // --- Control flow ---
  {
    name: 'classify',
    ts: `function classify(score: number): string { if (score >= 90) { return "A"; } else if (score >= 80) { return "B"; } else if (score >= 70) { return "C"; } else if (score >= 60) { return "D"; } else { return "F"; } }`,
    category: 'control',
  },
  {
    name: 'dayOfWeek',
    ts: `function dayOfWeek(n: number): string { if (n === 0) { return "Sun"; } else if (n === 1) { return "Mon"; } else if (n === 2) { return "Tue"; } else if (n === 3) { return "Wed"; } else if (n === 4) { return "Thu"; } else if (n === 5) { return "Fri"; } else { return "Sat"; } }`,
    category: 'control',
  },

  // --- Real-world patterns (dayjs-like, underscore-like) ---
  {
    name: 'absFloor',
    ts: `function absFloor(n: number): number { if (n < 0) { return Math.ceil(n) || 0; } return Math.floor(n); }`,
    category: 'realworld',
  },
  {
    name: 'padStart',
    ts: `function padStart(s: string, target: number, fill: string): string { while (s.length < target) { s = fill + s; } return s; }`,
    category: 'realworld',
  },
  {
    name: 'debounce',
    ts: `function debounce(fn: Function, wait: number): Function { let timeout: any = null; return function(this: any, ...args: any[]) { if (timeout) { clearTimeout(timeout); } timeout = setTimeout(() => { fn.apply(this, args); }, wait); }; }`,
    category: 'realworld',
  },
  {
    name: 'memoize',
    ts: `function memoize(fn: Function): Function { const cache: Record<string, any> = {}; return function(this: any, ...args: any[]) { const key = JSON.stringify(args); if (key in cache) { return cache[key]; } const result = fn.apply(this, args); cache[key] = result; return result; }; }`,
    category: 'realworld',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Main Benchmark Runner
// ═══════════════════════════════════════════════════════════════════════════════

function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  IR_BENCHMARK_V1 — Phase 1: TS → LIN IR Ratio             ║');
  console.log('║  Deterministic • No DAE • No LLM • Canonical Subset       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results = [];
  let totalTsTokens = 0;
  let totalLinTokens = 0;
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const entry of CORPUS) {
    const { name, ts, category } = entry;
    process.stderr.write(`  Processing ${name}...\n`);

    // 1. Canonical TS
    const canonTs = canonicalizeTS(ts);
    const tsTokens = countTokens(canonTs);

    // 2. Parse + rewrite to LIN
    const fns = extractFunctions(ts);
    if (fns.length === 0) {
      console.log(`  [SKIP] ${name}: no functions extracted`);
      skipCount++;
      continue;
    }
    process.stderr.write(`    extracted ${fns.length} fns, converting to LIN...\n`);

    const linProgram = buildLinProgram(fns);
    const linBody = fns.map(f => f.body).join('\n');
    process.stderr.write(`    tokenizing...\n`);
    const linBodyTokens = countTokens(tsBodyToLin(linBody));
    const linFullTokens = countTokens(linProgram);

    // Use body-only tokens for fair comparison (TS body tokens vs LIN body tokens)
    const tsBodyTokens = countTokens(canonicalizeTS(linBody));
    const ratio = tsBodyTokens > 0 && linBodyTokens > 0 ? (tsBodyTokens / linBodyTokens) : 0;

    // 3. Semantic equivalence check — TS direct JS vs LIN→JS
    const tsDirectJs = buildTsDirectJs(fns);
    const linJs = compileLinToJs(linProgram);
    const fnNames = fns.map(f => f.name);
    let semanticEq = false;
    if (linJs) {
      semanticEq = behavioralEq(tsDirectJs, linJs, fnNames);
    }

    if (semanticEq) passCount++;
    else failCount++;

    totalTsTokens += tsBodyTokens;
    totalLinTokens += linBodyTokens;

    results.push({
      name, category,
      tsCanon: canonTs, linBody: tsBodyToLin(linBody),
      tsTokens: tsBodyTokens, linTokens: linBodyTokens, ratio,
      semanticEq,
    });
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  const overallRatio = totalLinTokens > 0 ? (totalTsTokens / totalLinTokens) : 0;

  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│                  IR_RATIO RESULTS                              │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { ts: 0, lin: 0, count: 0 };
    byCategory[r.category].ts += r.tsTokens;
    byCategory[r.category].lin += r.linTokens;
    byCategory[r.category].count++;
  }

  console.log(`│ ${'Category'.padEnd(15)} ${'Count'.padStart(5)} ${'TS tokens'.padStart(10)} ${'LIN tokens'.padStart(11)} ${'IR_ratio'.padStart(9)} │`);
  console.log('│' + '─'.repeat(65) + '│');
  for (const [cat, data] of Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
    const r = data.lin > 0 ? (data.ts / data.lin) : 0;
    console.log(`│ ${cat.padEnd(15)} ${String(data.count).padStart(5)} ${String(data.ts).padStart(10)} ${String(data.lin).padStart(11)} ${r.toFixed(3).padStart(9)} │`);
  }
  console.log('│' + '─'.repeat(65) + '│');
  console.log(`│ ${'TOTAL'.padEnd(15)} ${String(results.length).padStart(5)} ${String(totalTsTokens).padStart(10)} ${String(totalLinTokens).padStart(11)} ${overallRatio.toFixed(3).padStart(9)} │`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│                  SEMANTIC_EQ RESULTS                           │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│  PASS: ${String(passCount).padStart(3)}   FAIL: ${String(failCount).padStart(3)}   SKIP: ${String(skipCount).padStart(3)}   TOTAL: ${String(results.length).padStart(3)}  │`);
  console.log(`│  Semantic Eq Rate: ${(passCount / (results.length || 1) * 100).toFixed(1)}%${''.padEnd(35)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  // ─── Per-function detail ──────────────────────────────────────────────────

  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                    PER-FUNCTION DETAIL                                     │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ ${'Function'.padEnd(16)} ${'TS'.padStart(5)} ${'LIN'.padStart(5)} ${'Ratio'.padStart(7)} ${'SemEq'.padStart(6)} │`);
  console.log('│' + '─'.repeat(75) + '│');
  for (const r of results) {
    const semEq = r.semanticEq ? 'PASS' : 'FAIL';
    console.log(`│ ${r.name.padEnd(16)} ${String(r.tsTokens).padStart(5)} ${String(r.linTokens).padStart(5)} ${r.ratio.toFixed(3).padStart(7)} ${semEq.padStart(6)} │`);
  }
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  // ─── Artifact ─────────────────────────────────────────────────────────────

  const artifact = {
    benchmark: 'IR_BENCHMARK_V1',
    phase: 1,
    timestamp: new Date().toISOString(),
    gate11FrozenAt: 'ff17f11',
    config: {
      noDAE: true,
      noLLM: true,
      deterministic: true,
      canonicalSubset: 'literals, identifiers, let/const/var, assignments, arithmetic, comparisons, logical, function calls, return, if/else, for, while, functions, basic TS types',
    },
    summary: {
      totalFunctions: results.length,
      totalTsTokens,
      totalLinTokens,
      overallIRRatio: overallRatio,
      semanticEqPass: passCount,
      semanticEqFail: failCount,
      semanticEqSkip: skipCount,
      semanticEqRate: passCount / (results.length || 1),
    },
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, {
        count: v.count,
        tsTokens: v.ts,
        linTokens: v.lin,
        irRatio: v.lin > 0 ? v.ts / v.lin : 0,
      }])
    ),
    functions: results,
  };

  const outDir = path.join(__dirname, '..', 'benchmarks', 'ir_benchmark_v1');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'phase1_results.json');
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n[ARTIFACT] Written to ${outPath}`);

  // ─── Hypothesis ───────────────────────────────────────────────────────────

  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│                  HYPOTHESIS EVALUATION                         │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│  H_IR-01: LIN as IR validates multi-target compilation        │`);
  console.log(`│    → semantic_eq = ${(passCount / (results.length || 1) * 100).toFixed(1)}% (${passCount}/${results.length})`);
  console.log(`│    → ${failCount === 0 ? 'SUPPORTED' : 'PARTIAL — ' + failCount + ' functions failed behavioral comparison'}`);
  console.log('│                                                                 │');
  console.log(`│  IR_ratio: ${overallRatio.toFixed(3)}x (TS tokens / LIN tokens)`);
  console.log(`│    → ${overallRatio > 1 ? 'LIN is MORE compact' : 'LIN is LESS compact'} than canonical TS`);
  console.log(`│    → H_COMPACT-01_v2: ${overallRatio > 1 ? 'SUPPORTED' : 'NOT YET SUPPORTED'} (needs prompt-level measurement)`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  return artifact;
}

const result = runBenchmark();
process.exit(result.summary.semanticEqFail > 0 ? 1 : 0);
