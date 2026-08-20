/**
 * LIN Fuzzer Core — Host Loader
 * LIN source: src/lin_fuzzer_core.lin
 * Compiles to TS/Py/Go/Rust/C/Java/Zig/CS
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lin_fuzzer_core.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `lin_fuzzer_core_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch {}
  return mod;
}

export const mkTest = (...a) => getMod().mkTest(...a);
export const mkBug = (...a) => getMod().mkBug(...a);
export const mkReport = (...a) => getMod().mkReport(...a);
export const classifySeverity = (...a) => getMod().classifySeverity(...a);
export const classifyCategory = (...a) => getMod().classifyCategory(...a);
export const extractEffects = (...a) => getMod().extractEffects(...a);
export const hasSub = (...a) => getMod().hasSub(...a);
export const dedup = (...a) => getMod().dedup(...a);
export const strLen = (...a) => getMod().strLen(...a);
export const strSlice = (...a) => getMod().strSlice(...a);
export const strReplace = (...a) => getMod().strReplace(...a);
export const strSplit = (...a) => getMod().strSplit(...a);
export function linPath() { return 'src/lin_fuzzer_core.lin'; }
export function emitAll() {
  const { parseLia } = require('./compiler.mjs');
  const lin = fs.readFileSync(LIN, 'utf8');
  const prog = parseLia(lin);
  const targets = {};
  for (const t of ['py','go','rust','c','java','cs','zig']) {
    try {
      const mod = require(`./emit_${t}.mjs`);
      const fn = mod['emit' + t.charAt(0).toUpperCase() + t.slice(1)];
      targets[t] = String(fn(prog).code);
    } catch { targets[t] = null; }
  }
  return targets;
}
