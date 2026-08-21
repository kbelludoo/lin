export declare function emitCpp(liaText: any, opts?: {}): {
    code: any;
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
    target: string;
};
export declare function cppType(...a: any[]): any;
export declare function cppRetType(...a: any[]): any;
export declare function cppDefaultInit(...a: any[]): any;
export declare function emitCStmts(...a: any[]): any;
export declare function emitCFn(...a: any[]): any;
export declare function linPath(): string;
