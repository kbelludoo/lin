/**
 * LIN Task Engine — Host Loader
 * LIN source: src/lin_task_engine.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lin_task_engine.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `lin_task_engine_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch {}
  return mod;
}

export const mkTask = (...a) => getMod().mkTask(...a);
export const mkTaskBoard = (...a) => getMod().mkTaskBoard(...a);
export const nextId = (...a) => getMod().nextId(...a);
export const addTask = (...a) => getMod().addTask(...a);
export const getTask = (...a) => getMod().getTask(...a);
export const claim = (...a) => getMod().claim(...a);
export const implement = (...a) => getMod().implement(...a);
export const verify = (...a) => getMod().verify(...a);
export const review = (...a) => getMod().review(...a);
export const certify = (...a) => getMod().certify(...a);
export const fail = (...a) => getMod().fail(...a);
export const createFollowup = (...a) => getMod().createFollowup(...a);
export const tasksByStage = (...a) => getMod().tasksByStage(...a);
export const tasksByAgent = (...a) => getMod().tasksByAgent(...a);
export const boardSummary = (...a) => getMod().boardSummary(...a);
export const fromBug = (...a) => getMod().fromBug(...a);
export const toJsonTask = (...a) => getMod().toJsonTask(...a);
export const validTransition = (...a) => getMod().validTransition(...a);
export function linPath() { return 'src/lin_task_engine.lin'; }
