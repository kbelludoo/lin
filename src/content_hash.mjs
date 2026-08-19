/**
 * LIN Content-Addressed AST Hash — Unison style.
 *
 * Functions are identified by the SHA-256 hash of their canonical AST,
 * NOT by file path or function name. Renaming a variable or reformatting
 * whitespace does NOT change the hash. Only semantic changes do.
 *
 * This enables:
 * - Universal function cache across all repos
 * - Dependency deduplication (no diamond dependency problem)
 * - Deterministic builds independent of naming conventions
 */
import { createHash } from 'node:crypto';
import { tryParseStmts } from './body_ast.mjs';

/**
 * Check if an expression is pure (no side effects).
 * Pure = literals, variable refs, binary ops on pure subexpressions.
 * NOT pure = function calls, IO, throw, native constructors.
 */
function isPureRHS(expr) {
  const s = String(expr || '').trim();
  if (!s) return false;
  // Literals
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return true;
  if (/^["'`].*["'`]$/.test(s)) return true;
  if (/^(true|false|null|undefined|NaN|Infinity)$/.test(s)) return true;
  // Variable reference
  if (/^[A-Za-z_$][\w$]*$/.test(s)) return true;
  // Binary expression on literals/variables
  if (/^[A-Za-z_$0-9][\w$0-9]*\s*[+\-*/%&|^<>]=?\s*[A-Za-z_$0-9][\w$0-9]*$/.test(s)) return true;
  // Function call → NOT pure
  if (/\(/.test(s)) return false;
  // Known effect patterns → NOT pure
  if (/console\.|throw\b|fetch\(|process\.|require\(|document\.|window\.|alert\(/.test(s)) return false;
  // Native constructors → NOT pure
  if (/\b(String|Number|Math|Buffer|Array|Object|Error|JSON|crypto|setTimeout|setInterval)\b/.test(s)) return false;
  // Default: NOT pure (conservative)
  return false;
}

/**
 * Collect all identifiers referenced in a body string (excluding keywords and property access).
 * Simplified version — works on raw text, not AST.
 */
function collectBodyIdentifiers(body) {
  const s = String(body || '');
  const ids = new Set();
  const keywords = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'if', 'else', 'while', 'for', 'return', 'throw', 'switch', 'case', 'default']);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_$]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (!keywords.has(word)) {
        let k = i - 1;
        while (k >= 0 && /\s/.test(s[k])) k--;
        if (!(k >= 0 && s[k] === '.')) ids.add(word);
      }
      i = j; continue;
    }
    i++;
  }
  return ids;
}

/**
 * Find dead assignments in a LIN function body.
 * A dead assignment is `x = expr` where:
 *   1. x is never referenced anywhere else in the body
 *   2. expr is pure (no function calls, IO, throw, native)
 *
 * Returns an array of { id, pattern } objects for each dead assignment.
 */
function findDeadAssignments(body) {
  const s = String(body || '');
  const dead = [];
  try {
    const stmts = tryParseStmts(s);
    if (!stmts) return dead;

    // Collect all identifiers used in non-assignment contexts + in RHS of assignments
    const usedIds = new Set();
    for (const st of stmts) {
      if (st.type === 'assign') {
        // RHS identifiers are "used"
        for (const id of collectBodyIdentifiers(st.expr || '')) usedIds.add(id);
      } else {
        // All identifiers in non-assignment statements are "used"
        const raw = stmtToRaw(st);
        for (const id of collectBodyIdentifiers(raw)) usedIds.add(id);
      }
    }

    // Identify dead assignments
    for (const st of stmts) {
      if (st.type !== 'assign') continue;
      const id = st.id;
      // Skip compound assignments (x += ..., x.prop = ...) — they read x
      if (st.op && st.op !== '=') continue;
      // Skip property assignments (x.y = ...) — side effect on object
      if (String(id).includes('.') || /\[/.test(String(id))) continue;
      // LHS must not be used anywhere else
      if (usedIds.has(id)) continue;
      // RHS must be pure
      if (!isPureRHS(st.expr)) continue;
      // Build a regex to match this assignment in the raw text
      dead.push({
        id,
        pattern: new RegExp(
          `(?:^|[;{])\\s*${escapeRe(id)}\\s*=\\s*${escapeRegexForBody(st.expr || '')}\\s*;?`,
        ),
      });
    }
  } catch {
    // Parsing failed — conservative: no eliminations
  }
  return dead;
}

function stmtToRaw(st) {
  if (!st) return '';
  switch (st.type) {
    case 'return': return '^' + (st.expr || '');
    case 'throw': return 'throw ' + (st.expr || '');
    case 'if': {
      let r = '?(' + st.cond + '){' + (st.then || []).map(stmtToRaw).join(';') + '}';
      for (const e of st.elseIf || []) r += ':(' + e.cond + '){' + (e.body || []).map(stmtToRaw).join(';') + '}';
      if (st.else) r += ':{' + (st.else || []).map(stmtToRaw).join(';') + '}';
      return r;
    }
    case 'for': return '#(' + st.init + ';' + st.cond + ';' + st.step + '){' + (st.body || []).map(stmtToRaw).join(';') + '}';
    case 'while': return 'while(' + st.cond + '){' + (st.body || []).map(stmtToRaw).join(';') + '}';
    case 'assign': return (st.id || '') + (st.op || '=') + (st.expr || '');
    case 'expr': return st.expr || '';
    case 'match': return 'match(' + st.expr + '){' + (st.arms || []).map(a => a.pat + '=>' + a.body.map(stmtToRaw).join(';')).join(',') + '}';
    default: return '';
  }
}

function escapeRegexForBody(expr) {
  // Escape the expression for use in a regex, but allow flexible whitespace around operators
  return escapeRe(String(expr || '').trim()).replace(/\\([+\-*/%&|^<>])/g, '\\s*$1\\s*');
}

/**
 * Strip dead assignments from a body string.
 * Returns the cleaned body with dead assignments removed.
 */
function stripDeadAssignments(body) {
  const s = String(body || '');
  const dead = findDeadAssignments(s);
  if (dead.length === 0) return s;

  let result = s;
  for (const d of dead) {
    // Find the dead assignment in the raw text.
    // Match: optional leading separator, then "id = expr;"
    // The separator (; or {) is NOT consumed — only used as a boundary.
    const assignRe = new RegExp(
      `(^|;|\\{)\\s*${escapeRe(d.id)}\\s*=\\s*[^;]*;?`,
    );
    const m = result.match(assignRe);
    if (m) {
      const sepEnd = m.index + m[1].length;
      const removeEnd = m.index + m[0].length;
      // Keep the leading separator, remove only "id = expr;"
      result = result.slice(0, sepEnd) + result.slice(removeEnd);
    }
  }
  // Clean up leading semicolons and empty blocks
  result = result.replace(/^[;{\s]+/, '').replace(/;\s*$/, '').replace(/[;{\s]+$/, '');
  return result || '';
}

/**
 * Canonicalize a function body for hashing:
 * 1. Strip all whitespace variations
 * 2. Alpha-rename local variables to positional names ($0, $1, ...)
 * 3. Normalize operators and literals
 */
export function canonicalize(fnName, params, body) {
  let canon = String(body || '').trim();

  // Strip all inline and block comments
  canon = canon.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '');

  // Strip dead assignments (pure RHS, LHS never referenced)
  canon = stripDeadAssignments(canon);

  // Normalize whitespace and operator spacing
  canon = canon.replace(/\s+/g, ' ').replace(/\s*([=+\-*/%&|^<>(),;!?:{}[\]])\s*/g, '$1').trim();

  // Alpha-rename: replace param names with positional $0, $1, ... and capture types
  const rawParams = String(params || '').split(',').map((p) => p.trim()).filter(Boolean);
  const paramTypes = rawParams.map((p) => p.includes(':') ? p.split(':')[1].trim() : '').join(',');
  const paramList = rawParams.map((p) => p.replace(/:.+$/, ''));
  for (let i = 0; i < paramList.length; i++) {
    const re = new RegExp(`\\b${escapeRe(paramList[i])}\\b`, 'g');
    canon = canon.replace(re, `$${i}`);
  }

  // Alpha-rename: local assigned variables (_l0, _l1, ...)
  const reserved = new Set(['var', 'let', 'const', 'return', 'if', 'else', 'while', 'for', 'in', 'of', 'null', 'true', 'false', 'undefined', 'void', 'typeof']);
  const locals = [];
  const assignRe = /(?:^|[;{(])\s*([a-zA-Z_$][\w$]*)\s*=(?!=)/g;
  let match;
  while ((match = assignRe.exec(canon)) !== null) {
    const id = match[1];
    if (!locals.includes(id) && !id.startsWith('$') && !reserved.has(id)) {
      locals.push(id);
    }
  }

  for (let i = 0; i < locals.length; i++) {
    const re = new RegExp(`\\b${escapeRe(locals[i])}\\b`, 'g');
    canon = canon.replace(re, `_l${i}`);
  }

  // Normalize string delimiters
  canon = canon.replace(/'/g, '"');

  // Normalize comparison operators
  canon = canon.replace(/===/g, '==').replace(/!==/g, '!=');

  // Strip all trailing semicolons
  canon = canon.replace(/;+/g, ';').replace(/;+$/, '');

  return `(${paramList.length}:${paramTypes})${canon}`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compute the content-addressed hash of a LIN function.
 * Returns a 16-char hex string (64-bit collision resistance).
 */
export function contentHash(fnName, params, body) {
  const canonical = canonicalize(fnName, params, body);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return hash.slice(0, 16);
}

/**
 * Build a content-addressed registry from a parsed LIN program.
 * Each function gets a unique hash based on its semantics, not its name.
 */
export function buildContentRegistry(prog) {
  const registry = {};
  for (const fn of (prog.fns || [])) {
    const hash = contentHash(fn.name, fn.params, fn.body);
    registry[hash] = {
      name: fn.name,
      params: fn.params,
      hash,
      bodyLen: (fn.body || '').length,
    };
  }
  return registry;
}

/**
 * Check if two functions are semantically equivalent
 * (same hash = same behavior regardless of naming).
 */
export function semanticEquals(fn1, fn2) {
  const h1 = contentHash(fn1.name, fn1.params, fn1.body);
  const h2 = contentHash(fn2.name, fn2.params, fn2.body);
  return h1 === h2;
}
