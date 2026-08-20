/**
 * LIN Bundle Compress — pipeline de compactação em camadas.
 *
 * A filosofia:
 *   LIN IR semântico JÁ É compactação. Brotli é o passo final.
 *
 * Pipeline:
 *   LIN source
 *     ↓  (parse + canonicalize)
 *   LIN IR normalizado
 *     ↓  (HashCons + dedup de corpos idênticos)
 *   LIN IR deduplicado
 *     ↓  (serialização紧凑a)
 *   JSON紧凑o
 *     ↓  (compressor: Brotli/Zstd/gzip/LZ4)
 *   bytes comprimidos
 *     ↓  (Base64URL)
 *   string transportável
 *
 * Benchmark mostra que o mérito é do LIN + Brotli juntos, não de cada um sozinho.
 */
import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { gzipSync, gunzipSync } from 'node:zlib';
import { deflateSync, inflateSync } from 'node:zlib';
import { serializeLinb, deserializeLinb, LINB_FORMAT_VERSION } from './lin_bundle.mjs';
import { contentHash } from './content_hash.mjs';

/**
 * Normalizar um bundle LINB para serialização紧凑a.
 * Remove campos redundantes, ordena chaves, dedup corpos idênticos via HashCons.
 */
export function normalizeForCompression(bundle) {
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }

  const hashCons = new Map();
  const normalized = {
    f: LINB_FORMAT_VERSION,
    n: bundle.app?.name || '',
    v: bundle.app?.version || '',
    h: bundle.semantic_hash || '',
    sh: bundle.source_header || '',
    m: (bundle.modules || []).map((m) => {
      const bodyHash = m.semantic_hash || '';
      const conserved = hashCons.has(bodyHash);
      hashCons.set(bodyHash, (hashCons.get(bodyHash) || 0) + 1);

      return {
        i: m.id,
        s: {
          p: (m.signature?.params || []).map((p) => [p.name, p.type]),
          r: m.signature?.returns || 'any',
        },
        e: m.effects || [],
        c: m.calls || [],
        ct: m.contracts || { pre: [], post: [] },
        h: bodyHash,
        ...(conserved ? {} : { bl: m.body_length || 0 }),
      };
    }),
    sy: (bundle.symbols || []).map((s) => [s.name, s.hash, s.effects]),
    ty: (bundle.types || []).map((t) => [t.name, t.usages]),
    ef: (bundle.effects || []).map((e) => [e.name, e.modules]),
    ct: (bundle.contracts || []).map((c) => [c.module, c.pre, c.post]),
    ex: bundle.exports || [],
    en: bundle.entrypoints || [],
    co: bundle.consts || null,
    hc: Object.fromEntries(hashCons),
  };

  return normalized;
}

/**
 * Desnormalizar um bundle compacto de volta ao formato LINB completo.
 */
export function denormalizeBundle(compact) {
  const modules = (compact.m || []).map((m) => ({
    id: m.i,
    kind: 'function',
    signature: {
      params: (m.s?.p || []).map(([name, type]) => ({ name, type })),
      returns: m.s?.r || 'any',
    },
    effects: m.e || [],
    calls: m.c || [],
    contracts: m.ct || { pre: [], post: [] },
    semantic_hash: m.h || '',
    body_length: m.bl || 0,
  }));

  return {
    format: LINB_FORMAT_VERSION,
    app: { name: compact.n || '', version: compact.v || '' },
    semantic_hash: compact.h || '',
    source_header: compact.sh || '',
    modules,
    symbols: (compact.sy || []).map(([name, hash, effects]) => ({ name, hash, effects })),
    types: (compact.ty || []).map(([name, usages]) => ({ name, usages })),
    effects: (compact.ef || []).map(([name, modules]) => ({ name, modules })),
    contracts: (compact.ct || []).map(([module, pre, post]) => ({ module, pre, post })),
    dependencies: {},
    entrypoints: compact.en || [],
    ai_manifest: null,
    consts: compact.co || null,
    exports: compact.ex || [],
  };
}

// ─── Compressores ──────────────────────────────────────────────

const BROTLI_PARAMS = {
  params: {
    [require('node:zlib').constants.BROTLI_PARAM_MODE]: require('node:zlib').constants.BROTLI_MODE_TEXT,
    [require('node:zlib').constants.BROTLI_PARAM_QUALITY]: 11,
    [require('node:zlib').constants.BROTLI_PARAM_SIZE_HINT]: 0,
  },
};

function compressBrotli(data) {
  return brotliCompressSync(data, BROTLI_PARAMS);
}

function decompressBrotli(data) {
  return brotliDecompressSync(data);
}

function compressGzip(data) {
  return gzipSync(data, { level: 9 });
}

function decompressGzip(data) {
  return gunzipSync(data);
}

function compressDeflate(data) {
  return deflateSync(data, { level: 9 });
}

function decompressDeflate(data) {
  return inflateSync(data);
}

/**
 * Zstd via Node.js v24 nativo.
 */
function compressZstd(data) {
  const { zstdCompressSync } = require('node:zlib');
  return zstdCompressSync(data);
}

function decompressZstd(data) {
  const { zstdDecompressSync } = require('node:zlib');
  return zstdDecompressSync(data);
}

export const COMPRESSORS = {
  brotli: { compress: compressBrotli, decompress: decompressBrotli, label: 'Brotli' },
  gzip: { compress: compressGzip, decompress: decompressGzip, label: 'Gzip' },
  deflate: { compress: compressDeflate, decompress: decompressDeflate, label: 'Deflate' },
  zstd: { compress: compressZstd, decompress: decompressZstd, label: 'Zstd' },
};

/**
 * Empacotar bundle LINB completo: normalize → serialize → compress → base64url.
 */
export function packCompressed(bundle, opts = {}) {
  const compressor = opts.compressor || 'brotli';
  const impl = COMPRESSORS[compressor];
  if (!impl) throw new Error(`COMPRESSOR_UNKNOWN: ${compressor}`);

  const compact = normalizeForCompression(bundle);
  const json = JSON.stringify(compact);
  const inputBytes = Buffer.byteLength(json, 'utf8');

  const compressed = impl.compress(Buffer.from(json, 'utf8'));
  const outputBytes = compressed.length;

  const b64url = compressed
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    data: b64url,
    compressor,
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    ratio: outputBytes / Math.max(inputBytes, 1),
    saved_pct: Math.round((1 - outputBytes / Math.max(inputBytes, 1)) * 100),
  };
}

/**
 * Desempacotar: base64url → decompress → denormalize → bundle LINB.
 */
export function unpackCompressed(b64url, opts = {}) {
  const compressor = opts.compressor || 'brotli';
  const impl = COMPRESSORS[compressor];
  if (!impl) throw new Error(`COMPRESSOR_UNKNOWN: ${compressor}`);

  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  const compressed = Buffer.from(b64, 'base64');
  const json = impl.decompress(compressed).toString('utf8');
  const compact = JSON.parse(json);

  return denormalizeBundle(compact);
}

/**
 * URL-safe pack: gera URL completa com hash.
 */
export function packToUrl(bundle, opts = {}) {
  const base = opts.baseUrl || 'https://lin.app';
  const compressor = opts.compressor || 'brotli';
  const result = packCompressed(bundle, { compressor });
  const sha = createHash('sha256').update(result.data).digest('hex').slice(0, 8);

  return {
    url: `${base}/#LINB1:${result.compressor}:${sha}:${result.data}`,
    compressor: result.compressor,
    input_bytes: result.input_bytes,
    output_bytes: result.output_bytes,
    ratio: result.ratio,
    saved_pct: result.saved_pct,
    hash: sha,
  };
}

/**
 * Extrair dados de uma URL LINB.
 */
export function unpackFromUrl(url) {
  const m = String(url).match(/#LINB1:([a-z]+):([a-f0-9]{8}):(.+)$/);
  if (!m) throw new Error('LINB_URL_INVALID');

  return unpackCompressed(m[3], { compressor: m[1] });
}
