/**
 * LIA → TypeScript emitter (typed wrappers over JS body semantics).
 */
import { parseLia } from './compiler.mjs';
import { parseStmts, tryParseStmts, collectAssignedIds } from './body_ast.mjs';
import { emitBanner, isJsRuntimeOnly, rewriteExpr, parseParamList } from './emit_shared.mjs';
import { emitThrowLine } from './emit_rewrite.mjs';

function emitStmts(stmts, indent) {
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const st of stmts) {
    if (st.type === 'assign') {
      lines.push(`${pad}${st.id} ${st.op} ${rewriteExpr(st.expr, 'ts')};`);
    } else if (st.type === 'return') {
      lines.push(`${pad}return ${rewriteExpr(st.expr, 'ts')};`);
    } else if (st.type === 'throw') {
      lines.push(emitThrowLine(st.expr, 'ts', pad, rewriteExpr));
    } else if (st.type === 'expr') {
      if (/^throw\b/.test(st.expr.trim())) lines.push(emitThrowLine(st.expr, 'ts', pad, rewriteExpr));
      else if (/^[A-Za-z_][\w]*$/.test(st.expr.trim())) { /* no-op */ }
      else lines.push(`${pad}${rewriteExpr(st.expr, 'ts')};`);
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
    } else if (st.type === 'while') {
      lines.push(`${pad}while (${rewriteExpr(st.cond, 'ts')}) {`);
      lines.push(...emitStmts(st.body, indent + 1));
      lines.push(`${pad}}`);
    }
  }
  return lines;
}

export function emitTs(liaText, opts = {}) {
  const prog = parseLia(liaText);
  const parts = [emitBanner('ts').replace('/*', '//').replace('*/', '')];
  const fileHosty = opts.stubRuntime !== false;
  if (prog.consts && !fileHosty) {
    const obj = Object.entries(prog.consts)
      .map(([k, v]) => `${JSON.stringify(k)}: ${v}`)
      .join(', ');
    parts.push(`const $K: Record<string, number> = {${obj}};`);
    for (const [k, v] of Object.entries(prog.consts)) parts.push(`const ${k} = ${v};`);
  }
  for (const fn of prog.fns) {
    if (fileHosty || (isJsRuntimeOnly(fn.body, fn.name) && opts.stubRuntime !== false)) {
      parts.push(
        `export function ${fn.name}(_a: unknown, _b: unknown): boolean {\n  throw new Error("LIA_EMIT_TS: JS-runtime-only (${fn.name})");\n}`,
      );
      continue;
    }
    const stmts = tryParseStmts(fn.body);
    if (!stmts) {
      parts.push(
        `export function ${fn.name}(_a: unknown, _b: unknown): boolean {\n  throw new Error("LIA_EMIT_TS: JS-runtime-only (${fn.name})");\n}`,
      );
      continue;
    }
    const { names: params, sigTs } = parseParamList(fn.params);
    const paramList = sigTs.join(', ');
    const locals = collectAssignedIds(stmts).filter((id) => !params.includes(id));
    const bodyLines = [];
    if (locals.length) bodyLines.push(`  let ${locals.join(', ')};`);
    bodyLines.push(...emitStmts(stmts, 1));
    parts.push(`export function ${fn.name}(${paramList}): boolean {\n${bodyLines.join('\n')}\n}`);
  }
  return { code: parts.join('\n'), program: prog, target: 'ts' };
}
