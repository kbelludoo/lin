/**
 * LIA multi-target compile dispatcher.
 * Default target = ts (LIN defaultEmitTarget). Stub langs are not PASS.
 */
import fs from 'node:fs';
import { parseLia } from './compiler.mjs';
import { assertDivProof } from './lin_refine_div_load.mjs';
import { emitJs } from './emit_js.mjs';
import { emitTs } from './emit_ts.mjs';
import { emitPy } from './emit_py.mjs';
import { emitGo } from './emit_go.mjs';
import { emitRust } from './emit_rust.mjs';
import { emitC } from './emit_c.mjs';
import { emitJava } from './emit_java.mjs';
import { TARGETS, DEFAULT_EMIT_TARGET, defaultOutPath, STUB_TARGETS, REAL_TARGETS } from './emit_shared.mjs';

export { TARGETS, DEFAULT_EMIT_TARGET, defaultOutPath, REAL_TARGETS };

export function compileLia(liaText, opts = {}) {
  const target = String(opts.target || DEFAULT_EMIT_TARGET).toLowerCase();
  if (STUB_TARGETS.includes(target)) {
    throw new Error(`experimental_not_PASS:${target}; real=${REAL_TARGETS.join('|')}; default=${DEFAULT_EMIT_TARGET}`);
  }
  if (!REAL_TARGETS.includes(target)) {
    throw new Error(`LIA_EMIT_TARGET: unsupported ${target}; want ${REAL_TARGETS.join('|')} (default ${DEFAULT_EMIT_TARGET})`);
  }
  if (opts.skipRefineProof !== true) {
    assertDivProof(liaText, parseLia(liaText));
  }
  if (target === 'ts') return emitTs(liaText, opts);
  if (target === 'js') return emitJs(liaText, opts);
  if (target === 'py') return emitPy(liaText, opts);
  if (target === 'go') return emitGo(liaText, opts);
  if (target === 'c') return emitC(liaText, opts);
  if (target === 'java') return emitJava(liaText, opts);
  return emitRust(liaText, opts);
}

export function compileLiaToTargetFile(liaPath, outPath = null, opts = {}) {
  const target = String(opts.target || DEFAULT_EMIT_TARGET).toLowerCase();
  const lia = fs.readFileSync(liaPath, 'utf8');
  const result = compileLia(lia, { ...opts, target });
  const dest = outPath || defaultOutPath(liaPath, target);
  fs.writeFileSync(dest, result.code, 'utf8');
  return { outPath: dest, ...result };
}
