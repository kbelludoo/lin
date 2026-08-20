/**
 * Host loader: LIN source is src/lin_bundle_query.lin
 * LIN Bundle Query — consultável parcial para IA.
 * Does not touch verifier / semantic_hash / behavior_eq nucleus.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lin_bundle_query.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `lin_bundle_query_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  return mod;
}

export const listSymbols = (...a) => getMod().listSymbols(...a);
export const findModule = (...a) => getMod().findModule(...a);
export const findModulesByEffect = (...a) => getMod().findModulesByEffect(...a);
export const resolveDeps = (...a) => getMod().resolveDeps(...a);
export const querySymbol = (...a) => getMod().querySymbol(...a);
export const queryEffect = (...a) => getMod().queryEffect(...a);
export const searchModules = (...a) => getMod().searchModules(...a);
export const partialLoadout = (...a) => getMod().partialLoadout(...a);
export const queryToContext = (...a) => getMod().queryToContext(...a);
export const buildEffectsIndex = (...a) => getMod().buildEffectsIndex(...a);
export const buildTypeIndex = (...a) => getMod().buildTypeIndex(...a);
export const bundleStatsLite = (...a) => getMod().bundleStatsLite(...a);
export function linPath() { return 'src/lin_bundle_query.lin'; }
