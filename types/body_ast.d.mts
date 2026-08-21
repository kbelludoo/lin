/**
 * Parse LIA function bodies into a small statement AST for multi-target emit.
 */
export declare function findMatching(s: any, openIdx: any, openCh: any, closeCh: any): any;
/**
 * @returns {import('./emit_shared.mjs').Stmt[]}
 */
export declare function tryParseStmts(body: any): import('./emit_shared.mjs').Stmt[];
export declare function parseStmts(body: any): any[];
export declare function collectAssignedIds(stmts: any): any[];
