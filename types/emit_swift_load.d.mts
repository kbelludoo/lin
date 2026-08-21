export declare function emitSwift(liaText: any, opts?: {}): {
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
export declare function swiftType(...a: any[]): any;
export declare function swiftRetType(...a: any[]): any;
export declare function swiftDefaultInit(...a: any[]): any;
export declare function emitSStmts(...a: any[]): any;
export declare function emitSFn(...a: any[]): any;
export declare function linPath(): string;
