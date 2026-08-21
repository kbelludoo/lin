export declare const PROTOCOL_VERSION = "LIN_CAPSULE/1.0";
export declare function canonicalJson(obj: any): any;
export declare function sha256(data: any): string;
export declare function compressPayload(bufferOrStr: any, algorithm?: string): {
    data: any;
    compression: string;
};
export declare function decompressPayload(buf: any, algorithm?: string): any;
export declare function chunkData(base64Payload: any, chunkSize?: number): any[];
