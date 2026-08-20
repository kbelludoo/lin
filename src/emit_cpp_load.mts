/**
 * Emit C++ — Host Loader
 * LIN source: src/emit_cpp.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';
import { parseLia } from './compiler.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'emit_cpp.lin');
let mod = null;

function getMod() {
  if (mod) return mod;
  const lin = fs.readFileSync(LIN, 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple', formalGate: false });
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const bridge = `
    const parseLia = require('${path.join(srcDir, 'compiler.mjs')}').parseLia;
    const tryParseStmts = require('${path.join(srcDir, 'body_ast.mjs')}').tryParseStmts;
    const collectAssignedIds = require('${path.join(srcDir, 'body_ast.mjs')}').collectAssignedIds;
    const { isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine,
            isNumishId, isStringishId, isBoolishId, parseParamList,
            emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
            collectFreeHostIds, emitFreeHostDecls, isBoolFnName } = require('${path.join(srcDir, 'emit_shared.mjs')}');
  `;
  const patched = bridge + '\n' + js;
  const tmp = path.join(os.tmpdir(), `emit_cpp_${process.pid}.cjs`);
  fs.writeFileSync(tmp, patched, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  return mod;
}

export function emitCpp(liaText, opts = {}) {
  const raw = getMod().emitCpp(liaText);
  const parsed = JSON.parse(raw);
  const prog = parseLia(liaText);
  return { code: parsed.code, program: prog, target: 'cpp' };
}

export function cppType(...a) { return getMod().cppType(...a); }
export function cppRetType(...a) { return getMod().cppRetType(...a); }
export function cppDefaultInit(...a) { return getMod().cppDefaultInit(...a); }
export function emitCStmts(...a) { return getMod().emitCStmts(...a); }
export function emitCFn(...a) { return getMod().emitCFn(...a); }
export function linPath() { return 'src/emit_cpp.lin'; }
