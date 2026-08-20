/**
 * Host loader: LIN source is src/lin_bundle.lin
 * LIN App Bundle (LINB/1) — pack, unpack, validate.
 * Does not touch verifier / semantic_hash / behavior_eq nucleus.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lin_bundle.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `lin_bundle_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  return mod;
}

export const linbFormat = () => getMod().linbFormat();
export const mkBundle = (...a) => getMod().mkBundle(...a);
export const mkModule = (...a) => getMod().mkModule(...a);
export const mkParam = (...a) => getMod().mkParam(...a);
export const mkContract = (...a) => getMod().mkContract(...a);
export const extractEffects = (...a) => getMod().extractEffects(...a);
export const extractCalls = (...a) => getMod().extractCalls(...a);
export const extractPre = (...a) => getMod().extractPre(...a);
export const extractPost = (...a) => getMod().extractPost(...a);
export const packLinb = (...a) => getMod().packLinb(...a);
export const unpackToLin = (...a) => getMod().unpackToLin(...a);
export const validateBundle = (...a) => getMod().validateBundle(...a);
export const bundleStats = (...a) => getMod().bundleStats(...a);
export function linPath() { return 'src/lin_bundle.lin'; }
