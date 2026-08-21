export declare const INVARIANTS: {
    SYMBOL_RESOLVED: string;
    EFFECT_BOUNDED: string;
    REFINEMENT_SOUND: string;
    EXHAUSTIVE_MATCH: string;
};
/** Tokenize identifiers in a body, skipping string/regex/char literals and comments. */
export declare function collectIdentifiers(body: any): Set<any>;
/** Detect concrete effect labels used by a function body (Read/Write/Throw/Native/IO). */
export declare function detectEffects(body: any, locals?: Set<any>): any[];
/** Collect locally-bound identifiers from raw function body (let/const/var, plain assigns, for-init, match bindings). */
export declare function collectBoundLocals(body: any, params?: any[]): Set<any>;
/** Run all four invariant checks over a program. Returns a proof report. */
export declare function checkInvariants(prog: any): {
    pass: boolean;
    violations: any[];
    invariants: {
        id: string;
        status: string;
        violations: any;
    }[];
    proofObligations: number;
    verifiedNodes: number;
};
/** Rich human-readable diagnostic. */
export declare function formatDiagnostics(report: any): string;
/** Entry: gate a program; throws with rich diagnostic when not pass (strict mode). */
export declare function runFormalGate(prog: any, opts?: {}): {
    pass: boolean;
    violations: any[];
    invariants: {
        id: string;
        status: string;
        violations: any;
    }[];
    proofObligations: number;
    verifiedNodes: number;
};
