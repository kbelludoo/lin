/**
 * LIA → JS compiler (M1/M3) — dual-reads @LIA and legacy @AIL headers.
 * Spec: LIA_SEMANTIC_CORE.dicel + LIA_COMPILER_SPEC.dicel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIA_COMPILER_VERSION = '1.0.0';
export const AIL_COMPILER_VERSION = LIA_COMPILER_VERSION; // backcompat

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

function parseConstTable(line) {
  // $K{b=1 kb=1024 ...}
  const m = line.match(/^\$K\{([^}]*)\}\s*$/);
  if (!m) return null;
  const entries = {};
  for (const part of m[1].trim().split(/\s+/).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    entries[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return entries;
}

function stripTypeAnn(params) {
  return params
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/:[\w\[\]|,]+$/g, '').trim())
    .join(', ');
}

function compileReturnSigils(s) {
  // LIA: ^expr = return; keep bitwise XOR a^b intact
  // nextOk includes unary + - ! so ^-x / ^!x / ^+x become return
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== '^') {
      out += c;
      i++;
      continue;
    }
    const prev = out.length ? out[out.length - 1] : '';
    const next = s[i + 1] || '';
    const prevOk = !prev || /[;{}\n,]/.test(prev);
    const nextOk = /[A-Za-z_$0-9(\[\-+!'"`{]/.test(next);
    if (prevOk && nextOk) {
      out += 'return ';
      i++;
      continue;
    }
    out += '^';
    i++;
  }
  return out;
}

function compileBody(body) {
  let s = String(body || '');
  s = rewriteSigilBlocks(s, '?', 'if');
  s = rewriteElseIf(s);
  s = rewriteElseBare(s);
  s = rewriteSigilBlocks(s, '#', 'for');
  s = compileReturnSigils(s);
  s = s.replace(/([^;{}(\[,:?])while\s*\(/g, '$1;while(');
  // protect existing ===/!== then expand LIN ==/!=
  s = s.replace(/!==/g, '\u0000NE\u0000').replace(/===/g, '\u0000EQ\u0000');
  s = s.replace(/==/g, '===').replace(/!=/g, '!==');
  s = s.replace(/\u0000NE\u0000/g, '!==').replace(/\u0000EQ\u0000/g, '===');
  s = s.replace(/;+/g, ';');
  s = s.replace(/;else\b/g, 'else');
  if (s && !/[;{}]\s*$/.test(s)) s += ';';
  return s;
}

function rewriteSigilBlocks(s, sigil, keyword) {
  let out = '';
  let i = 0;
  const token = sigil + '(';
  while (i < s.length) {
    const idx = s.indexOf(token, i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const openParen = idx + 1;
    const closeParen = findMatching(s, openParen, '(', ')');
    if (closeParen < 0) {
      out += token;
      i = idx + token.length;
      continue;
    }
    const head = s.slice(openParen + 1, closeParen);
    let j = closeParen + 1;
    if (s[j] !== '{') {
      out += `${keyword}(${head})`;
      i = closeParen + 1;
      continue;
    }
    const closeBrace = findMatching(s, j, '{', '}');
    if (closeBrace < 0) {
      out += token;
      i = idx + token.length;
      continue;
    }
    const inner = compileBody(s.slice(j + 1, closeBrace));
    if (keyword === 'for') out += `for(${head}){${inner}}`;
    else out += `if(${head}){${inner}}`;
    i = closeBrace + 1;
  }
  return out;
}

function rewriteElseIf(s) {
  // :(cond){body} → else if(cond){body}
  let out = '';
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf(':(', i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const openParen = idx + 1;
    const closeParen = findMatching(s, openParen, '(', ')');
    if (closeParen < 0) {
      out += ':(';
      i = idx + 2;
      continue;
    }
    const head = s.slice(openParen + 1, closeParen);
    let j = closeParen + 1;
    if (s[j] !== '{') {
      out += `else if(${head})`;
      i = closeParen + 1;
      continue;
    }
    const closeBrace = findMatching(s, j, '{', '}');
    const inner = compileBody(s.slice(j + 1, closeBrace));
    out += `else if(${head}){${inner}}`;
    i = closeBrace + 1;
  }
  return out;
}

function rewriteElseBare(s) {
  // :{body} → else{body}
  let out = '';
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf(':{', i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const closeBrace = findMatching(s, idx + 1, '{', '}');
    if (closeBrace < 0) {
      out += ':{';
      i = idx + 2;
      continue;
    }
    const inner = compileBody(s.slice(idx + 2, closeBrace));
    out += `else{${inner}}`;
    i = closeBrace + 1;
  }
  return out;
}

/**
 * Parse LIN/LIA program. Dual-reads @LIN + legacy @LIA/@AIL headers.
 */
export function parseLia(liaText) {
  const lines = String(liaText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const meta = { header: null, consts: null, exports: [], fns: [] };
  for (const line of lines) {
    if (line.startsWith('@LIN:') || line.startsWith('@LIA:') || line.startsWith('@AIL:')) {
      meta.header = line;
    }
    else if (line.startsWith('^')) continue;
    else if (line.startsWith('~G')) continue;
    else if (line.startsWith('$K')) meta.consts = parseConstTable(line);
    else if (line.startsWith('=ex{')) {
      meta.exports = line
        .slice(4, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (line.startsWith('!')) {
      const m = line.match(/^!([A-Za-z_$][\w$]*)\(([^)]*)\)(?:->[\w\[\]|,]+)?\{([\s\S]*)\}\s*$/);
      if (!m) throw new Error(`LIA_PARSE_FN: ${line.slice(0, 80)}`);
      meta.fns.push({ name: m[1], params: stripTypeAnn(m[2]), body: m[3] });
    }
  }
  return meta;
}

/** @deprecated use parseLia */
export const parseAil = parseLia;

function collectAssignedIds(body) {
  const ids = new Set();
  const re = /(?:^|[;{])\s*([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  const s = `;${body}`;
  while ((m = re.exec(s)) !== null) {
    const id = m[1];
    if (!['return', 'if', 'for', 'else', 'function', 'var', 'let', 'const'].includes(id)) ids.add(id);
  }
  // for-loop init i=0
  const forInit = /for\(([^;]*);/g;
  while ((m = forInit.exec(body)) !== null) {
    const im = m[1].match(/^([A-Za-z_$][\w$]*)\s*=/);
    if (im) ids.add(im[1]);
  }
  return [...ids];
}

/**
 * Compile LIA text → JS module source.
 */
export function compileLiaToJs(liaText, opts = {}) {
  const prog = parseLia(liaText);
  const parts = [];
  parts.push(`/* generated by lia_compiler ${LIA_COMPILER_VERSION} */`);
  if (opts.prelude) parts.push(String(opts.prelude).trim());
  if (prog.consts) {
    const obj = Object.entries(prog.consts)
      .map(([k, v]) => `${JSON.stringify(k)}:${v}`)
      .join(',');
    parts.push(`var $K={${obj}};`);
  }
  for (const fn of prog.fns) {
    const body = compileBody(fn.body);
    const locals = collectAssignedIds(body).filter((id) => {
      const params = new Set(fn.params.split(',').map((p) => p.trim()).filter(Boolean));
      return !params.has(id);
    });
    const decl = locals.length ? `var ${locals.join(',')};` : '';
    parts.push(`function ${fn.name}(${fn.params}){${decl}${body}}`);
  }
  if (opts.epilogue) {
    parts.push(String(opts.epilogue).trim());
  } else {
    const ex = prog.exports.length ? prog.exports : prog.fns.map((f) => f.name);
    if (opts.exportMode === 'single' && ex[0]) {
      parts.push(`module.exports=${ex[0]};`);
    } else if (ex.length === 1) {
      parts.push(`module.exports=${ex[0]};`);
    } else {
      parts.push(`module.exports={${ex.join(',')}};`);
    }
  }
  return { js: parts.join('\n'), program: prog };
}

/** @deprecated use compileLiaToJs */
export const compileAilToJs = compileLiaToJs;

export function compileLiaFile(liaPath, outPath = null, opts = {}) {
  const lia = fs.readFileSync(liaPath, 'utf8');
  const { js, program } = compileLiaToJs(lia, opts);
  const dest = outPath || path.join(path.dirname(path.resolve(liaPath)), 'LIA.compiled.js');
  fs.writeFileSync(dest, js, 'utf8');
  return { outPath: dest, js, program };
}

/** @deprecated use compileLiaFile */
export const compileAilFile = compileLiaFile;

function isMain() {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || '');
  } catch {
    return false;
  }
}

if (isMain()) {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('Usage: node lia_compiler.mjs <file.lia|file.ail|LIA.dicel> [out.js]');
    process.exit(2);
  }
  const r = compileLiaFile(inPath, process.argv[3] || null);
  console.log(JSON.stringify({ out: r.outPath, fns: r.program.fns.map((f) => f.name) }, null, 2));
}
