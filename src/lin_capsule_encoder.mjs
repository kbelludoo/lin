/**
 * LIN Capsule Encoder
 * Packs .linobj or LIN source into canonical, compressed, multi-part capsules.
 */
import zlib from 'node:zlib';
import {
  CAPSULE_PROTOCOL_NAME,
  CAPSULE_VERSION,
  CAPSULE_HEADER_PREFIX,
  computeSha256,
  toBase64Url
} from './lin_capsule_protocol.mjs';
import { buildLinobj } from './linobj.mjs';

/**
 * Compresses a buffer or string using the specified algorithm.
 */
export function compressData(data, compression = 'brotli') {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  if (compression === 'brotli') {
    return zlib.brotliCompressSync(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11
      }
    });
  }
  if (compression === 'deflate') {
    return zlib.deflateSync(buf, { level: 9 });
  }
  if (compression === 'gzip') {
    return zlib.gzipSync(buf, { level: 9 });
  }
  if (compression === 'raw') {
    return buf;
  }
  throw new Error(`Unsupported compression: ${compression}`);
}

/**
 * Packs a .linobj (or raw LIN source code) into a multi-part verifiable capsule.
 *
 * @param {Object|string} input - Either a valid .linobj object or a LIN source string
 * @param {Object} options - Configuration options
 * @returns {Object} { manifest, rawCapsule, parts, urlHash }
 */
export function packCapsule(input, options = {}) {
  const compression = options.compression || 'brotli';
  const target = options.target || 'portable';
  const maxChunkSize = options.maxChunkSize || 1800; // standard safe URL fragment size

  let linobj = null;
  if (typeof input === 'string') {
    linobj = buildLinobj(input);
  } else if (typeof input === 'object' && input !== null) {
    linobj = input;
  } else {
    throw new Error('packCapsule requires a LIN source string or a linobj object');
  }

  // Canonical JSON serialization of the artifact
  const canonicalArtifactJson = JSON.stringify(linobj);
  const artifactSha256 = computeSha256(canonicalArtifactJson);

  // Compress payload
  const compressedBuffer = compressData(canonicalArtifactJson, compression);
  const payloadBase64Url = toBase64Url(compressedBuffer);

  // Split into chunks if needed
  const chunks = [];
  if (payloadBase64Url.length <= maxChunkSize) {
    chunks.push(payloadBase64Url);
  } else {
    for (let i = 0; i < payloadBase64Url.length; i += maxChunkSize) {
      chunks.push(payloadBase64Url.slice(i, i + maxChunkSize));
    }
  }

  // Compute chunk-level checksums
  const partChecksums = chunks.map((c) => computeSha256(c));

  // Build canonical capsule manifest
  const manifest = {
    protocol: CAPSULE_PROTOCOL_NAME,
    version: CAPSULE_VERSION,
    artifact_kind: 'linobj',
    compression,
    encoding: 'base64url',
    parts: chunks.length,
    part_checksums: partChecksums,
    semantic_hash: linobj.semantic_hash,
    workflow_hash: linobj.lowering_metadata?.workflow_hash || linobj.semantic_hash,
    artifact_sha256: artifactSha256,
    capabilities: linobj.effect_manifest ? Object.keys(linobj.effect_manifest) : [],
    effects: linobj.effect_manifest || {},
    invariants_verified: linobj.invariant_report?.verified !== false,
    target
  };

  const manifestJson = JSON.stringify(manifest);
  const manifestBase64Url = toBase64Url(manifestJson);

  // Format parts according to @capsule:v1 protocol
  const formattedParts = chunks.map((chunk, idx) => {
    return `${CAPSULE_HEADER_PREFIX}:${manifestBase64Url}:[${idx + 1}/${chunks.length}]:${chunk}`;
  });

  // Single monolithic representation for single-url transport
  const monolithicCapsule = `${CAPSULE_HEADER_PREFIX}:${manifestBase64Url}:${chunks.join('.')}`;

  return {
    manifest,
    manifestBase64Url,
    parts: formattedParts,
    rawCapsule: monolithicCapsule,
    urlFragment: `#${monolithicCapsule}`,
    artifactSha256,
    semanticHash: linobj.semantic_hash
  };
}

/**
 * Splits a monolithic capsule string into multi-part volume strings.
 */
export function splitCapsule(monolithicCapsule, maxChunkSize = 1800) {
  const parts = monolithicCapsule.split(':');
  if (parts.length < 3 || parts[0] !== CAPSULE_HEADER_PREFIX) {
    throw new Error('Invalid capsule header format');
  }
  const manifestBase64 = parts[1];
  const payload = parts.slice(2).join(':'); // handles dot-joined chunks or raw string
  const cleanPayload = payload.replace(/\./g, '');

  const chunks = [];
  for (let i = 0; i < cleanPayload.length; i += maxChunkSize) {
    chunks.push(cleanPayload.slice(i, i + maxChunkSize));
  }

  return chunks.map((chunk, idx) => {
    return `${CAPSULE_HEADER_PREFIX}:${manifestBase64}:[${idx + 1}/${chunks.length}]:${chunk}`;
  });
}
