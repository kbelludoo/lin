/**
 * LIA/LIN → Zig emitter (MVP).
 */
export declare function emitZig(liaText: any, opts?: {}): {
    code: string;
    lang: string;
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
