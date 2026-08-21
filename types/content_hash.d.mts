/**
 * Canonicalize a function body for hashing:
 * 1. Strip all whitespace variations
 * 2. Alpha-rename local variables to positional names ($0, $1, ...)
 * 3. Normalize operators and literals
 */
export declare function canonicalize(fnName: any, params: any, body: any): string;
/**
 * Compute the content-addressed hash of a LIN function.
 * Returns a 16-char hex string (64-bit collision resistance).
 */
export declare function contentHash(fnName: any, params: any, body: any): string;
/**
 * Build a content-addressed registry from a parsed LIN program.
 * Each function gets a unique hash based on its semantics, not its name.
 */
export declare function buildContentRegistry(prog: any): {};
/**
 * Check if two functions are semantically equivalent
 * (same hash = same behavior regardless of naming).
 */
export declare function semanticEquals(fn1: any, fn2: any): boolean;
