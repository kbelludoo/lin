export declare const LIA_COMPILER_VERSION = "1.0.0";
export declare const AIL_COMPILER_VERSION = "1.0.0";
/**
 * Parse LIN/LIA program. Dual-reads @LIN + legacy @LIA/@AIL headers.
 */
export declare function parseLia(liaText: any): {
    header: any;
    consts: any;
    exports: any[];
    fns: any[];
    enums: any[];
    structs: any[];
    modules: any[];
    uses: any[];
};
/** @deprecated use parseLia */
export declare const parseAil: typeof parseLia;
/**
 * Compile LIA text → JS module source.
 */
export declare function compileLiaToJs(liaText: any, opts?: {}): {
    js: string;
    program: {
        header: any;
        consts: any;
        exports: any[];
        fns: any[];
        enums: any[];
        structs: any[];
        modules: any[];
        uses: any[];
    };
};
/** @deprecated use compileLiaToJs */
export declare const compileAilToJs: typeof compileLiaToJs;
export declare function compileLiaFile(liaPath: any, outPath?: any, opts?: {}): {
    outPath: any;
    js: string;
    program: {
        header: any;
        consts: any;
        exports: any[];
        fns: any[];
        enums: any[];
        structs: any[];
        modules: any[];
        uses: any[];
    };
};
/** @deprecated use compileLiaFile */
export declare const compileAilFile: typeof compileLiaFile;
