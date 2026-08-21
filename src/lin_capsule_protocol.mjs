import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

export const PROTOCOL_VERSION = 'LIN_CAPSULE/1.0';

export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function sha256(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : Buffer.from(data)).digest('hex');
}

export function compressPayload(bufferOrStr, algorithm = 'brotli') {
  const buf = typeof bufferOrStr === 'string' ? Buffer.from(bufferOrStr, 'utf8') : bufferOrStr;
  if (algorithm === 'brotli') {
    return { data: zlib.brotliCompressSync(buf), compression: 'brotli' };
  } else if (algorithm === 'gzip') {
    return { data: zlib.gzipSync(buf), compression: 'gzip' };
  } else if (algorithm === 'none') {
    return { data: buf, compression: 'none' };
  }
  throw new Error(`Unsupported compression algorithm: ${algorithm}`);
}

export function decompressPayload(buf, algorithm = 'brotli') {
  if (algorithm === 'brotli') {
    return zlib.brotliDecompressSync(buf);
  } else if (algorithm === 'gzip') {
    return zlib.gunzipSync(buf);
  } else if (algorithm === 'none') {
    return buf;
  }
  throw new Error(`Unsupported compression algorithm: ${algorithm}`);
}

export function chunkData(base64Payload, chunkSize = 500) {
  const chunks = [];
  let offset = 0;
  while (offset < base64Payload.length) {
    chunks.push(base64Payload.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks.length > 0 ? chunks : [''];
}
