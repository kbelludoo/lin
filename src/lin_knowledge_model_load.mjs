/**
 * LIN Knowledge Model — Host Loader
 * LIN source: src/lin_knowledge_model.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lin_knowledge_model.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `lin_knowledge_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch {}
  return mod;
}

export const mkKnowledge = (...a) => getMod().mkKnowledge(...a);
export const mkTestSpec = (...a) => getMod().mkTestSpec(...a);
export const mkTestResult = (...a) => getMod().mkTestResult(...a);
export const mkValidationResult = (...a) => getMod().mkValidationResult(...a);
export const classifyDomain = (...a) => getMod().classifyDomain(...a);
export const classifyCategory = (...a) => getMod().classifyCategory(...a);
export const extractKnowledge = (...a) => getMod().extractKnowledge(...a);
export const updateStatus = (...a) => getMod().updateStatus(...a);
export const pickGenerator = (...a) => getMod().pickGenerator(...a);
export const pickOracle = (...a) => getMod().pickOracle(...a);
export function linPath() { return 'src/lin_knowledge_model.lin'; }
