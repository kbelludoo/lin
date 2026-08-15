/**
 * Shared helpers for LIA multi-target emitters.
 * @typedef {{type:'assign', id:string, op:string, expr:string}} AssignStmt
 * @typedef {{type:'return', expr:string}} ReturnStmt
 * @typedef {{type:'expr', expr:string}} ExprStmt
 * @typedef {{type:'throw', expr:string}} ThrowStmt
 * @typedef {{type:'if', cond:string, then:Stmt[], elseIf:{cond:string,body:Stmt[]}[], else:Stmt[]|null}} IfStmt
 * @typedef {{type:'for', init:string, cond:string, step:string, body:Stmt[]}} ForStmt
 * @typedef {{type:'while', cond:string, body:Stmt[]}} WhileStmt
 * @typedef {AssignStmt|ReturnStmt|ExprStmt|ThrowStmt|IfStmt|ForStmt|WhileStmt} Stmt
 */

import { rewriteHostExpr, rewriteIifeTernary, rewriteTernaries, foldPlus } from './emit_rewrite.mjs';

export const TARGETS = ['js', 'ts', 'py', 'go', 'rust', 'c', 'java'];

export function snakeCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/** Split LIN/JS param lists; strip `size=21` so Go/Rust/Java/C signatures stay valid. */
export function parseParamList(raw) {
  const items = String(raw || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const names = [];
  const defaults = [];
  const sigPy = [];
  const sigTs = [];
  for (const item of items) {
    const m = item.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (m) {
      names.push(m[1]);
      defaults.push({ name: m[1], value: m[2].trim() });
      sigPy.push(`${m[1]}=${m[2].trim()}`);
      sigTs.push(`${m[1]}: unknown = ${m[2].trim()}`);
    } else {
      const id = item.replace(/\?$/, '').replace(/:\s*[\w[\]|]+$/, '').trim() || item;
      names.push(id);
      sigPy.push(id);
      sigTs.push(`${id}: unknown`);
    }
  }
  return { names, defaults, sigPy, sigTs };
}

export function emitNilDefaults(defaults, target) {
  return (defaults || []).map(({ name, value }) => {
    if (target === 'go') return `\tif ${name} == nil { ${name} = ${value} }`;
    if (target === 'java' && /^["']/.test(value)) return `    if (${name} == null) ${name} = ${value};`;
    if (target === 'c' && /^["']/.test(value)) return `  if (!${name}) ${name} = ${value};`;
    return null;
  }).filter(Boolean);
}

/** Detect JS-runtime-only surface (Buffer/crypto) — stub on non-JS targets. */
export function isJsRuntimeOnly(body) {
  return /\b(Buffer|crypto|bufferAllocUnsafe|timingSafeEqual|process)\b/.test(body);
}

/** Sibling fn used as a value (not a call) — stub so Rust/Java compile. */
export function rewriteFnValues(body, fnNames, stub) {
  let s = String(body || '');
  for (const name of fnNames || []) {
    if (!/^[A-Za-z_][\w]*$/.test(name)) continue;
    s = s.replace(new RegExp(`\\b${name}\\b(?!\\s*\\()`, 'g'), stub);
  }
  return s;
}

export function isNumishId(id) {
  return /^(len|n|i|idx|count|num|ms|msAbs)$/i.test(String(id || ''));
}

export function inferTypes(stmts) {
  const types = new Map();
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const st of stmts || []) {
      if (st.type === 'assign' && st.op === '=') {
        const rhs = String(st.expr || '').trim();
        let t = null;
        if (/\.to_string\s*\(\)|String\s*\(|"[^"]*"|'[^']*'/.test(rhs)) t = 'string';
        else if (/\/.+\/[gimsuy]*|\b_lia_re_exec\b/.test(rhs)) t = 'string';
        else if (/==|!=|<=|>=|<|>/.test(rhs)) t = 'bool';
        else if (/\b(length|len|is_empty|Math\.abs|Math\.round|_lia_abs|_lia_round|_lia_num|parseFloat)\b/.test(rhs)) t = 'int';
        else if (/[+\-*/%|&^]/.test(rhs)) t = 'int';
        else if (/^[A-Za-z_][\w]*$/.test(rhs) && types.has(rhs)) t = types.get(rhs);
        if (t && types.get(st.id) !== t) {
          types.set(st.id, t);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return types;
}

export function isStringishId(id) {
  const s = String(id || '');
  if (isNumishId(s)) return false;
  return /^(str|ch|pad|fmt|s|key|name|cache|match|unit|matchUnit|value|id|alphabet|urlAlphabet)$/i.test(s) || /str|fmt|ch|pad|alphabet/i.test(s);
}

function asBoolCond(rewritten, target) {
  const t = String(rewritten || '').trim();
  if (!t) return t;
  if (/true|false|is_empty|_lia_empty|_lia_falsy|_lia_truthy|==|!=|<=|>=|<|>/.test(t)) return t;
  if (target === 'go' || target === 'c' || target === 'java' || target === 'rust') return `(${t}) != 0`;
  return t;
}

export function emitCond(cond, target) {
  let t = String(cond || '').trim();
  t = t.replace(/\b([A-Za-z_][\w]*)--\s*>\s*0/g, '$1 > 0');
  t = t.replace(/\b([A-Za-z_][\w]*)--/g, '$1 != 0');
  if (t === 'true') {
    if (target === 'c') return '1';
    if (target === 'go') return 'true';
    return 'true';
  }
  if (/^[A-Za-z_][\w]*$/.test(t) && isNumishId(t)) {
    if (target === 'go') return `_lia_num(${t})!=0`;
    if (target === 'rust' || target === 'java' || target === 'c') return `${t} != 0`;
  }
  return asBoolCond(rewriteExpr(t, target), target);
}

export function assignOpLine(id, op, expr, target, pad, types) {
  const rhs = rewriteExpr(expr, target);
  const rhsId = /^[A-Za-z_][\w]*$/.test(String(rhs).trim()) ? String(rhs).trim() : null;
  const idType = types?.get(id);
  if (op === '=') {
    if (target === 'rust' && /^".*"$/.test(String(rhs).trim())) {
      return `${pad}${id} = ${rhs}.to_string();`;
    }
    if (target === 'rust' && (idType === 'String' || idType === 'string') && rhsId) {
      return `${pad}${id} = ${rhsId}.clone();`;
    }
    return `${pad}${id} = ${rhs}${target === 'go' ? '' : ';'}`;
  }
  if (op === '+=') {
    if (isNumishId(id)) {
      if (target === 'go') return `${pad}${id} = _lia_num(${id}) + _lia_num(${rhs})`;
      if (target === 'rust') return `${pad}${id} = ${id} + (${rhs});`;
      return `${pad}${id} += ${rhs};`;
    }
    if (target === 'go') return `${pad}${id} = _lia_cat(${id}, ${rhs})`;
    if (target === 'rust') return `${pad}${id} = format!("{}{}", &${id}, &${rhs});`;
    if (target === 'c') return `${pad}${id} = _lia_cat_c(${id}, ${rhs});`;
    return `${pad}${id} = ${id} + ${rhs};`;
  }
  const bin = op.endsWith('=') ? op.slice(0, -1) : op;
  if (target === 'go') return `${pad}${id} = _lia_num(${id}) ${bin} _lia_num(${rhs})`;
  if (target === 'rust') return `${pad}${id} = ${id} ${bin} ${rhs};`;
  return `${pad}${id} ${op} ${rhs};`;
}

/** JS `while (++i < n)` → increment then compare (Go/Rust have no prefix ++ in cond). */
export function splitPrefixIncCond(cond) {
  const m = String(cond || '').match(/^\+\+([A-Za-z_][\w]*)\s*([<>]=?)\s*([\s\S]+)$/);
  if (!m) return null;
  return { id: m[1], op: m[2], rhs: m[3].trim() };
}

function rewriteTemplateLiterals(s, target) {
  return String(s || '').replace(/`([^`]*)`/g, (_, inner) => {
    const parts = [];
    let last = 0;
    const re = /\$\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(inner))) {
      if (m.index > last) parts.push(JSON.stringify(inner.slice(last, m.index)));
      parts.push(m[1]);
      last = m.index + m[0].length;
    }
    if (last < inner.length) parts.push(JSON.stringify(inner.slice(last)));
    if (!parts.length) return '""';
    if (target === 'go') return parts.reduce((a, b) => `_lia_cat(${a},${b})`);
    if (target === 'c') return parts.reduce((a, b) => `_lia_cat_c(${a},${b})`);
    if (target === 'rust') return parts.reduce((a, b) => `format!("{}{}", &${a}, &${b})`);
    return parts.join(' + ');
  });
}

function stripJsArrowIife(s) {
  let t = String(s || '');
  if (/\bNumber\.isFinite\b/.test(t) && (t.includes('=>') || t.includes('__c'))) {
    const m = t.match(/Number\.isFinite\s*\(\s*([A-Za-z_][\w]*)\s*\)/);
    if (m) return `_lia_isfinite(${m[1]})`;
    const plus = t.match(/\+\s*([A-Za-z_][\w]*)/);
    if (plus) return `_lia_isfinite(${plus[1]})`;
  }
  t = t.replace(/\bNumber\.isFinite\b(?!\s*\()/g, 'true');
  return t;
}

function stubClosureExpr(target) {
  if (target === 'go') return 'nil';
  if (target === 'rust') return 'String::new()';
  if (target === 'java') return 'null';
  if (target === 'c') return '0';
  if (target === 'py') return 'None';
  if (target === 'ts') return '(() => "")';
  return null;
}

export function rewriteExpr(expr, target) {
  let s = String(expr || '');
  if (/~\(|=>/.test(s)) {
    const stub = stubClosureExpr(target);
    if (stub != null) return stub;
  }
  if (target === 'js' || target === 'ts') {
    s = rewriteIifeTernary(s);
    s = s.replace(/!==/g, '!==');
    s = s.replace(/!=(?!\s*(?:null|undefined)\b)/g, '!==');
    s = s.replace(/(^|[^=!<>])==(?!=)(?!\s*(?:null|undefined)\b)/g, '$1===');
    return s;
  }
  s = rewriteHostExpr(s, target);
  s = stripJsArrowIife(s);
  s = s.replace(/\?\./g, '.');
  s = s.replace(/\?\?/g, '||');
  s = rewriteTemplateLiterals(s, target);
  s = s.replace(/\bArray\s*\(([^)]*)\)\s*\.\s*join\s*\(([^)]*)\)/g, '_lia_str($2)');
  s = s.replace(
    /([A-Za-z_][\w]*)\.(?!length\b|trim\b|charCodeAt\b|indexOf\b|includes\b)([A-Za-z_][\w]*)\b(?!\s*\()/g,
    target === 'rust' ? '_lia_get(&$1,"$2")' : '_lia_get($1,"$2")',
  );
  let prevObj;
  do {
    prevObj = s;
    s = s.replace(/\{[^{}]*\}/g, '_lia_obj()');
  } while (s !== prevObj);
  s = s.replace(/\b([A-Za-z_][\w]*)\s*-\s*\1\b/g, '0');
  if (target === 'py') {
    s = s.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
    s = s.replace(/!(?!=)/g, 'not ');
    s = s.replace(/\btypeof\s+([A-Za-z_][\w]*)/g, '_lia_typeof($1)');
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisNaN\s*\(/g, '_lia_isnan(');
    s = s.replace(/===/g, '==').replace(/!==/g, '!=');
    s = s.replace(/\bString\(([^)]+)\)/g, 'str($1)');
    s = s.replace(/\bNumber\(([^)]+)\)/g, 'float($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.length\b/g, 'len($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.trim\s*\(\s*\)/g, '$1.strip()');
    s = s.replace(/([A-Za-z_][\w]*)\.charCodeAt\(([^)]+)\)/g, 'ord($1[$2])');
    s = s.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
    s = s.replace(/\bnull\b/g, 'None').replace(/\bundefined\b/g, 'None');
    return rewriteTernaries(s, (c, a, b) => `(${a} if ${c} else ${b})`);
  }
  if (target === 'go') {
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/_lia_falsy\(([A-Za-z_][\w]*)\)&&\1!=0/g, '_lia_falsy($1)');
    s = s.replace(/!(?!=)([A-Za-z_][\w]*)\b(?!\s*\()/g, '_lia_falsy($1)');
    s = s.replace(/''/g, '""');
    s = s.replace(/'([^']*)'/g, (_, inner) => JSON.stringify(inner));
    s = s.replace(
      /\b([A-Za-z_][\w]*)\s*\|\|\s*([A-Za-z_][\w]*|"(?:\\.|[^"\\])*")/g,
      '_lia_or($1,$2)',
    );
    s = s.replace(/\btypeof\s+([A-Za-z_][\w]*)/g, '_lia_typeof($1)');
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisNaN\s*\(/g, '_lia_isnan(');
    s = s.replace(/===/g, '==').replace(/!==/g, '!=');
    s = s.replace(/\bString\(([^)]+)\)/g, '_lia_str($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.length\b/g, '_lia_len($1)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*-\s*_lia_len\(/g, '_lia_num($1)-_lia_len(');
    s = s.replace(/([A-Za-z_][\w]*)\.trim\s*\(\s*\)/g, '_lia_str($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.charCodeAt\(([^)]+)\)/g, 'int($1[$2])');
    s = s.replace(/\btrue\b/g, 'true').replace(/\bfalse\b/g, 'false');
    s = s.replace(/\bcache\[([^\]]+)\]/g, 'cache[_lia_num($1)]');
    s = s.replace(/\b([A-Za-z_][\w]*)\[([^\]]+)\]/g, '_lia_at($1,$2)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*&\s*/g, '_lia_num($1) & ');
    s = s.replace(/\bnull\b|\bundefined\b/g, 'nil');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*(<=|>=|<|>|==|!=)\s*(-?\d+)/g, '_lia_num($1) $2 $3');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*\/\s*([A-Za-z_][\w]*)\b/g, '_lia_num($1)/_lia_num($2)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*\*\s*(\d+\.\d+)/g, '_lia_f64($1)*$2');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*(<=|>=|<|>)\s*([A-Za-z_][\w]*)\b(?!\s*\()/g, '_lia_num($1) $2 _lia_num($3)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*(<=|>=|<|>)\s*(_lia_f64\([^)]+\)\s*\*\s*\d+\.\d+)/g, '_lia_f64($1) $2 $3');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*==\s*("(?:\\.|[^"\\])*")/g, '_lia_str($1)==$2');
    s = s.replace(/!_lia_get\(([^)]+)\)/g, '_lia_falsy(_lia_get($1))');
    s = rewriteTernaries(s, (c, a, b) => `_lia_if(${c},${a},${b})`);
    let prevGo;
    do {
      prevGo = s;
      s = s.replace(
        /((?:_lia_cat\([^()]*\)|_lia_str\([^)]+\)|_lia_round\([^)]+\)|\([^()]+\)|[A-Za-z_][\w]*\[[^\]]+\]|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))\s*\+\s*((?:_lia_cat\([^()]*\)|_lia_str\([^)]+\)|_lia_round\([^)]+\)|\([^()]+\)|[A-Za-z_][\w]*\[[^\]]+\]|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))/g,
        '_lia_cat($1,$2)',
      );
    } while (s !== prevGo);
    s = s.replace(
      /\(?(_lia_round\(_lia_num\([^)]+\)\s*\/\s*_lia_num\([^)]+\)\))\)?\s*\+\s*("(?:\\.|[^"\\])*")/g,
      '_lia_cat($1,$2)',
    );
    return s;
  }
  if (target === 'java') {
    s = s.replace(/!([A-Za-z_][\w]*)\s*&&\s*\1\s*!==?\s*0/g, '_lia_empty($1)');
    s = s.replace(/\btypeof\s+([A-Za-z_][\w]*)/g, '_lia_typeof($1)');
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/([A-Za-z_][\w]*)\.trim\s*\(\s*\)/g, '$1.trim()');
    s = s.replace(/===/g, '==').replace(/!==/g, '!=');
    s = s.replace(/\bnull\b|\bundefined\b/g, 'null');
    s = s.replace(/'([^']*)'/g, (_, inner) => JSON.stringify(inner));
    s = s.replace(
      /([A-Za-z_][\w]*)\s*\|\|\s*("(?:\\.|[^"\\])*")/g,
      '(_lia_empty($1) ? $2 : $1)',
    );
    s = s.replace(/\bString\(([^)]+)\)/g, 'String.valueOf($1)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*\/\s*([A-Za-z_][\w]*)\b/g, '_lia_num($1)/_lia_num($2)');
    s = s.replace(/([A-Za-z_][\w]*)\.length\b(?!\s*\()/g, 'String.valueOf($1).length()');
    s = s.replace(/\bparseInt\s*\(\s*([A-Za-z_$][\w]*)\s*,\s*10\s*\)/g, 'Long.parseLong($1)');
    s = s.replace(/\bcache\[([^\]]+)\]/g, 'cache[(int)($1)]');
    s = s.replace(/\b([A-Za-z_][\w]*)\[([^\]]+)\]/g, '_lia_at($1,$2)');
    s = s.replace(/!_lia_get\(([^)]+)\)/g, '!_lia_truthy(_lia_get($1))');
    s = s.replace(/_lia_get\(([^)]+)\)\s*\?/g, '_lia_truthy(_lia_get($1)) ?');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*!=\s*0\b/g, (_, id) => (
      isNumishId(id) ? `${id} != 0` : `_lia_empty(${id})`
    ));
    s = s.replace(/\b([A-Za-z_][\w]*)\s*==\s*0\b/g, (_, id) => (
      isNumishId(id) ? `${id} == 0` : `_lia_empty(${id})`
    ));
    s = rewriteTernaries(s, (c, a, b) => {
      const cond = /_lia_get\(/.test(c) ? `_lia_truthy(${c})` : c;
      return `(${cond} ? ${a} : ${b})`;
    });
    let prevJ;
    do {
      prevJ = s;
      s = s.replace(
        /((?:String\.valueOf\([^)]+\)|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))\s*\+\s*((?:String\.valueOf\([^)]+\)|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))/g,
        (m, a, b) => (
          isNumishId(a) || isNumishId(b) ? m : `String.valueOf(${a})+String.valueOf(${b})`
        ),
      );
    } while (s !== prevJ);
    s = s.replace(
      /\(?(_lia_round\(_lia_num\([^)]+\)\s*\/\s*_lia_num\([^)]+\)\))\)?\s*\+\s*("(?:\\.|[^"\\])*")/g,
      'String.valueOf($1)+$2',
    );
    return s;
  }
  if (target === 'c') {
    s = s.replace(/!([A-Za-z_][\w]*)\s*&&\s*\1\s*!=\s*0/g, '($1 == NULL || $1[0] == 0)');
    s = s.replace(/'([^']*)'/g, (_, inner) => JSON.stringify(inner));
    s = s.replace(/\btypeof\s+([A-Za-z_][\w]*)/g, '_lia_typeof($1)');
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/===/g, '==').replace(/!==/g, '!=');
    s = s.replace(/\btrue\b/g, '1').replace(/\bfalse\b/g, '0');
    s = s.replace(/\bnull\b|\bundefined\b/g, 'NULL');
    s = s.replace(/\bparseInt\s*\(\s*([A-Za-z_][\w]*)\s*,\s*10\s*\)/g, 'strtoll($1, NULL, 10)');
    s = s.replace(/([A-Za-z_][\w]*)\.indexOf\(([^)]+)\)\s*>=\s*0/g, 'strstr($1, $2)');
    s = s.replace(/([A-Za-z_][\w]*)\.includes\(([^)]+)\)/g, 'strstr($1, $2)');
    s = s.replace(/\bMath\.floor\s*\(([^)]+)\)/g, '($1)');
    s = s.replace(/\bString\(([^)]+)\)/g, '(const char *)($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.length\b/g, '(long long)strlen($1)');
    s = s.replace(/([A-Za-z_][\w]*)\.trim\s*\(\s*\)/g, '$1');
    s = s.replace(/\b_lia_sprintf\s*\(/g, '_lia_sprintf_ll(');
    let prevC;
    do {
      prevC = s;
      s = s.replace(
        /((?:_lia_cat_c\([^()]*\)|[A-Za-z_][\w]*\[[^\]]+\]|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))\s*\+\s*((?:_lia_cat_c\([^()]*\)|[A-Za-z_][\w]*\[[^\]]+\]|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))/g,
        '_lia_cat_c($1,$2)',
      );
    } while (s !== prevC);
    return s;
  }
  if (target === 'rust') {
    s = s.replace(/'([^']*)'/g, (_, inner) => JSON.stringify(inner));
    s = s.replace(
      /([A-Za-z_][\w]*)\s*\|\|\s*("(?:\\.|[^"\\])*"|[A-Za-z_][\w]*)/g,
      'if $1.is_empty() { $2.to_string() } else { $1.clone() }',
    );
    s = s.replace(/\.is_empty\(\)\s*&&\s*[A-Za-z_][\w]*\s*!=\s*0/g, '.is_empty()');
    s = s.replace(/\bNumber\.isFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/!(?!=)([A-Za-z_][\w]*)\b(?!\s*\()/g, '$1.is_empty()');
    s = s.replace(/\btypeof\s+([A-Za-z_][\w]*)/g, '_lia_typeof(&$1)');
    s = s.replace(/\bisFinite\s*\(/g, '_lia_isfinite(');
    s = s.replace(/\bisNaN\s*\(/g, '_lia_isnan(');
    s = s.replace(/===/g, '==').replace(/!==/g, '!=');
    s = s.replace(/\bString\(([^)]+)\)/g, '$1.to_string()');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*\*\s*1\.5\b/g, '($1*3/2)');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*\/\s*([A-Za-z_][\w]*)\b/g, '_lia_num($1)/_lia_num($2)');
    s = s.replace(/\b_lia_abs\(([^)&][^)]*)\)/g, '_lia_abs(&$1)');
    s = s.replace(/\b_lia_num\(([^)&][^)]*)\)/g, '_lia_num(&$1)');
    s = s.replace(/\b_lia_isfinite\(([^)&][^)]*)\)/g, '_lia_isfinite(&$1)');
    s = s.replace(/([A-Za-z_][\w]*)\.length\b/g, '$1.len() as i64');
    s = s.replace(/([A-Za-z_][\w]*)\.trim\s*\(\s*\)/g, '$1.trim()');
    s = s.replace(/([A-Za-z_][\w]*)\.charCodeAt\(([^)]+)\)/g, '$1.as_bytes()[$2 as usize] as i64');
    s = s.replace(/\btrue\b/g, 'true').replace(/\bfalse\b/g, 'false');
    s = s.replace(/\b([A-Za-z_][\w]*)\s*!=\s*0\b/g, (_, id) => (
      isNumishId(id) || !isStringishId(id) ? `${id} != 0` : `!${id}.is_empty()`
    ));
    s = s.replace(/\b([A-Za-z_][\w]*)\s*==\s*0\b/g, (_, id) => (
      isNumishId(id) || !isStringishId(id) ? `${id} == 0` : `${id}.is_empty()`
    ));
    s = s.replace(/\bcache\[([^\]]+)\]/g, '_lia_cache_get(&cache, $1)');
    s = s.replace(/\b([A-Za-z_][\w]*)\[([^\]]+)\]/g, '_lia_at(&$1,$2)');
    s = s.replace(/!_lia_get\(([^)]+)\)/g, '_lia_get($1).is_empty()');
    s = s.replace(/_lia_get\(_lia_get\(/g, '_lia_get(&_lia_get(');
    s = s.replace(/\(_lia_str\(([^)]+)\)\)/g, '_lia_str($1)');
    s = rewriteTernaries(s, (c, a, b) => {
      const cond = /_lia_get\(/.test(c) ? `!${c}.is_empty()` : c;
      return `(if ${cond} { ${a} } else { ${b} })`;
    });
    s = s.replace(/\bnull\b|\bundefined\b/g, 'None');
    let prevRs;
    do {
      prevRs = s;
      s = s.replace(
        /((?:_lia_cat\([^()]*\)|_lia_str\([^)]+\)|_lia_round\([^)]+\)|_lia_cache_get\([^)]+\)|\([^()]+\)|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))\s*\+\s*((?:_lia_cat\([^()]*\)|_lia_str\([^)]+\)|_lia_round\([^)]+\)|_lia_cache_get\([^)]+\)|\([^()]+\)|[A-Za-z_][\w]*|"(?:\\.|[^"\\])*"))/g,
        '_lia_cat(&$1,&$2)',
      );
    } while (s !== prevRs);
    let prevRsFold;
    do {
      prevRsFold = s;
      s = s.replace(
        /(_lia_cat\([^)]*(?:\([^)]*\)[^)]*)*\))\s*\+\s*(_lia_cat\([^)]*(?:\([^)]*\)[^)]*)*\))/g,
        '_lia_cat(&$1,&$2)',
      );
    } while (s !== prevRsFold);
    s = s.replace(
      /\(?(_lia_round\(_lia_num\([^)]+\)\s*\/\s*_lia_num\([^)]+\)\))\)?\s*\+\s*("(?:\\.|[^"\\])*")/g,
      '_lia_cat(&$1,&$2)',
    );
    s = foldPlus(s, (a, b) => `_lia_cat(&(${a}),&(${b}))`);
    return s;
  }
  return s;
}

export function defaultOutPath(inPath, target) {
  const ext = { js: '.js', ts: '.ts', py: '.py', go: '.go', rust: '.rs', c: '.c', java: '.java' }[target] || `.${target}`;
  const base = String(inPath).replace(/\.(lia|ail|lin)$/i, '');
  return `${base}.compiled${ext}`;
}

export function emitBanner(target) {
  return `/* generated by lia multi-emit → ${target} */`;
}
