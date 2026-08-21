/**
 * Encodes a LINOBJ into a verified LIN Capsule format with multi-part chunks.
 *
 * @param {Object} linobj - The LINOBJ object containing canonical IR, contracts, provenance, etc.
 * @param {Object} options - Encoding options (compression, chunkSize, etc.)
 * @returns {Array<Object>} List of structured capsule parts ready for transport
 */
export declare function encodeCapsule(linobj: any, options?: any): Array<any>;
