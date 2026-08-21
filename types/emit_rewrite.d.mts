/**
 * Peripheral rewrite helpers for multi-emit (not nucleus).
 * throw / IIFE / Math / JSON / regex / balanced new / sibling calls.
 */
export declare function matchParen(s: any, openIdx: any): any;
export declare function rewriteIifeTernary(s: any): string;
export declare function rewriteNewCalls(s: any): string;
export declare function extractThrowArg(expr: any): string;
export declare function emitThrowLine(raw: any, target: any, pad: any, rewrite: any): string;
export declare function rewriteSiblingCalls(s: any, aliases: any): string;
/** Rewrite `(cond?a:b)` with paren-aware scan. `to(cond,a,b)` returns replacement. */
export declare function rewriteTernaries(s: any, to: any): string;
/** Fold `a + b` at paren-depth 0 into `wrap(a,b)`. Unwraps outer parens first. */
export declare function foldPlus(s: any, wrap: any): string;
/** `id.method(...)` → `id` (compile stub; matchParen-safe). */
export declare function dropMethodsKeepRecv(s: any, names: any): string;
/** `id.replace(/re/, …).replace(…)` → `id` (compile stub; matchParen-safe). */
export declare function dropRegexMethods(s: any): string;
/** `_lia_get(x,"p").foo.bar()` and unknown `t.stringLiteral(...)` → `_lia_obj()`. */
export declare function collapseHostChains(s: any): string;
export declare function rewriteHostExpr(s: any, target: any): string;
