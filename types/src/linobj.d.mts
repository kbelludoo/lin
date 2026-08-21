export declare const LINOBJ_FORMAT_VERSION = "1.1.0";
/**
 * Computes the module-level canonical representation and semantic hash
 * directly from parsed function records and module constants.
 */
export declare function computeModuleSemanticHash(fnRecords: any, consts?: {}, exports?: any[]): any;
/**
 * Fast semantic hash of LIN source code (lexical-invariant).
 * Whitespace, comments, or line-break differences produce the EXACT same hash.
 */
export declare function computeSourceSemanticHash(linSource: any): any;
/**
 * Builds a portable, pre-verified .linobj from LIN source code.
 */
export declare function buildLinobj(linSource: any, opts?: {}): {
    format_version: string;
    semantic_hash: any;
    canonical_ir: {
        schema: any;
        consts: any;
        exports: any[];
        functions: any[];
    };
    type_graph: {};
    effect_manifest: {};
    invariant_report: any;
    symbol_graph: {
        exports: any[];
        export_hashes: {};
        export_contracts: {};
        aliases: {};
        consts: any;
        local_functions: any[];
        external_references: any[];
    };
    dependency_hashes: {
        local: any[];
        external: any;
        imported_symbols: any[];
        required_artifacts: any;
        required_symbols: any;
    };
    lowering_metadata: {
        canonical_lin: string;
        source_bytes: any;
        build_time_ms: {
            parse: number;
            semantic: number;
            hash: number;
            total: number;
        };
    };
};
/**
 * Validates the cryptographic and structural integrity of a .linobj artifact.
 * Recomputes canonical semantic hash and verifies invariant claims.
 */
export declare function verifyLinobjIntegrity(linobj: any, opts?: {}): {
    valid: boolean;
    reason: string;
} | {
    reason?: undefined;
    valid: boolean;
};
/**
 * Checks if a .linobj is invalidated by changes in its external dependencies.
 */
export declare function isLinobjDependencyValid(linobj: any, currentDependencyMap?: {}): boolean;
/**
 * Serializes .linobj to JSON string.
 */
export declare function serializeLinobj(obj: any): string;
/**
 * Deserializes JSON string to a .linobj object.
 */
export declare function deserializeLinobj(jsonStr: any): any;
/**
 * Saves .linobj to disk cache keyed by semantic_hash.
 */
export declare function saveLinobjToCache(linobj: any, cacheDir: any): any;
/**
 * Loads .linobj from disk cache with strict integrity verification.
 * Rejects corrupted or tampered artifacts immediately.
 */
export declare function loadLinobjFromCache(semanticHash: any, cacheDir: any, opts?: {}): any;
/**
 * Lowers a pre-verified .linobj directly to target languages.
 */
export declare function lowerLinobj(linobj: any, target: any, opts?: {}): {
    target: any;
    code: any;
    semantic_hash: any;
    lowering_time_ms: number;
    effect_manifest: any;
    invariant_sound: boolean;
};
/**
 * Builds a Directed Acyclic Graph (DAG) of module dependencies.
 * @param {Array<{id: string, dependencies?: string[]}>} modules
 */
export declare function buildModuleDAG(modules: Array<{
    id: string;
    dependencies?: string[];
}>): {
    deps: Map<any, any>;
    reverseDeps: Map<any, any>;
    totalModules: number;
};
/**
 * Resolves the full transitive closure of affected modules given a set of modified roots.
 * Transitive propagation: A changed -> B (depends on A) invalidated -> C (depends on B) invalidated.
 * Disjoint modules D (not depending on A) are unaffected.
 */
export declare function resolveTransitiveInvalidation(dag: any, modifiedIds: any): {
    directMisses: any[];
    transitiveInvalidations: any[];
    unaffectedModules: number;
    amplificationFactor: number;
    amplificationPct: number;
};
/**
 * Executes an incremental build over a DAG of modules using .linobj content-addressed cache.
 */
export declare function buildIncrementalDAG(modules: any, dag: any, cacheDir: any, sourceMap?: {}): {
    totalModules: any;
    cacheHits: number;
    rebuiltCount: number;
    directMisses: any[];
    transitiveInvalidations: any[];
    amplificationFactor: number;
    amplificationPct: number;
    durationMs: number;
    builtLinobjs: Map<any, any>;
};
/**
 * Fine-grained Symbol-Level Invalidation Analysis.
 * Distinguishes between:
 *   - Coarse/File-level invalidation (any edit in module invalidates all consumers)
 *   - Fine-grained Symbol-level invalidation (only consumers of CHANGED symbols are invalidated)
 *
 * Computes:
 *   - under_invalidation_rate (must be 0.00% - sound)
 *   - over_invalidation_avoided (modules saved from redundant rebuild by symbol-level granularity)
 *   - precision_score: (Actually Impacted Modules) / (Invalidated Modules)
 */
export declare function resolveFineGrainedSymbolInvalidation(modules: any, dag: any, modifiedModuleMap: any, symbolUsageMap?: {}): {
    coarse: {
        rebuiltCount: number;
        directMisses: any[];
        transitive: any[];
    };
    fineGrained: {
        rebuiltCount: number;
        directMisses: string[];
        transitive: any[];
    };
    overInvalidatedAvoidedCount: number;
    overInvalidatedModules: any[];
    precisionScoreCoarse: number;
    precisionScoreFine: number;
    underInvalidationDetected: boolean;
};
