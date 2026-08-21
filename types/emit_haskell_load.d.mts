export declare function emitHaskell(liaText: any, opts?: {}): {
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
