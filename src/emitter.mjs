/**
 * LIA emitter (ex-AIL) — default compact Dicel-for-AI IR.
 * Spec: LIA.dicel + LIA_CODE_LANG_SPEC.dicel
 *
 * Paths:
 *   source JS/TS-ish → LIA (preferred compact path)
 *   PROJECT.dicel L0 → LIA (named_only, strip_tests, L0-op desugar)
 *
 * Lossy. Does not overwrite L0 archive.
 * Headers: emit @LIA; compiler dual-reads @AIL/@LIA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIA_VERSION = '0.2';
export const LIA_HEADER = `@LIA:L1c:${LIA_VERSION}`;
export const AIL_VERSION = LIA_VERSION; // backcompat alias
export const AIL_HEADER = LIA_HEADER; // backcompat alias (value is @LIA)

const DEFAULT_OPS = 'strip_tests+sigil_ops+named_only+const_table';
const GRAMMAR = '~G{?=if #=for ^=ret :else}';

const BYTES_K = '$K{b=1 kb=1024 mb=1048576 gb=1073741824 tb=1099511627776 pb=1125899906842624}';

const OP_INFIX = {
  '===': '==',
  '!==': '!=',
  '==': '==',
  '!=': '!=',
  '&&': '&&',
  '||': '||',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  '<': '<',
  '>': '>',
  '<=': '<=',
  '>=': '>=',
  '|': '|',
  '&': '&',
  '^': '^',
  '<<': '<<',
  '>>': '>>',
  '|=': '|=',
  '=': '=',
};

export function estTokens(s) {
  return Math.ceil(String(s).length / 4);
}

function isTestishBody(stmts) {
  const body = (stmts || []).join(';');
  return /\b(describe|it|assert|bench|strictEqual)\b/.test(body);
}

/** Parse ~Fn records from PROJECT.dicel text. */
export function parseProjectFns(dicelText) {
  const fns = [];
  const re =
    /~Fn\{name:"([^"]*)",\s*kind:"([^"]*)",\s*params:\[([^\]]*)\],\s*return_type:"([^"]*)",\s*body:FnBody\{statements:\[((?:[^\[\]]|\[[^\]]*\])*)\],\s*supported:(true|false)\}\}/g;
  let m;
  while ((m = re.exec(dicelText)) !== null) {
    const name = m[1];
    const kind = m[2];
    const params = [...m[3].matchAll(/name:"([^"]*)"/g)].map((x) => x[1]);
    const stmtsRaw = m[5];
    const stmts = [];
    const sre = /"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = sre.exec(stmtsRaw)) !== null) {
      stmts.push(sm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    }
    fns.push({ name, kind, params, stmts, supported: m[6] === 'true' });
  }
  return fns;
}

function splitTopArgs(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === '\\' && i + 1 < s.length) {
        cur += s[++i];
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      depth++;
      cur += c;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      cur += c;
      continue;
    }
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function matchCallArgs(s, openIdx) {
  // openIdx points at '('
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return { args: s.slice(openIdx + 1, i), end: i };
    }
  }
  return null;
}

function rewritePrefixedCalls(s, prefix, replacer) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf(prefix, i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const after = s.slice(idx + prefix.length);
    const m = after.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(/);
    if (!m) {
      out += prefix;
      i = idx + prefix.length;
      continue;
    }
    const name = m[1];
    const openIdx = idx + prefix.length + m[0].length - 1;
    const matched = matchCallArgs(s, openIdx);
    if (!matched) {
      out += prefix;
      i = idx + prefix.length;
      continue;
    }
    out += replacer(name, matched.args);
    i = matched.end + 1;
  }
  return out;
}

/** Desugar one L0 expression/statement fragment to JS-like. */
export function desugarL0Expr(expr) {
  let s = String(expr || '').trim();
  if (!s || s === '?' || s.startsWith('GAP:')) return '';

  for (let n = 0; n < 50; n++) {
    const before = s;

    s = rewritePrefixedCalls(s, 'call:member:', (name, args) => {
      const a = splitTopArgs(args).map(desugarL0Expr).join(',');
      return `${name}(${a})`;
    });
    s = rewritePrefixedCalls(s, 'call:', (name, args) => {
      if (name.includes('.')) return `call:member:${name}(${args})`; // shouldn't happen
      const a = splitTopArgs(args).map(desugarL0Expr).join(',');
      return `${name}(${a})`;
    });

    s = s.replace(/member:([A-Za-z_$][\w$]*)\.\[([^\]]+)\]/g, (_, obj, idx) => `${obj}[${desugarL0Expr(idx)}]`);
    s = s.replace(/member:([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g, '$1');
    s = s.replace(/unary:typeof\(([^()]*)\)/g, (_, e) => `typeof ${desugarL0Expr(e)}`);
    s = s.replace(/unary:!\(([^()]*)\)/g, (_, e) => `!${desugarL0Expr(e)}`);
    s = s.replace(/unary:-\(([^()]*)\)/g, (_, e) => `-(${desugarL0Expr(e)})`);

    // op:OP(args) with nested parens
    let opOut = '';
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf('op:', i);
      if (idx < 0) {
        opOut += s.slice(i);
        break;
      }
      opOut += s.slice(i, idx);
      const rest = s.slice(idx + 3);
      const om = rest.match(/^([=!<>&|^+\-*/%]+)\(/);
      if (!om) {
        opOut += 'op:';
        i = idx + 3;
        continue;
      }
      const op = om[1];
      const openIdx = idx + 3 + om[0].length - 1;
      const matched = matchCallArgs(s, openIdx);
      if (!matched) {
        opOut += 'op:';
        i = idx + 3;
        continue;
      }
      const parts = splitTopArgs(matched.args).map(desugarL0Expr);
      const infix = OP_INFIX[op] || op;
      if (op === '=' || op === '|=') opOut += `${parts[0]}${infix}${parts[1]}`;
      else if (parts.length === 1) opOut += `${infix}${parts[0]}`;
      else if (parts.length === 2) opOut += `${parts[0]}${infix}${parts[1]}`;
      else opOut += parts.join(infix);
      i = matched.end + 1;
    }
    s = opOut;

    if (s === before) break;
  }

  s = s.replace(/\bexpr=/g, '');
  s = s.replace(/\breturn=/g, '^');
  s = s.replace(/\bvar\s+/g, '');
  s = s.replace(/\s+/g, '');
  return s;
}

function findMatching(s, openIdx, openCh, closeCh) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteControlBlocks(s, keyword, sigil) {
  let out = '';
  let i = 0;
  const token = keyword + '(';
  while (i < s.length) {
    const idx = s.indexOf(token, i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    // word boundary before keyword
    if (idx > 0 && /[A-Za-z0-9_$]/.test(s[idx - 1])) {
      out += s.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }
    out += s.slice(i, idx);
    const openParen = idx + keyword.length;
    const closeParen = findMatching(s, openParen, '(', ')');
    if (closeParen < 0) {
      out += token;
      i = idx + token.length;
      continue;
    }
    const head = s.slice(openParen + 1, closeParen);
    let j = closeParen + 1;
    while (j < s.length && s[j] === ' ') j++;
    if (s[j] !== '{') {
      out += `${sigil}(${desugarL0Expr(head)})`;
      i = closeParen + 1;
      continue;
    }
    const closeBrace = findMatching(s, j, '{', '}');
    if (closeBrace < 0) {
      out += token;
      i = idx + token.length;
      continue;
    }
    const body = s.slice(j + 1, closeBrace);
    const b = splitSemi(body).map(desugarL0Stmt).filter(Boolean).join(';');
    if (keyword === 'for') {
      const parts = head.split(';').map((p) => desugarL0Expr(p.trim()));
      out += `#(${parts.join(';')}){${b}}`;
    } else {
      out += `${sigil}(${desugarL0Expr(head)}){${b}}`;
    }
    i = closeBrace + 1;
  }
  return out;
}

function desugarL0Stmt(stmt) {
  let s = String(stmt || '').trim();
  if (!s || s === '?' || s.startsWith('GAP:')) return '';

  s = rewriteControlBlocks(s, 'if', '?');
  s = rewriteControlBlocks(s, 'for', '#');
  s = s.replace(/\belse\{/g, ':{');

  let out = desugarL0Expr(s);
  out = out.replace(/^return(?=[A-Za-z_$0-9(])/, '^');
  out = out.replace(/^return/, '^');
  return out;
}

function splitSemi(body) {
  const out = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      cur += c;
      if (c === '\\' && i + 1 < body.length) {
        cur += body[++i];
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '{' || c === '(') {
      depth++;
      cur += c;
      continue;
    }
    if (c === '}' || c === ')') {
      depth--;
      cur += c;
      continue;
    }
    if (c === ';' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function shortenLocals(body) {
  // Compress locals; never rewrite property names after `.`
  const map = [
    ['strA', 'A'],
    ['strB', 'B'],
    ['lenA', 'n'],
    ['result', 'r'],
    ['aLen', 'aL'],
    ['bLen', 'bL'],
    ['bufA', 'ba'],
    ['bufB', 'bb'],
    ['value', 'v'],
    ['options', 'o'],
    ['floatValue', 'f'],
    ['results', 'r'],
    ['mag', 'm'],
    ['unit', 'u'],
    ['val', 'v'],
  ];
  let s = body;
  for (const [from, to] of map) {
    const re = new RegExp(`(?<!\\.)\\b${from}\\b`, 'g');
    s = s.replace(re, to);
  }
  return s;
}

function braceSingleStmtControls(s) {
  // ?(cond)stmt; → ?(cond){stmt};  (same for # and :)
  const apply = (sigilChar) => {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf(sigilChar + '(', i);
      if (idx < 0) {
        out += s.slice(i);
        break;
      }
      // skip if already part of ?: ternary weirdness — only at stmt positions
      out += s.slice(i, idx);
      const open = idx + 1; // '('
      const matched = matchCallArgs(s, open);
      if (!matched) {
        out += sigilChar;
        i = idx + 1;
        continue;
      }
      let j = matched.end + 1;
      while (j < s.length && s[j] === ' ') j++;
      if (s[j] === '{') {
        out += s.slice(idx, j);
        i = j;
        continue;
      }
      // collect single stmt until ; or end or }
      let k = j;
      while (k < s.length && s[k] !== ';' && s[k] !== '}' && s[k] !== '{') k++;
      const stmt = s.slice(j, k).trim();
      out += `${sigilChar}(${matched.args}){${stmt}}`;
      i = k;
    }
    return out;
  };
  s = apply('?');
  s = apply('#');
  s = apply(':');
  s = s.replace(/\belse\s+(?!\{)([^;{}]+);/g, (_m, stmt) => `:{${stmt.trim()}};`);
  s = s.replace(/\belse\s+(?!\{)([^;{}]+)$/g, (_m, stmt) => `:{${stmt.trim()}}`);
  s = s.replace(/\belse\s+(?!\{)([^;{}]+)(?=\})/g, (_m, stmt) => `:{${stmt.trim()}}`);
  return s;
}

function applySourceSigils(jsBody) {
  let s = String(jsBody || '');
  // strip comments before compaction (otherwise // eats the rest of the AIL/JS line)
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\breturn\s+/g, '^');
  s = s.replace(/\belse\s+if\s*\(/g, ':(');
  s = s.replace(/\bif\s*\(/g, '?(');
  s = s.replace(/\bfor\s*\(/g, '#(');
  s = s.replace(/\bvar\s+/g, '');
  s = s.replace(/\blet\s+/g, '');
  s = s.replace(/\bconst\s+/g, '');
  s = braceSingleStmtControls(s);
  s = s.replace(/\belse\s*\{/g, ':{');
  s = s.replace(/\s*([{};,?=|&<>!+\-*/%^])\s*/g, '$1');
  s = s.replace(/;+/g, ';');
  s = s.replace(/;\}/g, '}');
  s = s.replace(/\{;/g, '{');
  s = s.replace(/===/g, '==').replace(/!==/g, '!=');
  return s;
}

/** Extract top-level named functions from JS source. */
export function extractJsFunctions(source) {
  const text = String(source || '');
  const fns = [];
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
    /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      const params = m[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      for (; i < text.length; i++) {
        const c = text[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const body = text.slice(start, i);
      if (!fns.some((f) => f.name === name)) fns.push({ name, params, body });
    }
  }
  return fns;
}

function detectBytesMap(source) {
  if (/kb\s*:\s*1\s*<<\s*10/.test(source) || /map\s*=\s*\{[^}]*kb/.test(source)) return BYTES_K;
  return null;
}

/**
 * Emit LIA from JS source (default compact path).
 */
export function emitAilFromSource(source, opts = {}) {
  const fns = extractJsFunctions(source).filter((f) => {
    if (!f.name) return false;
    if (opts.namedOnly === false) return true;
    return !isTestishBody([f.body]);
  });
  const lines = [
    LIA_HEADER,
    `^schema_once ^lossy=true ^ops=${opts.ops || DEFAULT_OPS}`,
    GRAMMAR,
  ];
  const k = opts.constTable || detectBytesMap(source);
  if (k) lines.push(k);

  const names = [];
  for (const f of fns) {
    let body = applySourceSigils(f.body);
    if (opts.shortenLocals !== false) body = shortenLocals(body);
    if (k) body = body.replace(/\bmap\[/g, '$K[').replace(/\bmap\./g, '$K.');
    // drop trailing semicolon noise
    body = body.replace(/;+$/g, '');
    const params = f.params.map((p) => (opts.shortenLocals === false ? p : shortenLocals(p))).join(',');
    lines.push(`!${f.name}(${params}){${body}}`);
    names.push(f.name);
  }
  if (names.length) lines.push(`=ex{${names.join(',')}}`);
  return lines.join('\n');
}

/**
 * Emit LIA from PROJECT.dicel L0 text.
 */
export function emitAilFromProject(dicelText, opts = {}) {
  const all = parseProjectFns(dicelText);
  const fns = all.filter((f) => {
    if (!f.name) return false;
    if (opts.stripTests !== false && isTestishBody(f.stmts)) return false;
    return true;
  });
  const lines = [
    LIA_HEADER,
    `^schema_once ^lossy=true ^ops=${opts.ops || DEFAULT_OPS}`,
    GRAMMAR,
  ];
  const k = opts.constTable || (/\bmap\b|kb|mb|gb/.test(dicelText) ? BYTES_K : null);
  if (k) lines.push(k);

  const names = [];
  for (const f of fns) {
    const parts = f.stmts.map(desugarL0Stmt).filter(Boolean);
    let body = parts.join(';');
    if (opts.shortenLocals !== false) body = shortenLocals(body);
    if (k) body = body.replace(/\bmap\[/g, '$K[').replace(/\bmap\./g, '$K.');
    // drop L0 holes "?" / "?;" but keep LIA if-sigil "?("
    body = body
      .replace(/;\?(?!\()/g, ';')
      .replace(/^\?(?!\()/g, '')
      .replace(/;+/g, ';')
      .replace(/;\}/g, '}')
      .replace(/\{;/g, '{');
    const params = f.params.join(',');
    lines.push(`!${f.name}(${params}){${body}}`);
    names.push(f.name);
  }
  if (names.length) lines.push(`=ex{${names.join(',')}}`);
  return lines.join('\n');
}

/**
 * Auto-detect input kind and Emit LIA.
 */
export function emitAil(input, opts = {}) {
  const text = String(input || '');
  if (text.includes('@DICE-L:project') || text.includes('~Fn{')) {
    return emitAilFromProject(text, opts);
  }
  return emitAilFromSource(text, opts);
}

export function emitLiaFile(inPath, outPath = null, opts = {}) {
  const abs = path.resolve(inPath);
  const text = fs.readFileSync(abs, 'utf8');
  const lia = emitAil(text, opts);
  const dest = outPath || path.join(path.dirname(abs), 'LIA.dicel');
  fs.writeFileSync(dest, lia, 'utf8');
  return { outPath: dest, chars: lia.length, tokens_est: estTokens(lia), ail: lia, lia };
}

/** @deprecated use emitLiaFile */
export function emitAilFile(inPath, outPath = null, opts = {}) {
  return emitLiaFile(inPath, outPath, opts);
}

function isMain() {
  try {
    const self = path.resolve(fileURLToPath(import.meta.url));
    const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return self === argv1;
  } catch {
    return false;
  }
}

if (isMain()) {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('Usage: node lia_emitter.mjs <source.js|PROJECT.dicel> [out.LIA.dicel]');
    process.exit(2);
  }
  const r = emitLiaFile(inPath, process.argv[3] || null);
  console.log(JSON.stringify({ out: r.outPath, chars: r.chars, tokens_est: r.tokens_est }, null, 2));
}
