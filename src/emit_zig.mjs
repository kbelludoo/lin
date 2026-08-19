/**
 * LIA/LIN → Zig emitter (MVP).
 */

import { parseLia } from './compiler.mjs';
import { parseStmts, tryParseStmts, collectAssignedIds } from './body_ast.mjs';
import {
  inferTypes,
  emitNilDefaults,
  collectFreeHostIds,
  emitFreeHostDecls,
  rewriteExpr,
  rewriteFnValues,
  isJsRuntimeOnly,
  safeEmitId,
  snakeCase,
  parseParamList,
} from './emit_shared.mjs';
import { emitThrowLine } from './emit_rewrite.mjs';
import { rewriteSafeParamIds, rawParamNames } from './emit_safe_ids_load.mjs';

function zigDefault(ty) {
  if (ty === 'i64' || ty === 'int' || ty === 'i32') return '0';
  if (ty === 'f64' || ty === 'float') return '0.0';
  if (ty === 'bool') return 'false';
  if (ty === 'void' || ty === 'unit') return '';
  if (ty === 'string' || ty === '[]const u8') return '""';
  return 'undefined';
}

function zigType(rawT) {
  const t = String(rawT || '').replace(/\{[^}]*\}/g, '').trim().toLowerCase();
  if (!t || t === 'unit') return 'void';
  if (t === 'int' || t === 'i32' || t === 'i64') return 'i64';
  if (t === 'float' || t === 'f64') return 'f64';
  if (t === 'bool') return 'bool';
  if (t === 'string') return '[]const u8';
  if (t.startsWith('list') || t.startsWith('array') || t.endsWith('[]')) return '[]const u8';
  if (t === 'any' || t === 'mixed') return 'anytype';
  return 'anytype';
}

function zigFnName(raw) {
  return safeEmitId(snakeCase(raw));
}

function zigRetType(fn, bodyStmts) {
  const name = String(fn.name || '').toLowerCase();
  if (name.startsWith('is') || name.startsWith('has') || name.startsWith('can') || name.startsWith('want')) return 'bool';
  if (name.startsWith('toString') || name.startsWith('asstring')) return '[]const u8';

  const rets = [];
  const walk = (list) => {
    for (const st of list || []) {
      if (st.type === 'return' && st.expr) rets.push(String(st.expr).trim());
      if (st.then) walk(st.then);
      for (const e of st.elseIf || []) walk(e.body);
      if (st.else) walk(st.else);
      if (st.type === 'if' && st.else) walk(st.else);
    }
  };
  walk(bodyStmts);

  if (!rets.length) {
    const inferred = inferTypes(bodyStmts || []);
    for (const [id, t] of inferred) {
      if (id === fn.name || id === 'cache' || id === 'result') {
        return zigType(t);
      }
    }
    return 'void';
  }

  const boolish = (s) => /^(true|false)$/.test(s) || /(==|!=|<=|>=|<|>|&&|\|\|)/.test(s);
  if (rets.every(boolish)) return 'bool';
  const numeric = (s) => /^-?\d+$/.test(s) || /^[A-Za-z_][\w]*(\s*[+\-*/%]\s*[A-Za-z_][\w]*)+$/.test(s);
  if (rets.every(numeric)) return 'i64';
  return '[]const u8';
}

function extractParamTypesFromSource(fnName, liaText) {
  const types = {};
  const m = String(liaText).match(new RegExp('\\bfn\\s+' + fnName + '\\s*\\(([^)]*)\\)(?:\\s*->\\s*([A-Za-z_][\\w\\[\\]|]*))?', 'i'));
  if (!m) return types;
  if (m[2]) types['_return'] = m[2].trim();
  const items = (m[1] || '').split(',').map((p) => p.trim()).filter(Boolean);
  for (const item of items) {
    const pm = item.match(/^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_][\w\[\]|]*))?$/);
    if (!pm) continue;
    const cleanName = safeEmitId(pm[1]);
    if (pm[2]) types[cleanName] = pm[2].trim();
  }
  return types;
}

function emitStmts(stmts, indent, types, retType) {
  const pad = '    '.repeat(indent);
  const lines = [];

  for (const st of stmts) {
    if (st.type === 'assign') {
      const id = safeEmitId(st.id);
      const expr = rewriteExpr(st.expr || '', 'zig');
      lines.push(`${pad}${id} = ${expr};`);
    } else if (st.type === 'return') {
      const e = rewriteExpr(st.expr || '', 'zig');
      lines.push(`${pad}return ${e};`);
    } else if (st.type === 'expr') {
      const trimmed = String(st.expr || '').trim();
      if (!trimmed) continue;
      if (/^break$/.test(trimmed)) {
        lines.push(`${pad}break;`);
        continue;
      }
      const e = rewriteExpr(trimmed, 'zig');
      lines.push(`${pad}${e};`);
    } else if (st.type === 'throw') {
      lines.push(emitThrowLine(st.expr, 'zig', pad, rewriteExpr));
    } else if (st.type === 'if') {
      const cond = rewriteExpr(st.cond || '', 'zig');
      lines.push(`${pad}if (${cond}) {`);
      lines.push(...emitStmts(st.then, indent + 1, types, retType));
      for (const e of st.elseIf || []) {
        const c = rewriteExpr(e.cond || '', 'zig');
        lines.push(`${pad}} else if (${c}) {`);
        lines.push(...emitStmts(e.body, indent + 1, types, retType));
      }
      if (st.else) {
        lines.push(`${pad}} else {`);
        lines.push(...emitStmts(st.else, indent + 1, types, retType));
      }
      lines.push(`${pad}}`);
    } else if (st.type === 'for') {
      const initMatch = String(st.init || '').match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
      const stepMatch = String(st.step || '').match(/^([A-Za-z_][\w]*)\+\+$/);
      const cond = String(st.cond || '').trim();
      if (initMatch && stepMatch) {
        const varName = safeEmitId(initMatch[1]);
        const from = rewriteExpr(initMatch[2].trim(), 'zig');
        if (/^([A-Za-z_][\w]*)\s*<=\s*(.+)$/.test(cond)) {
          const m = cond.match(/^([A-Za-z_][\w]*)\s*<=\s*(.+)$/);
          const to = rewriteExpr(m[2].trim(), 'zig');
          lines.push(`${pad}for (${varName} := ${from}; ${varName} <= ${to}; ${varName} += 1) {`);
        } else if (/^([A-Za-z_][\w]*)\s*<\s*(.+)$/.test(cond)) {
          const m = cond.match(/^([A-Za-z_][\w]*)\s*<\s*(.+)$/);
          const to = rewriteExpr(m[2].trim(), 'zig');
          lines.push(`${pad}for (${varName} := ${from}; ${varName} < ${to}; ${varName} += 1) {`);
        } else {
          lines.push(`${pad}// LIA_EMIT_ZIG: fallback while-loop`);
          lines.push(`${pad}var ${varName}: i64 = ${from};`);
          lines.push(`${pad}while (${rewriteExpr(cond, 'zig')}) {`);
          lines.push(`${pad}    defer { ${varName} += 1; }`);
        }
        lines.push(...emitStmts(st.body, indent + 1, types, retType));
        lines.push(`${pad}}`);
      } else {
        lines.push(`${pad}// LIA_EMIT_ZIG: unsupported for-loop`);
      }
    } else if (st.type === 'while') {
      const cond = rewriteExpr(st.cond || '', 'zig');
      if (/^true$/.test(String(st.cond || '').trim())) {
        lines.push(`${pad}while (true) {`);
      } else {
        lines.push(`${pad}while (${cond}) {`);
      }
      lines.push(...emitStmts(st.body, indent + 1, types, retType));
      lines.push(`${pad}}`);
    } else if (st.type === 'match') {
      const matchTarget = rewriteExpr(st.expr || '', 'zig');
      lines.push(`${pad}switch (${matchTarget}) {`);
      for (const arm of st.arms || []) {
        let armPat = String(arm.pat || '_').trim();
        if (armPat === '_' || !armPat) armPat = '_';
        lines.push(`${pad}    ${armPat} => {`);
        lines.push(...emitStmts(arm.body, indent + 2, types, retType));
        lines.push(`${pad}    },`);
      }
      lines.push(`${pad}}`);
    }
  }

  return lines;
}

export function emitZig(liaText, opts = {}) {
  const prog = parseLia(liaText);
  const parts = [
    '// generated by lia multi-emit → zig',
    'const std = @import("std");',
    '',
    'pub fn _lia_typeof(x: anytype) []const u8 { _ = x; return "object"; }',
    'pub fn _lia_num(x: anytype) i64 { _ = x; return 0; }',
    'pub fn _lia_cat(a: []const u8, b: []const u8) []const u8 {',
    '    return std.fmt.allocPrint(std.heap.page_allocator, "{s}{s}", .{ a, b }) catch "";',
    '}',
    '',
  ];

  const aliases = {};
  const used = new Set();
  const zigFnName = (raw) => {
    let n = safeEmitId(snakeCase(raw));
    if (used.has(n)) n = `${n}_u`;
    used.add(n);
    aliases[raw] = n;
    return n;
  };

  for (const fn of prog.fns) {
    const rawNames = rawParamNames(fn.params);
    const { names: params } = parseParamList(fn.params);
    const name = zigFnName(fn.name);

    if (isJsRuntimeOnly(fn.body, fn.name) && opts.stubRuntime !== false) {
      parts.push(`pub fn ${name}() void {}`);
      continue;
    }

    const bodySource = rewriteSafeParamIds(
      rewriteFnValues(fn.body, prog.fns.map((f) => f.name).filter((n) => n !== fn.name), '""'),
      params,
    );

    const bodyStmts = tryParseStmts(bodySource);
    if (!bodyStmts) {
      parts.push(`pub fn ${name}() void {}`);
      continue;
    }

    const declaredTypes = extractParamTypesFromSource(fn.name, liaText);
    const rawRet = declaredTypes['_return'] || zigRetType(fn, bodyStmts);
    const retType = zigType(rawRet);
    const inferred = inferTypes(bodyStmts);

    const matchBindings = new Set();
    const matchConstructors = new Set();
    const collectMatchBindings = (list) => {
      for (const st of list || []) {
        if (st.type === 'match') {
          for (const arm of st.arms || []) {
            const m = String(arm.pat || '').match(/^([A-Za-z_][\w]*)\(([^)]+)\)$/);
            if (m) {
              matchConstructors.add(m[1]);
              for (const b of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
                matchBindings.add(b);
              }
            }
          }
        }
        if (st.then) collectMatchBindings(st.then);
        for (const e of st.elseIf || []) collectMatchBindings(e.body);
        if (st.else) collectMatchBindings(st.else);
        if (st.body) collectMatchBindings(st.body);
      }
    };
    collectMatchBindings(bodyStmts);

    const cleanParams = params.map((p) => {
      const cleanName = safeEmitId(p);
      const declaredType = declaredTypes[cleanName] || '';
      const inferredType = inferred.get(cleanName);
      const ty = declaredType ? zigType(declaredType) : (inferredType ? zigType(inferredType) : 'anytype');
      return `${cleanName}: ${ty}`;
    });

    const forVars = new Set();
    const collectFor = (list) => {
      for (const st of list || []) {
        if (st.type === 'for') {
          const im = String(st.init || '').match(/^([A-Za-z_][\w]*)\s*=/);
          if (im) forVars.add(im[1]);
          collectFor(st.body);
        }
        if (st.type === 'if') {
          collectFor(st.then);
          for (const e of st.elseIf || []) collectFor(e.body);
          if (st.else) collectFor(st.else);
        }
      }
    };
    collectFor(bodyStmts);

    const assigned = collectAssignedIds(bodyStmts).filter(
      (id) => !params.includes(id) && !forVars.has(id) && id !== 'cache' && !matchBindings.has(id),
    );

    const locals = assigned.map((id) => {
      const sid = safeEmitId(id);
      const ty = zigType(inferred.get(id));
      return `    var ${sid}: ${ty} = ${zigDefault(ty)};`;
    });

    const emitted = emitStmts(bodyStmts, 1, inferred, retType);

    const freeHost = emitFreeHostDecls(
      collectFreeHostIds(fn.body, params, [...prog.fns.map((f) => f.name), ...matchConstructors]),
      'zig',
    );
    const bodyLines = [...freeHost, ...locals, ...emitted];

    if (!/\breturn\b/.test(emitted.join('\n')) && retType !== 'void') {
      bodyLines.push(`    return ${zigDefault(retType)};`);
    }

    const paramList = cleanParams.join(', ');
    parts.push(`pub fn ${name}(${paramList}) ${retType} {`);
    parts.push(...bodyLines);
    parts.push('}');
    parts.push('');
  }

  return {
    code: parts.join('\n'),
    lang: 'zig',
    program: prog,
    target: 'zig',
  };
}
