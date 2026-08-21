/**
 * Validates and decodes a LIN Capsule payload from fragmented parts.
 * Enforces GATE A (Integrity) and GATE B (Rehydration & Contract Checking).
 * Never executes code or lowering (Gate C is decoupled).
 *
 * @param {Array<Object>} parts - The fragmented capsule parts
 * @param {Object} policy - Host environment security policy for Gate B
 * @param {Array<string>} policy.allowed_effects - Allowed effect tokens
 * @param {Array<string>} policy.authorized_capabilities - Explicitly authorized capability tokens
 * @returns {Object} { ok: boolean, linobj?: Object, error?: string, gate?: string }
 */
export declare function decodeCapsule(parts: Array<any>, policy?: {
    allowed_effects: Array<string>;
    authorized_capabilities: Array<string>;
}): any;
