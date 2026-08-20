/**
 * LIN Capsule Protocol Definition & Types (V1)
 *
 * Implements a portable, verifiable, executable semantic memory format
 * inspired by multi-volume URL capsules with cryptographic integrity guarantees.
 */
import { createHash } from 'node:crypto';

export const CAPSULE_PROTOCOL_NAME = 'LIN_CAPSULE';
export const CAPSULE_VERSION = 1;
export const CAPSULE_HEADER_PREFIX = '@capsule:v1';

export const SUPPORTED_COMPRESSIONS = ['brotli', 'deflate', 'gzip', 'raw'];
export const SUPPORTED_ENCODINGS = ['base64url'];

export function computeSha256(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return createHash('sha256').update(buf).digest('hex');
}

export function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function fromBase64Url(str) {
  return Buffer.from(str, 'base64url');
}
