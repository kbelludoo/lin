/**
 * LIN Capsule Decoder & Verifier
 * Reconstructs, validates, verifies hashes, and unpacks .linobj from capsule volumes.
 */
import zlib from 'node:zlib';
import {
  CAPSULE_PROTOCOL_NAME,
  CAPSULE_VERSION,
  CAPSULE_HEADER_PREFIX,
  SUPPORTED_COMPRESSIONS,
  computeSha256,
  fromBase64Url
} from './lin_capsule_protocol.mjs';
import { computeModuleSemanticHash } from './linobj.mjs';

/**
 * Decompresses raw buffer based on compression type.
 */
export function decompressData(buf, compression = 'brotli') {
  if (compression === 'brotli') {
    return zlib.brotliDecompressSync(buf);
  }
  if (compression === 'deflate') {
    return zlib.inflateSync(buf);
  }
  if (compression === 'gzip') {
    return zlib.gunzipSync(buf);
  }
  if (compression === 'raw') {
    return buf;
  }
  throw new Error(`Unsupported decompression algorithm: ${compression}`);
}

/**
 * Joins multi-part capsule volumes into a verified, canonical reconstructed payload.
 *
 * @param {Array<string>} partStrings - Array of formatted @capsule:v1 parts
 * @returns {Object} { manifest, payloadBase64Url, manifestBase64Url }
 */
export function joinCapsule(partStrings) {
  if (!Array.isArray(partStrings) || partStrings.length === 0) {
    throw new Error('No capsule parts provided');
  }

  let expectedManifestBase64 = null;
  let manifest = null;
  let totalParts = -1;
  const collectedChunks = [];

  for (let i = 0; i < partStrings.length; i++) {
    const raw = String(partStrings[i]).trim();
    if (!raw.startsWith(CAPSULE_HEADER_PREFIX + ':')) {
      throw new Error(`Invalid capsule part prefix: ${raw.slice(0, 20)}`);
    }

    const rest = raw.slice(CAPSULE_HEADER_PREFIX.length + 1);
    const tokens = rest.split(':');

    if (tokens.length < 3) {
      throw new Error(`Malformed multi-part capsule chunk format at index ${i}`);
    }

    const manifestBase64 = tokens[0];
    const partTag = tokens[1]; // e.g. "[1/3]"
    const chunkData = tokens.slice(2).join(':');

    // Verify manifest consistency across parts
    if (expectedManifestBase64 === null) {
      expectedManifestBase64 = manifestBase64;
      try {
        const manifestJson = fromBase64Url(manifestBase64).toString('utf8');
        manifest = JSON.parse(manifestJson);
      } catch (err) {
        throw new Error(`Corrupted capsule manifest JSON: ${err.message}`);
      }

      if (manifest.protocol !== CAPSULE_PROTOCOL_NAME) {
        throw new Error(`Unsupported protocol: ${manifest.protocol}`);
      }
      if (manifest.version !== CAPSULE_VERSION) {
        throw new Error(`Unsupported protocol version: ${manifest.version}`);
      }
      if (!SUPPORTED_COMPRESSIONS.includes(manifest.compression)) {
        throw new Error(`Unsupported compression: ${manifest.compression}`);
      }
      totalParts = manifest.parts;
    } else if (expectedManifestBase64 !== manifestBase64) {
      throw new Error(`Manifest mismatch between chunk ${i} and chunk 0`);
    }

    // Parse part index "[k/N]"
    const match = partTag.match(/^\[(\d+)\/(\d+)\]$/);
    if (!match) {
      throw new Error(`Invalid part tag format: ${partTag}`);
    }
    const partIndex = parseInt(match[1], 10);
    const declaredTotal = parseInt(match[2], 10);

    if (declaredTotal !== totalParts) {
      throw new Error(`Part total discrepancy: declared ${declaredTotal}, manifest expected ${totalParts}`);
    }
    if (partIndex < 1 || partIndex > totalParts) {
      throw new Error(`Part index out of bounds: ${partIndex} of ${totalParts}`);
    }

    // Validate chunk SHA-256 against manifest checksums if present
    if (manifest.part_checksums && manifest.part_checksums[partIndex - 1]) {
      const actualChunkSha = computeSha256(chunkData);
      const expectedChunkSha = manifest.part_checksums[partIndex - 1];
      if (actualChunkSha !== expectedChunkSha) {
        throw new Error(`Corrupted chunk ${partIndex}: checksum mismatch`);
      }
    }

    if (collectedChunks[partIndex - 1] !== undefined) {
      throw new Error(`Duplicate part received: [${partIndex}/${totalParts}]`);
    }

    collectedChunks[partIndex - 1] = chunkData;
  }

  // Verify all parts are present (no missing chunks)
  if (collectedChunks.length !== totalParts || collectedChunks.some((c) => c === undefined)) {
    throw new Error(`Incomplete capsule: received ${partStrings.length} of ${totalParts} required parts`);
  }

  const payloadBase64Url = collectedChunks.join('');
  return {
    manifest,
    payloadBase64Url,
    manifestBase64Url: expectedManifestBase64
  };
}

/**
 * Unpacks a capsule (either monolithic string, URL fragment, or array of parts) into a validated .linobj.
 *
 * @param {string|Array<string>} input - Raw monolithic capsule, URL string with #, or array of parts
 * @param {Object} options - Verification options
 * @returns {Object} Reconstructed .linobj
 */
export function unpackCapsule(input, options = {}) {
  let manifest = null;
  let payloadBase64Url = null;

  if (Array.isArray(input)) {
    const joined = joinCapsule(input);
    manifest = joined.manifest;
    payloadBase64Url = joined.payloadBase64Url;
  } else if (typeof input === 'string') {
    let clean = input.trim();
    if (clean.startsWith('#')) {
      clean = clean.slice(1);
    }
    if (clean.includes('lin.run/#')) {
      clean = clean.split('lin.run/#')[1];
    }

    if (!clean.startsWith(CAPSULE_HEADER_PREFIX + ':')) {
      throw new Error(`Invalid capsule header prefix: ${clean.slice(0, 20)}`);
    }

    const rest = clean.slice(CAPSULE_HEADER_PREFIX.length + 1);
    const tokens = rest.split(':');

    const manifestBase64 = tokens[0];
    const rawPayload = tokens.slice(1).join(':');

    try {
      const manifestJson = fromBase64Url(manifestBase64).toString('utf8');
      manifest = JSON.parse(manifestJson);
    } catch (err) {
      throw new Error(`Corrupted capsule manifest JSON: ${err.message}`);
    }

    if (manifest.protocol !== CAPSULE_PROTOCOL_NAME) {
      throw new Error(`Unsupported protocol: ${manifest.protocol}`);
    }
    if (manifest.version !== CAPSULE_VERSION) {
      throw new Error(`Unsupported protocol version: ${manifest.version}`);
    }

    // Handles dot-joined chunks or direct base64url payload
    payloadBase64Url = rawPayload.replace(/\./g, '');

    // Validate chunk hashes if manifest contains part_checksums
    if (manifest.part_checksums && manifest.part_checksums.length > 0) {
      const parts = rawPayload.split('.');
      if (parts.length === manifest.part_checksums.length) {
        for (let i = 0; i < parts.length; i++) {
          const actualSha = computeSha256(parts[i]);
          if (actualSha !== manifest.part_checksums[i]) {
            throw new Error(`Tampered payload: chunk ${i + 1} checksum mismatch`);
          }
        }
      }
    }
  } else {
    throw new Error('unpackCapsule requires a string or array of part strings');
  }

  // 1. Decompress Payload
  const compressedBuf = fromBase64Url(payloadBase64Url);
  let decompressedBuf;
  try {
    decompressedBuf = decompressData(compressedBuf, manifest.compression);
  } catch (err) {
    throw new Error(`Payload decompression failed (${manifest.compression}): ${err.message}`);
  }

  const artifactJson = decompressedBuf.toString('utf8');

  // 2. Cryptographic Verification: H_artifact (SHA-256)
  const actualArtifactSha256 = computeSha256(artifactJson);
  if (manifest.artifact_sha256 && actualArtifactSha256 !== manifest.artifact_sha256) {
    throw new Error(`Tampered payload: artifact SHA-256 mismatch (expected ${manifest.artifact_sha256}, got ${actualArtifactSha256})`);
  }

  // 3. Parse Reconstructed .linobj
  let linobj = null;
  try {
    linobj = JSON.parse(artifactJson);
  } catch (err) {
    throw new Error(`Corrupted reconstructed artifact JSON: ${err.message}`);
  }

  // 4. Semantic Verification: H_semantic (Lexical-Invariant AST Hash)
  if (manifest.semantic_hash && linobj.semantic_hash !== manifest.semantic_hash) {
    throw new Error(`Forged semantic hash: manifest declared ${manifest.semantic_hash}, artifact has ${linobj.semantic_hash}`);
  }

  // Deep verification: recompute semantic hash from internal canonical functions if requested
  if (options.deepSemanticVerify !== false && linobj.canonical_ir) {
    const fns = linobj.canonical_ir.functions || linobj.canonical_ir.fns || [];
    const consts = linobj.canonical_ir.consts || {};
    const exports = linobj.canonical_ir.exports || [];
    const recomputedHash = computeModuleSemanticHash(fns, consts, exports);
    if (recomputedHash !== linobj.semantic_hash) {
      throw new Error(`Semantic hash integrity failure: recomputed ${recomputedHash} vs artifact ${linobj.semantic_hash}`);
    }
  }

  return linobj;
}

/**
 * Validates the cryptographic and semantic integrity of a capsule without throwing exceptions.
 */
export function verifyCapsule(input, options = {}) {
  try {
    const linobj = unpackCapsule(input, options);
    return {
      valid: true,
      semanticHash: linobj.semantic_hash,
      formatVersion: linobj.format_version,
      invariantsVerified: linobj.invariant_report?.verified !== false
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}
