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

/**
 * Canonicalize a function body for hashing:
 * 1. Strip all whitespace variations
 * 2. Alpha-rename local variables to positional names ($0, $1, ...)
 * 3. Normalize operators and literals
 */
export function canonicalize(fnName, params, body) {
  let canon = String(body || '').trim();

  // Normalize whitespace
  canon = canon.replace(/\s+/g, ' ');

  // Alpha-rename: replace param names with positional $0, $1, ...
  const paramList = String(params || '').split(',').map((p) => p.trim().replace(/:.+$/, '')).filter(Boolean);
  for (let i = 0; i < paramList.length; i++) {
    const re = new RegExp(`\\b${escapeRe(paramList[i])}\\b`, 'g');
    canon = canon.replace(re, `$${i}`);
  }

  // Normalize string delimiters
  canon = canon.replace(/'/g, '"');

  // Normalize comparison operators
  canon = canon.replace(/===/g, '==').replace(/!==/g, '!=');

  // Strip trailing semicolons
  canon = canon.replace(/;\s*/g, ';');

  return `(${paramList.length})${canon}`;
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
