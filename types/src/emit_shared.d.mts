/**
 * Shared helpers for LIA multi-target emitters.
 * @typedef {{type:'assign', id:string, op:string, expr:string}} AssignStmt
 * @typedef {{type:'return', expr:string}} ReturnStmt
 * @typedef {{type:'expr', expr:string}} ExprStmt
 * @typedef {{type:'throw', expr:string}} ThrowStmt
 * @typedef {{type:'if', cond:string, then:Stmt[], elseIf:{cond:string,body:Stmt[]}[], else:Stmt[]|null}} IfStmt
 * @typedef {{type:'for', init:string, cond:string, step:string, body:Stmt[]}} ForStmt
 * @typedef {{type:'while', cond:string, body:Stmt[]}} WhileStmt
 * @typedef {AssignStmt|ReturnStmt|ExprStmt|ThrowStmt|IfStmt|ForStmt|WhileStmt} Stmt
 */
export type AssignStmt = {
    type: 'assign';
    id: string;
    op: string;
    expr: string;
};
export type ReturnStmt = {
    type: 'return';
    expr: string;
};
export type ExprStmt = {
    type: 'expr';
    expr: string;
};
export type ThrowStmt = {
    type: 'throw';
    expr: string;
};
export type IfStmt = {
    type: 'if';
    cond: string;
    then: Stmt[];
    elseIf: {
        cond: string;
        body: Stmt[];
    }[];
    else: Stmt[] | null;
};
export type ForStmt = {
    type: 'for';
    init: string;
    cond: string;
    step: string;
    body: Stmt[];
};
export type WhileStmt = {
    type: 'while';
    cond: string;
    body: Stmt[];
};
export type Stmt = AssignStmt | ReturnStmt | ExprStmt | ThrowStmt | IfStmt | ForStmt | WhileStmt;
/** Matches src/clone_lin_full_repo_gate.lin defaultEmitTarget — prefer TS until a real bench exists. */
export declare const DEFAULT_EMIT_TARGET = "ts";
export declare const TARGETS: string[];
/** Real nucleus: compile + toolchain check. Stub langs may emit but are not suite_rate. */
export declare const REAL_TARGETS: string[];
export declare const STUB_TARGETS: string[];
export declare const GATE_REQUIRED: string[];
export declare function formatNucleusMulti(summary: any): string;
/** Never a Px/S0/F0 score — stub langs are not suite_rate. */
export declare function formatStubIntel(): string;
export declare function stripStubPassScores(text: any): string;
/** INTEL multi= from real nucleus only. Ignores stub keys and stray asm:P15 tokens. */
export declare function honestNucleusMulti(summaryOrLine: any): string;
export declare function snakeCase(name: any): string;
export declare function safeEmitId(id: any): string;
/** Unique host-safe names for a LIN fn list. transform maps LIN name → host ident before reserve-rename. */
export declare function emitNameMap(fns: any, transform?: (n: any) => string): any;
export declare function isNoopExpr(expr: any): boolean;
/** Split LIN/JS param lists; strip `size=21` so Go/Rust/Java/C signatures stay valid. */
export declare function parseParamList(raw: any): {
    names: any[];
    defaults: any[];
    sigPy: any[];
    sigTs: any[];
};
export declare function emitNilDefaults(defaults: any, target: any): any;
/** Detect JS-runtime-only surface (Buffer/crypto) — stub on non-JS targets. */
export declare function isJsRuntimeOnly(body: any, name: any): boolean;
/** Undeclared host caps (Ls, IS_DAYJS, FORMAT_DEFAULT) so py/go/rust/java compile. */
export declare function collectFreeHostIds(body: any, params: any, fnNames: any): any[];
export declare function emitFreeHostDecls(ids: any, target: any): any;
/** Sibling fn used as a value (not a call) — stub so Rust/Java compile. */
export declare function rewriteFnValues(body: any, fnNames: any, stub: any): string;
export declare function isNumishId(id: any): boolean;
export declare function isBoolFnName(name: any): boolean;
export declare function isBoolishId(id: any): boolean;
/** Keep numeric `+` (res+i, n+n); only cat when a side is a string/cat helper. */
export declare function plusIsNumeric(a: any, b: any): boolean;
export declare function inferTypes(stmts: any): Map<any, any>;
export declare function isStringishId(id: any): boolean;
export declare function emitCond(cond: any, target: any): string;
export declare function assignOpLine(id: any, op: any, expr: any, target: any, pad: any, types: any): string;
/** JS `while (++i < n)` → increment then compare (Go/Rust have no prefix ++ in cond). */
export declare function splitPrefixIncCond(cond: any): {
    id: string;
    op: string;
    rhs: string;
};
export declare function rewriteExpr(expr: any, target: any): string;
export declare function defaultOutPath(inPath: any, target: any): string;
export declare function emitBanner(target: any): string;
