export declare function emitPy(liaText: any, opts?: {}): {
    code: string;
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
