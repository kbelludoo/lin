export declare function emitKotlin(liaText: any, opts?: {}): {
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
export declare function kotlinType(...a: any[]): any;
export declare function kotlinRetType(...a: any[]): any;
export declare function kotlinDefaultInit(...a: any[]): any;
export declare function emitKStmts(...a: any[]): any;
export declare function emitKFn(...a: any[]): any;
export declare function linPath(): string;
