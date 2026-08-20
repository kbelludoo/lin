import fs from "fs";
import { randomFillSync } from "crypto";
import { LinSurfaceParser } from "../../../../src/lin_surface_parser.mjs";

// ═══ Benchmark: lin_lz compressor ═══
// The JS implementation below corresponds to the LIN source in source.lin.
// When modifying the algorithm, update BOTH source.lin and this JS implementation.

const PAGE_SIZE = 4096;
const ITERS = 1000;

// ═══ LIN source verification ═══
const linSource = fs.readFileSync(new URL("./source.lin", import.meta.url), "utf8");
const parsed = LinSurfaceParser.parse(linSource);
console.log("LIN parse:", parsed.verification.valid ? "VALID" : "INVALID",
  "| nodes:", Object.keys(parsed.dag.nodes).length,
  "| edges:", parsed.dag.edges.length,
  "| hash:", parsed.hashes.workflow_hash.slice(0, 16) + "...");

// ═══ JS implementation (compiled output of source.lin) ═══

function lin_lz_compress(input) {
  const inputLen = input.length;
  let allZero = true;
  for (let i = 0; i < inputLen; i++) { if (input[i] !== 0) { allZero = false; break; } }
  if (allZero) return Buffer.from([0xFF, (inputLen >> 8) & 0xFF, inputLen & 0xFF]);
  
  const windowSize = 256, minMatch = 4;
  let earlyMatches = 0;
  const checkLen = Math.min(128, inputLen);
  for (let pos = 0; pos < checkLen; pos++) {
    const start = Math.max(0, pos - windowSize);
    for (let j = start; j < pos; j++) {
      let ml = 0;
      while (pos + ml < inputLen && input[j + ml] === input[pos + ml] && ml < 8) ml++;
      if (ml >= minMatch) { earlyMatches++; break; }
    }
  }
  if (earlyMatches < 2) {
    const out = Buffer.alloc(inputLen + 3);
    out[0] = 0xFE; out[1] = (inputLen >> 8) & 0xFF; out[2] = inputLen & 0xFF;
    input.copy(out, 3); return out;
  }
  
  const output = []; let pos = 0, litStart = 0;
  function flushLits(endPos) {
    const litLen = endPos - litStart;
    if (litLen === 0) return;
    let off = 0;
    while (off < litLen) {
      const chunkLen = Math.min(128, litLen - off);
      output.push((chunkLen - 1) & 0x7F);
      for (let k = 0; k < chunkLen; k++) output.push(input[litStart + off + k]);
      off += chunkLen;
    }
  }
  
  const HASH_SIZE = 256;
  const head = new Int16Array(HASH_SIZE).fill(-1);

  while (pos < inputLen) {
    let bestLen = 0, bestDist = 0;
    if (pos + 4 <= inputLen) {
      const h = ((input[pos] ^ (input[pos+1] << 2) ^ (input[pos+2] << 4) ^ (input[pos+3] << 6))) & (HASH_SIZE - 1);
      const cand = head[h];
      head[h] = pos;
      if (cand !== -1 && (pos - cand) <= windowSize && (pos - cand) > 0) {
        let ml = 0;
        while (pos + ml < inputLen && input[cand + ml] === input[pos + ml] && ml < 67) ml++;
        if (ml >= minMatch) {
          bestLen = Math.min(ml, 67);
          bestDist = pos - cand;
        }
      }
    }
    if (bestLen >= minMatch) {
      flushLits(pos);
      output.push(0x80 | ((bestLen - minMatch) & 0x3F));
      output.push((bestDist >> 8) & 0xFF); output.push(bestDist & 0xFF);
      pos += bestLen; litStart = pos;
    } else { pos++; }
  }
  flushLits(pos);
  return Buffer.from(output);
}

// decompress function — FROZEN, do not modify
function lin_lz_decompress(compressed, expectedLen) {
  if (compressed[0] === 0xFF) {
    const len = (compressed[1] << 8) | compressed[2];
    return Buffer.alloc(len, 0);
  }
  if (compressed[0] === 0xFE) {
    const len = (compressed[1] << 8) | compressed[2];
    return compressed.slice(3, 3 + len);
  }
  const output = []; let i = 0;
  while (i < compressed.length) {
    const ctrl = compressed[i++];
    if (ctrl & 0x80) {
      const matchLen = (ctrl & 0x3F) + 4;
      const dist = (compressed[i] << 8) | compressed[i + 1];
      i += 2;
      const srcPos = output.length - dist;
      for (let k = 0; k < matchLen; k++) output.push(output[srcPos + k]);
    } else {
      const litCount = (ctrl & 0x7F) + 1;
      for (let k = 0; k < litCount; k++) output.push(compressed[i++]);
    }
  }
  return Buffer.from(output);
}

// ═══ Test pages ═══
const testPages = {
  "zero_filled": Buffer.alloc(PAGE_SIZE, 0),
  "text_repetitive": (() => {
    const buf = Buffer.alloc(PAGE_SIZE);
    const text = "The quick brown fox jumps over the lazy dog. ";
    for (let i = 0; i < PAGE_SIZE; i++) buf[i] = text.charCodeAt(i % text.length);
    return buf;
  })(),
  "random_data": (() => {
    const buf = Buffer.alloc(PAGE_SIZE);
    for (let i = 0; i < PAGE_SIZE; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  })(),
  "mixed_structured": (() => {
    const buf = Buffer.alloc(PAGE_SIZE);
    for (let i = 0; i < 1024; i++) buf[i] = 0;
    for (let i = 1024; i < 2048; i++) buf[i] = (i % 17) & 0xFF;
    for (let i = 2048; i < 3072; i++) buf[i] = (i & 0xFF);
    for (let i = 3072; i < 4096; i++) buf[i] = ((i * 7 + 13) ^ (i >> 3)) & 0xFF;
    return buf;
  })(),
  "high_entropy": (() => { const buf = Buffer.alloc(PAGE_SIZE); randomFillSync(buf); return buf; })()
};

// ═══ Run benchmark ═══
console.log("\n--- Benchmark Results ---");
const results = {};
let allParity = true;

for (const [pageName, pageData] of Object.entries(testPages)) {
  const comp = lin_lz_compress(pageData);
  const decomp = lin_lz_decompress(comp, PAGE_SIZE);
  let parity = decomp.length === PAGE_SIZE;
  if (parity) { for (let i = 0; i < PAGE_SIZE; i++) { if (decomp[i] !== pageData[i]) { parity = false; break; } } }
  if (!parity) allParity = false;
  
  const cStart = process.hrtime.bigint();
  for (let i = 0; i < ITERS; i++) lin_lz_compress(pageData);
  const cEnd = process.hrtime.bigint();
  const compNs = Number(cEnd - cStart) / ITERS;
  
  const ratio = PAGE_SIZE / comp.length;
  results[pageName] = { compress_ns: compNs.toFixed(1), ratio: ratio.toFixed(2), parity };
  console.log(`  ${pageName.padEnd(18)} comp: ${compNs.toFixed(1).padStart(10)} ns | ratio: ${ratio.toFixed(2).padStart(6)}x | parity: ${parity ? "OK" : "FAIL"}`);
}

console.log(`\n  All parity: ${allParity ? "OK" : "FAIL"}`);

// Output JSON for parsing
const summary = { all_parity: allParity, results, lin_valid: parsed.verification.valid };
fs.writeFileSync(new URL("./result.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log("\n  Results saved to result.json");