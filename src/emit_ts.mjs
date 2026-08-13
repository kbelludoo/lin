/**
 * LIA → TypeScript emitter (typed wrappers over JS body semantics).
 */
import { parseLia } from './compiler.mjs';
import { parseStmts, collectAssignedIds } from './body_ast.mjs';
import { emitBanner, isJsRuntimeOnly, rewriteExpr } from './emit_shared.mjs';

function emitStmts(stmts, indent) {
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const st of stmts) {
    if (st.type === 'assign') {
      lines.push(`${pad}${st.id} ${st.op} ${rewriteExpr(st.expr, 'ts')};`);
    } else if (st.type === 'return') {
      lines.push(`${pad}return ${rewriteExpr(st.expr, 'ts')};`);
    } else if (st.type === 'expr') {
      lines.push(`${pad}${rewriteExpr(st.expr, 'ts')};`);
    } else if (st.type === 'if') {
      lines.push(`${pad}if (${rewriteExpr(st.cond, 'ts')}) {`);
      lines.push(...emitStmts(st.then, indent + 1));
      for (const e of st.elseIf || []) {
        lines.push(`${pad}} else if (${rewriteExpr(e.cond, 'ts')}) {`);
        lines.push(...emitStmts(e.body, indent + 1));
      }
      if (st.else) {
        lines.push(`${pad}} else {`);
        lines.push(...emitStmts(st.else, indent + 1));
      }
      lines.push(`${pad}}`);
    } else if (st.type === 'for') {
      lines.push(
        `${pad}for (${rewriteExpr(st.init, 'ts')}; ${rewriteExpr(st.cond, 'ts')}; ${rewriteExpr(st.step, 'ts')}) {`,
      );
      lines.push(...emitStmts(st.body, indent + 1));
      lines.push(`${pad}}`);
    }
  }
  return lines;
}

export function emitTs(liaText, opts = {}) {
  const prog = parseLia(liaText);
  const parts = [emitBanner('ts').replace('/*', '//').replace('*/', '')];
  if (prog.consts) {
    const obj = Object.entries(prog.consts)
      .map(([k, v]) => `${JSON.stringify(k)}: ${v}`)
      .join(', ');
    parts.push(`const $K: Record<string, number> = {${obj}};`);
  }
  for (const fn of prog.fns) {
    if (isJsRuntimeOnly(fn.body) && opts.stubRuntime !== false) {
      parts.push(
        `export function ${fn.name}(_a: unknown, _b: unknown): boolean {\n  throw new Error("LIA_EMIT_TS: JS-runtime-only (${fn.name})");\n}`,
      );
      continue;
    }
    const stmts = parseStmts(fn.body);
    const params = fn.params
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const paramList = params.map((p) => `${p}: unknown`).join(', ');
    const locals = collectAssignedIds(stmts).filter((id) => !params.includes(id));
    const bodyLines = [];
    if (locals.length) bodyLines.push(`  let ${locals.join(', ')};`);
    bodyLines.push(...emitStmts(stmts, 1));
    parts.push(`export function ${fn.name}(${paramList}): boolean {\n${bodyLines.join('\n')}\n}`);
  }
  return { code: parts.join('\n'), program: prog, target: 'ts' };
}
