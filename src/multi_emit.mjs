/**
 * LIA multi-target compile dispatcher.
 * Spec: spec/LIA_MULTI_EMIT.dicel
 */
import fs from 'node:fs';
import { emitJs } from './emit_js.mjs';
import { emitTs } from './emit_ts.mjs';
import { emitPy } from './emit_py.mjs';
import { emitGo } from './emit_go.mjs';
import { emitRust } from './emit_rust.mjs';
import { TARGETS, defaultOutPath } from './emit_shared.mjs';

export { TARGETS, defaultOutPath };

export function compileLia(liaText, opts = {}) {
  const target = String(opts.target || 'js').toLowerCase();
  if (!TARGETS.includes(target)) {
    throw new Error(`LIA_EMIT_TARGET: unsupported ${target}; want ${TARGETS.join('|')}`);
  }
  if (target === 'js') return emitJs(liaText, opts);
  if (target === 'ts') return emitTs(liaText, opts);
  if (target === 'py') return emitPy(liaText, opts);
  if (target === 'go') return emitGo(liaText, opts);
  return emitRust(liaText, opts);
}

export function compileLiaToTargetFile(liaPath, outPath = null, opts = {}) {
  const target = String(opts.target || 'js').toLowerCase();
  const lia = fs.readFileSync(liaPath, 'utf8');
  const result = compileLia(lia, opts);
  const dest = outPath || defaultOutPath(liaPath, target);
  fs.writeFileSync(dest, result.code, 'utf8');
  return { outPath: dest, ...result };
}
