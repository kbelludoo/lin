/**
 * Parse LIA function bodies into a small statement AST for multi-target emit.
 */
export function findMatching(s, openIdx, openCh, closeCh) {
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

function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function parseBlockBody(s, openBrace) {
  const close = findMatching(s, openBrace, '{', '}');
  if (close < 0) throw new Error('LIA_AST_BRACE');
  return { stmts: parseStmts(s.slice(openBrace + 1, close)), end: close + 1 };
}

/**
 * @returns {import('./emit_shared.mjs').Stmt[]}
 */
export function parseStmts(body) {
  const s = String(body || '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    i = skipWs(s, i);
    if (i >= s.length) break;
    if (s[i] === ';') {
      i++;
      continue;
    }

    if (s.startsWith('?(', i)) {
      const openParen = i + 1;
      const closeParen = findMatching(s, openParen, '(', ')');
      if (closeParen < 0) throw new Error('LIA_AST_IF_PAREN');
      const cond = s.slice(openParen + 1, closeParen);
      let j = skipWs(s, closeParen + 1);
      if (s[j] !== '{') throw new Error('LIA_AST_IF_BRACE');
      const thenB = parseBlockBody(s, j);
      j = thenB.end;
      const elseIf = [];
      let elseStmts = null;
      while (true) {
        j = skipWs(s, j);
        if (s[j] === ';') {
          j = skipWs(s, j + 1);
        }
        if (s.startsWith(':(', j)) {
          const op = j + 1;
          const cp = findMatching(s, op, '(', ')');
          const c2 = s.slice(op + 1, cp);
          let k = skipWs(s, cp + 1);
          if (s[k] !== '{') throw new Error('LIA_AST_ELIF_BRACE');
          const b = parseBlockBody(s, k);
          elseIf.push({ cond: c2, body: b.stmts });
          j = b.end;
          continue;
        }
        if (s.startsWith(':{', j)) {
          const b = parseBlockBody(s, j + 1);
          elseStmts = b.stmts;
          j = b.end;
        }
        break;
      }
      out.push({ type: 'if', cond, then: thenB.stmts, elseIf, else: elseStmts });
      i = j;
      continue;
    }

    if (s.startsWith('while', i) && /^\s*\(/.test(s.slice(i + 5))) {
      const open = s.indexOf('(', i);
      const close = findMatching(s, open, '(', ')');
      if (close < 0) throw new Error('LIA_AST_WHILE_PAREN');
      const cond = s.slice(open + 1, close);
      let j = skipWs(s, close + 1);
      if (s[j] !== '{') throw new Error('LIA_AST_WHILE_BRACE');
      const b = parseBlockBody(s, j);
      out.push({ type: 'while', cond, body: b.stmts });
      i = b.end;
      continue;
    }

    if (s.startsWith('#(', i)) {
      const openParen = i + 1;
      const closeParen = findMatching(s, openParen, '(', ')');
      if (closeParen < 0) throw new Error('LIA_AST_FOR_PAREN');
      const head = s.slice(openParen + 1, closeParen);
      const parts = head.split(';');
      if (parts.length !== 3) throw new Error('LIA_AST_FOR_HEAD');
      let j = skipWs(s, closeParen + 1);
      if (s[j] !== '{') throw new Error('LIA_AST_FOR_BRACE');
      const b = parseBlockBody(s, j);
      out.push({
        type: 'for',
        init: parts[0].trim(),
        cond: parts[1].trim(),
        step: parts[2].trim(),
        body: b.stmts,
      });
      i = b.end;
      continue;
    }

    if (s[i] === '^') {
      let j = i + 1;
      let depth = 0;
      while (j < s.length) {
        const c = s[j];
        if (c === '(' || c === '{' || c === '[') depth++;
        else if (c === ')' || c === '}' || c === ']') depth--;
        else if (c === ';' && depth === 0) break;
        else if ((c === '?' || c === '#' || c === '^') && depth === 0 && j > i + 1) break;
        j++;
      }
      out.push({ type: 'return', expr: s.slice(i + 1, j).trim() });
      i = j;
      continue;
    }

    // assignment or expr until ; or control at depth 0
    let j = i;
    let depth = 0;
    while (j < s.length) {
      const c = s[j];
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
      else if (c === ';' && depth === 0) break;
      else if (depth === 0 && j > i && (s.startsWith('?(', j) || s.startsWith('#(', j) || s[j] === '^')) break;
      j++;
    }
    const chunk = s.slice(i, j).trim();
    if (chunk) {
      const am = chunk.match(/^([A-Za-z_$][\w$]*)\s*(<<=|>>=|[+\-*/%&|^]=|=)\s*([\s\S]+)$/);
      if (am) out.push({ type: 'assign', id: am[1], op: am[2], expr: am[3].trim() });
      else out.push({ type: 'expr', expr: chunk });
    }
    i = j < s.length && s[j] === ';' ? j + 1 : j;
  }
  return out;
}

export function collectAssignedIds(stmts) {
  const ids = new Set();
  const walk = (list) => {
    for (const st of list || []) {
      if (st.type === 'assign') ids.add(st.id);
      if (st.type === 'for' || st.type === 'while') {
        if (st.type === 'for') {
          const im = st.init.match(/^([A-Za-z_$][\w$]*)\s*=/);
          if (im) ids.add(im[1]);
        }
        walk(st.body);
      }
      if (st.type === 'if') {
        walk(st.then);
        for (const e of st.elseIf || []) walk(e.body);
        if (st.else) walk(st.else);
      }
    }
  };
  walk(stmts);
  return [...ids];
}
