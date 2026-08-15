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
function isOverloadOrNestedFn(src, name) {
  const s = String(src || '');
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(s))) {
    let depth = 0;
    let quote = null;
    for (let i = 0; i < m.index; i++) {
      const c = s[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth > 0) continue;
    let i = m.index + m[0].length - 1;
    let d = 0;
    for (; i < s.length; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') {
        d--;
        if (d === 0) {
          i++;
          break;
        }
      }
    }
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === ':') {
      while (i < s.length && s[i] !== '{' && s[i] !== ';') i++;
    }
    if (s[i] === ';') continue;
    if (s[i] === '{') return false;
  }
  return true;
}

export function missedExtracts(text, fns) {
  const raw = mod.missedExtracts(text, fns) || [];
  return raw.filter((row) => !isOverloadOrNestedFn(text, row.name));
}
export const canPublishFullRepo = mod.canPublishFullRepo;
export const isTypeOnlyModule = mod.isTypeOnlyModule;
