/**
 * Host loader: LIN source is src/clone_lin_full_repo_gate.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from '../src/compiler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIN = path.join(ROOT, 'src', 'clone_lin_full_repo_gate.lin');
const lin = fs.readFileSync(LIN, 'utf8');
const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
const tmp = path.join(os.tmpdir(), 'lin_full_repo_gate.cjs');
fs.writeFileSync(tmp, js, 'utf8');
const mod = createRequire(import.meta.url)(tmp);
try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }

export const normalizeSkipToFail = mod.normalizeSkipToFail;
export const fileCoverage = mod.fileCoverage;
export const missedExtracts = mod.missedExtracts;
export const canPublishFullRepo = mod.canPublishFullRepo;
