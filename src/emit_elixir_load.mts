/**
 * Emit Elixir — Host Loader
 * LIN source: src/emit_elixir.lin
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from './compiler.mjs';
import { parseLia } from './compiler.mjs';
import { tryParseStmts, collectAssignedIds } from './body_ast.mjs';
import {
  isJsRuntimeOnly, rewriteExpr, emitCond, assignOpLine,
  isNumishId, isStringishId, isBoolishId, parseParamList,
  emitNilDefaults, inferTypes, isNoopExpr, safeEmitId, emitNameMap,
  collectFreeHostIds, emitFreeHostDecls, isBoolFnName,
} from './emit_shared.mjs';

const LIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'emit_elixir.lin');
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
  const tmp = path.join(os.tmpdir(), `emit_elixir_${process.pid}.cjs`);
  fs.writeFileSync(tmp, patched, 'utf8');
  mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  return mod;
}

export function emitElixir(liaText, opts = {}) {
  const raw = getMod().emitElixir(liaText);
  const parsed = JSON.parse(raw);
  const prog = parseLia(liaText);
  return { code: parsed.code, program: prog, target: 'elixir' };
}
