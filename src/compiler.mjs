/**
 * LIA → JS compiler (M1/M3) — dual-reads @LIA and legacy @AIL headers.
 * Spec: LIA_SEMANTIC_CORE.dicel + LIA_COMPILER_SPEC.dicel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIA_COMPILER_VERSION = '1.0.0';
export const AIL_COMPILER_VERSION = LIA_COMPILER_VERSION; // backcompat

function skipRegexLit(s, i) {
  let j = i + 1;
  let inClass = false;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === '[' && !inClass) { inClass = true; j++; continue; }
    if (s[j] === ']' && inClass) { inClass = false; j++; continue; }
    if (s[j] === '/' && !inClass) {
      j++;
      while (j < s.length && /[gimsuy]/.test(s[j])) j++;
      return j;
    }
    if (s[j] === '\n') return i + 1;
    j++;
  }
  return i + 1;
}

function findMatching(s, openIdx, openCh, closeCh) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (quote === '`' && c === '$' && s[i + 1] === '{') {
        const inner = findMatching(s, i + 1, '{', '}');
        if (inner >= 0) i = inner;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && openCh !== '/') {
      let k = i - 1;
      while (k >= 0 && /\s/.test(s[k])) k--;
      const prev = k < 0 ? '' : s[k];
      if (!prev || /[=(:,;!?{[&|^~+\-*%<>]/.test(prev)) {
        i = skipRegexLit(s, i) - 1;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
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
  if (!params) return '';
  return params
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/:[\w\[\]|,<>]+$/g, '').trim())
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
      const prevOk = !prev || /[;{}\n,:]/.test(prev);
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

function rewriteClosures(s) {
  // LIN closure syntax: ~(params){body} -> function(params){body}
  let out = '';
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf('~(', i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    // skip ~G grammar marker
    if (s[idx + 1] === 'G') {
      out += s.slice(i, idx + 2);
      i = idx + 2;
      continue;
    }
    // ~~(x) is JS double-bitwise-not, not a LIN closure
    if (idx > 0 && s[idx - 1] === '~') {
      out += s.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }
    out += s.slice(i, idx);
    const openParen = idx + 1;
    const closeParen = findMatching(s, openParen, '(', ')');
    if (closeParen < 0) {
      out += '~(';
      i = idx + 2;
      continue;
    }
    const params = s.slice(openParen + 1, closeParen);
    let j = closeParen + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] !== '{') {
      out += `function(${stripTypeAnn(params)})`;
      i = closeParen + 1;
      continue;
    }
    let closeBrace = findMatching(s, j, '{', '}');
    if (closeBrace < 0) closeBrace = s.lastIndexOf('}');
    if (closeBrace < j) {
      out += `function(${stripTypeAnn(params)}){return void 0;}`;
      i = j + 1;
      continue;
    }
    const inner = compileBody(s.slice(j + 1, closeBrace));
    out += `function(${stripTypeAnn(params)}){${inner}}`;
    i = closeBrace + 1;
  }
  return out;
}

function rewriteMatchBlocks(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf('match(', i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const openParen = idx + 5;
    const closeParen = findMatching(s, openParen, '(', ')');
    if (closeParen < 0) {
      out += 'match(';
      i = idx + 6;
      continue;
    }
    const targetExpr = s.slice(openParen + 1, closeParen).trim();
    let j = closeParen + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] !== '{') {
      out += `match(${targetExpr})`;
      i = closeParen + 1;
      continue;
    }
    const closeBrace = findMatching(s, j, '{', '}');
    if (closeBrace < 0) {
      out += `match(${targetExpr}){`;
      i = j + 1;
      continue;
    }
    const inner = s.slice(j + 1, closeBrace);
    out += compileMatchToJs(targetExpr, inner);
    i = closeBrace + 1;
  }
  return out;
}

function compileMatchToJs(targetExpr, inner) {
  const parts = [];
  let i = 0;
  let first = true;
  while (i < inner.length) {
    while (i < inner.length && /[\s;]/.test(inner[i])) i++;
    if (i >= inner.length) break;
    let q = null;
    let d = 0;
    let arrowIdx = -1;
    for (let k = i; k < inner.length; k++) {
      const ch = inner[k];
      if (q) {
        if (ch === '\\') { k++; continue; }
        if (ch === q) q = null;
        continue;
      }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(' || ch === '{' || ch === '[') d++;
      else if (ch === ')' || ch === '}' || ch === ']') d--;
      else if (d === 0 && ch === '=' && inner[k + 1] === '>') {
        arrowIdx = k;
        break;
      }
    }
    if (arrowIdx < 0) break;
    const patRaw = inner.slice(i, arrowIdx).trim();
    let pat = patRaw;
    let guard = null;
    const guardMatch = patRaw.match(/^([\s\S]+?)\s+if\s+([\s\S]+)$/);
    if (guardMatch) {
      pat = guardMatch[1].trim();
      guard = guardMatch[2].trim();
    }
    let bodyStart = arrowIdx + 2;
    while (bodyStart < inner.length && /\s/.test(inner[bodyStart])) bodyStart++;
    let bodyStr = '';
    let nextI = bodyStart;
    if (inner[bodyStart] === '{') {
      const closeB = findMatching(inner, bodyStart, '{', '}');
      if (closeB >= 0) {
        bodyStr = compileBody(inner.slice(bodyStart + 1, closeB));
        nextI = closeB + 1;
      }
    } else {
      let k = bodyStart;
      let q2 = null;
      let d2 = 0;
      for (; k < inner.length; k++) {
        const ch = inner[k];
        if (q2) {
          if (ch === '\\') { k++; continue; }
          if (ch === q2) q2 = null;
          continue;
        }
        if (ch === '"' || ch === "'") { q2 = ch; continue; }
        if (ch === '(' || ch === '{' || ch === '[') d2++;
        else if (ch === ')' || ch === '}' || ch === ']') d2--;
        else if (d2 === 0 && (ch === ',' || ch === ';')) break;
      }
      const raw = inner.slice(bodyStart, k).trim();
      if (raw) {
        bodyStr = compileBody(raw);
      }
      nextI = k < inner.length ? k + 1 : k;
    }

    let cond = '';
    let binds = '';
    if (pat === '_') {
      cond = guard ? `(${guard})` : 'true';
    } else {
      const enumMatch = pat.match(/^([A-Za-z_$][\w$]*)\(([^)]+)\)$/);
      if (enumMatch) {
        const tag = enumMatch[1];
        const v = enumMatch[2].trim();
        let tagCheck = '';
        if (tag === 'Some') {
          tagCheck = `(${targetExpr}!=null && (typeof ${targetExpr}==='object'?('Some' in ${targetExpr}||${targetExpr}.tag==='Some'):true))`;
          binds = `let ${v}=typeof ${targetExpr}==='object'&&${targetExpr}!==null?(${targetExpr}.value!==undefined?${targetExpr}.value:${targetExpr}.Some):${targetExpr};`;
        } else if (tag === 'Ok' || tag === 'Err') {
          tagCheck = `(${targetExpr}!=null && typeof ${targetExpr}==='object' && (${targetExpr}.tag==='${tag}'||'${tag}' in ${targetExpr}))`;
          binds = `let ${v}=${targetExpr}.value!==undefined?${targetExpr}.value:${targetExpr}.${tag};`;
        } else {
          tagCheck = `(${targetExpr}!=null && typeof ${targetExpr}==='object' && (${targetExpr}.tag==='${tag}'||'${tag}' in ${targetExpr}))`;
          binds = `let ${v}=${targetExpr}.value!==undefined?${targetExpr}.value:${targetExpr}.${tag};`;
        }
        cond = tagCheck;
        if (guard) cond += `&&(${guard})`;
      } else if (/^[A-Za-z_$][\w$]*$/.test(pat) && pat === 'None') {
        cond = `(${targetExpr}==null||${targetExpr}===undefined||(typeof ${targetExpr}==='object'&&(${targetExpr}.tag==='None'||'None' in ${targetExpr})))`;
        if (guard) cond += `&&(${guard})`;
      } else {
        cond = `(${targetExpr}===${pat})`;
        if (guard) cond += `&&(${guard})`;
      }
    }

    if (first) {
      parts.push(`if(${cond}){${binds}${bodyStr}}`);
      first = false;
    } else {
      parts.push(`else if(${cond}){${binds}${bodyStr}}`);
    }
    i = nextI;
  }
  return parts.join('');
}

function compileBody(body) {
  let s = String(body || '');
  s = rewriteClosures(s);
  s = rewriteMatchBlocks(s);
  s = rewriteSigilBlocks(s, '?', 'if');
  s = rewriteElseIf(s);
  s = rewriteElseBare(s);
  s = rewriteSigilBlocks(s, '#', 'for');
  s = compileReturnSigils(s);
  s = s.replace(/([^;{}(\[,:?])while\s*\(/g, '$1;while(');
  // protect existing ===/!== then expand LIN ==/!=
  s = s.replace(/!==/g, '\u0000NE\u0000').replace(/===/g, '\u0000EQ\u0000');
  s = s.replace(/==(?![\s]*(?:null|undefined)\b)/g, '===');
  s = s.replace(/!=(?![\s]*(?:null|undefined)\b)/g, '!==');
  s = s.replace(/\u0000NE\u0000/g, '!==').replace(/\u0000EQ\u0000/g, '===');
  s = s.replace(/;+/g, ';');
  s = s.replace(/;else\b/g, 'else');
  s = s.replace(/#\(/g, 'for(');
  s = s.replace(/\?\(([^()]+)\)\{/g, 'if($1){');
  s = s.replace(/([^;{}:\s])\s+(case\s|default\s*:)/g, '$1;$2');
  s = s.replace(/\b(let|const|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;{]+?=/g, '$1 $2=');
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
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] !== '{') {
      // ?(x):y is JS ternary, not LIN if. Only ?(cond){body} is if/for.
      out += token;
      i = idx + token.length;
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
    while (j < s.length && /\s/.test(s[j])) j++;
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
  const meta = { header: null, consts: null, exports: [], fns: [], enums: [] };
  
  // Primeiro passo: coletar declarações de enum (podem spançar múltiplas linhas)
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    if (line.startsWith('@LIN:') || line.startsWith('@LIA:') || line.startsWith('@AIL:')) {
      meta.header = line;
      i++;
      continue;
    }
    else if (line.startsWith('^')) { i++; continue; }
    else if (line.startsWith('~G')) { i++; continue; }
    else if (line.startsWith('$K')) {
      meta.consts = parseConstTable(line);
      i++;
      continue;
    }
    else if (line.startsWith('=ex{')) {
      meta.exports = line
        .slice(4, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      i++;
      continue;
    }
    else if (line.startsWith('enum ')) {
      // Parse enum declaration - pode spançar múltiplas linhas
      const enumMatch = line.match(/^enum\s+([A-Za-z_$][\w$]*)(<[^>]*>)?\s*\{?([\s\S]*)$/);
      if (enumMatch) {
        const enumName = enumMatch[1];
        const generics = enumMatch[2] || null;
        let body = enumMatch[3] || '';
        
        // Se não tem fechamento, continuar coletando linhas
        if (!body.includes('}')) {
          while (i + 1 < lines.length) {
            i++;
            const nextLine = lines[i];
            body += '\n' + nextLine;
            if (nextLine.includes('}')) break;
          }
        }
        
        // Extrair variantes do enum - cada linha dentro das chaves
        const variants = [];
        const innerBody = body.replace(/^\{/, '').replace(/\}$/, '');
        const variantLines = innerBody.split('\n');
        for (const vLine of variantLines) {
          const trimmed = vLine.trim().replace(/,$/, ''); // remove trailing comma
          if (!trimmed) continue;
          // Variante pode ser: Some(T), Some, None, etc.
          const vMatch = trimmed.match(/^([A-Za-z_$][\w$]*)(\([^)]*\))?$/);
          if (vMatch) {
            variants.push({ name: vMatch[1], params: vMatch[2]?.slice(1, -1) || null });
          }
        }
        
        meta.enums.push({ name: enumName, generics, variants });
      }
      i++;
      continue;
    }
    else if (line.startsWith('fn ') || line.startsWith('!')) {
      const fnStart = line.match(/^(?:fn|!)\s*([A-Za-z_$][\w$]*)(<[^>]*>)?\(([^)]*)\)(?:\s*(?:->|:)\s*([^{]+))?\s*\{?([\s\S]*)$/);
      if (!fnStart) throw new Error(`LIA_PARSE_FN_START: ${line.slice(0, 80)}`);
      
      let fnName = fnStart[1];
      let generics = fnStart[2] || null;
      let paramsRaw = fnStart[3];
      let returnType = fnStart[4]?.trim();
      
      // Se a linha tem a abertura '{', computar chaves nesta linha e subsequentes
      let fullFnText = line;
      let firstBrace = fullFnText.indexOf('{');
      if (firstBrace < 0) {
        while (i + 1 < lines.length) {
          i++;
          fullFnText += '\n' + lines[i];
          if (fullFnText.includes('{')) {
            firstBrace = fullFnText.indexOf('{');
            break;
          }
        }
      }
      
      let openBraces = 0;
      let quote = null;
      let started = false;
      for (let k = firstBrace; k < fullFnText.length; k++) {
        const ch = fullFnText[k];
        if (quote) {
          if (ch === '\\') { k++; continue; }
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '{') {
          openBraces++;
          started = true;
        } else if (ch === '}') {
          openBraces--;
        }
      }
      
      while ((!started || openBraces > 0) && i + 1 < lines.length) {
        i++;
        const nextLine = lines[i];
        fullFnText += '\n' + nextLine;
        for (let k = 0; k < nextLine.length; k++) {
          const ch = nextLine[k];
          if (quote) {
            if (ch === '\\') { k++; continue; }
            if (ch === quote) quote = null;
            continue;
          }
          if (ch === '"' || ch === "'") { quote = ch; continue; }
          if (ch === '{') {
            openBraces++;
            started = true;
          } else if (ch === '}') {
            openBraces--;
          }
        }
      }
      
      const lastBrace = fullFnText.lastIndexOf('}');
      const body = firstBrace >= 0 && lastBrace > firstBrace
        ? fullFnText.slice(firstBrace + 1, lastBrace)
        : '';
      
      meta.fns.push({ name: fnName, generics, params: stripTypeAnn(paramsRaw), returnType, body });
      i++;
      continue;
    }
    
    i++;
  }
  
  return meta;
}

/** @deprecated use parseLia */
export const parseAil = parseLia;

function firstUseIsRead(body, id) {
  const s = String(body || '');
  const re = new RegExp(`\\b${id}\\b`, 'g');
  let m;
  while ((m = re.exec(s))) {
    let j = m.index + id.length;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] === '=' && s[j + 1] !== '=') return false;
    const before = s.slice(Math.max(0, m.index - 48), m.index);
    const after = s.slice(m.index + id.length, m.index + id.length + 48);
    if (/\{[^{}]*$/.test(before) && /\}\s*=/.test(after)) return false;
    return true;
  }
  return false;
}

function collectAssignedIds(body) {
  const ids = new Set();
  const re = /(?:^|[;{,])\s*([A-Za-z_$][\w$]*)\s*=/g;
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

const NATIVE_BUILTINS = /\b(String|Number|Math|Buffer|Array|Object|Error|JSON|console|process|require|globalThis|window|document|fetch|setTimeout|setInterval|crypto)\b/;

function inferEffect(fn, allFns) {
  const body = String(fn.body || '');
  const params = new Set((fn.params || '').split(',').map((p) => p.replace(/:[\w\[\]|,]+$/g, '').trim()).filter(Boolean));
  const locals = new Set(collectAssignedIds(body));
  for (const p of params) locals.add(p);
  const effects = new Set();

  if (/\bthrow\b/.test(body)) effects.add('Throw');
  if (NATIVE_BUILTINS.test(body)) effects.add('Native');

  // assignments to identifiers that are also referenced in other fns -> likely global Write
  const allOtherRefs = (allFns || [])
    .filter((g) => g.name !== fn.name)
    .map((g) => String(g.body || ''))
    .join('\n');
  const assignRe = /(?:^|[;{},])\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g;
  let am;
  while ((am = assignRe.exec(body)) !== null) {
    const id = am[1];
    if (['return', 'if', 'for', 'else', 'function', 'var', 'let', 'const'].includes(id)) continue;
    if (!locals.has(id)) {
      effects.add('Write');
    } else if (new RegExp(`\\b${id}\\b`).test(allOtherRefs)) {
      effects.add('Write');
    }
  }

  // references to non-local / non-param identifiers -> Read (if not a builtin)
  const idRe = /\b([A-Za-z_$][\w$]*)\b/g;
  const builtinSet = new Set(['String', 'Number', 'Math', 'Buffer', 'Array', 'Object', 'Error', 'JSON', 'console', 'process', 'require', 'globalThis', 'window', 'document', 'fetch', 'setTimeout', 'setInterval', 'crypto', 'true', 'false', 'null', 'undefined']);
  let rm;
  while ((rm = idRe.exec(body)) !== null) {
    const id = rm[1];
    if (!params.has(id) && !locals.has(id) && !builtinSet.has(id)) {
      effects.add('Read');
    }
  }

  // calls to other fns in the program: propagate their effects (simple join)
  for (const other of allFns || []) {
    if (other.name === fn.name) continue;
    const callRe = new RegExp(`\\b${other.name}\\s*\\(`);
    if (callRe.test(body) && other.effect) {
      for (const e of other.effect.split(/\|/)) effects.add(e);
    }
  }

  if (effects.has('Write')) return 'Write';
  if (effects.has('Throw')) return 'Throw';
  if (effects.has('Native')) return 'Native';
  if (effects.has('Read')) return 'Read';
  return 'Pure';
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
    fn.effect = inferEffect(fn, prog.fns);
    const body = compileBody(fn.body);
    const locals = collectAssignedIds(body).filter((id) => {
      const params = new Set(fn.params.split(',').map((p) => p.trim()).filter(Boolean));
      if (params.has(id)) return false;
      if (firstUseIsRead(body, id)) return false;
      return true;
    });
    const decl = locals.length ? `var ${locals.join(',')};` : '';
    parts.push(`/* effect:${fn.effect} */function ${fn.name}(${fn.params}){${decl}${body}}`);
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

  let js = parts.join('\n');
  if (opts.sandbox) {
    js = wrapSandbox(js, prog, opts.sandbox);
  }
  return { js, program: prog };
}

function wrapSandbox(js, prog, sandboxSpec) {
  const allowed = Array.isArray(sandboxSpec) ? sandboxSpec : ['Pure', 'Read'];
  const unsafe = {};
  for (const fn of prog.fns) {
    const fx = fn.effect || 'Pure';
    if (!allowed.includes(fx)) unsafe[fn.name] = fx;
  }
  const unsafeNames = Object.keys(unsafe);
  if (!unsafeNames.length) return js;
  const guard = `
/* sandbox guard */
(function(){
  const _orig = module.exports;
  const _allowed = ${JSON.stringify(allowed)};
  const _unsafe = ${JSON.stringify(unsafe)};
  const _wrap = typeof _orig === 'function'
    ? function(){ throw new Error('LIN_SANDBOX: exported function is ' + Object.values(_unsafe)[0] + ', allowed=' + _allowed.join('|')); }
    : {};
  if (typeof _orig === 'object' && _orig) {
    for (const k of Object.keys(_orig)) {
      if (_unsafe[k]) {
        _wrap[k] = function(){ throw new Error('LIN_SANDBOX: ' + k + ' has effect ' + _unsafe[k] + ', allowed=' + _allowed.join('|')); };
      } else {
        _wrap[k] = _orig[k];
      }
    }
  }
  module.exports = _wrap;
})();
`;
  return js + guard;
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
