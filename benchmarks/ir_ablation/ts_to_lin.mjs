/**
 * ts_to_lin.mjs — Deterministic TS → LIN canonicalizer (Fase 1)
 *
 * Converts canonical TypeScript functions to LIN IR.
 * No LLM, no heuristics — pure AST transformation.
 *
 * Supported constructs:
 *   - function declarations
 *   - return statements
 *   - if / else if / else
 *   - for loops
 *   - variable assignments
 *   - simple expressions
 *   - template literals (pass-through)
 */

/**
 * Canonicalize a LIN string (normalize whitespace, ordering)
 */
export function canonicalizeLin(lin) {
  return lin
    .replace(/@LIN:[^\n]+\n/g, '')  // strip header
    .replace(/\s+/g, ' ')           // collapse whitespace
    .replace(/\s*([{}();,?:])\s*/g, '$1')  // remove space around tokens
    .replace(/\s+/g, ' ')           // collapse again
    .trim();
}

/**
 * Count tokens in a string (simple whitespace split)
 */
export function countTokens(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Count bytes
 */
export function countBytes(s) {
  return Buffer.byteLength(s, 'utf-8');
}

/**
 * Extract the function body from a canonical TS function string.
 * Input: "function solve(input) { ... }"
 * Returns: { name, params, body }
 */
function parseTSFunction(tsCode) {
  const trimmed = tsCode.trim();

  // Match: function name(params) { body }
  const fnMatch = trimmed.match(/^function\s+(\w+)\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/);
  if (!fnMatch) {
    throw new Error(`NOT_A_FUNCTION: expected "function name(params) { ... }"`);
  }

  return {
    name: fnMatch[1],
    params: fnMatch[2].trim(),
    body: fnMatch[3].trim(),
  };
}

/**
 * Convert a TS expression to LIN expression.
 * This is a best-effort transformation for simple expressions.
 */
function exprToLin(expr) {
  let e = expr.trim();

  // Ternary: a ? b : c → (a) ? b : c  (keep as-is, LIN supports ternary)
  // Template literals: keep as-is
  // Array/Object literals: keep as-is
  // Function calls: keep as-is

  return e;
}

/**
 * Convert a TS statement to LIN.
 * Returns an array of LIN lines.
 */
function stmtToLin(stmt, indent) {
  const trimmed = stmt.trim();
  if (!trimmed) return [];

  const pad = '  '.repeat(indent);

  // Return statement
  if (trimmed.startsWith('return ')) {
    const expr = trimmed.slice(7).replace(/;$/, '').trim();
    return [`${pad}^${exprToLin(expr)};`];
  }

  // Variable declaration: const/let/var x = expr;
  // Also handles: const { a, b } = expr; and const [a, b] = expr;
  const varMatch = trimmed.match(/^(?:const|let|var)\s+(.+?)\s*=\s*([\s\S]+?);?\s*$/);
  if (varMatch) {
    const lhs = varMatch[1].trim();
    const expr = exprToLin(varMatch[2].replace(/;$/, '').trim());
    if (lhs.startsWith('{') && lhs.endsWith('}')) {
      const fields = lhs.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
      return fields.map(f => `${pad}${f} = ${expr}.${f};`);
    }
    if (lhs.startsWith('[') && lhs.endsWith(']')) {
      const elems = lhs.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
      return elems.map((e, idx) => `${pad}${e} = ${expr}[${idx}];`);
    }
    // Strip type annotations from LHS if present
    const cleanLhs = lhs.replace(/:\s*[\w\[\]|<>,\s]+/g, '').trim();
    return [`${pad}${cleanLhs} = ${expr};`];
  }

  // Assignment: x = expr;
  const assignMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+?);?\s*$/);
  if (assignMatch && !trimmed.startsWith('if') && !trimmed.startsWith('for')) {
    const name = assignMatch[1];
    const expr = exprToLin(assignMatch[2].replace(/;$/, '').trim());
    return [`${pad}${name} = ${expr};`];
  }

  // If statement
  if (trimmed.startsWith('if (') || trimmed.startsWith('if(')) {
    return convertIfChain(trimmed, indent);
  }

  // For loop
  const forMatch = trimmed.match(/^for\s*\(([^;]+);([^;]+);([^)]+)\)\s*\{/);
  if (forMatch) {
    const init = forMatch[1].trim();
    const cond = forMatch[2].trim();
    const incr = forMatch[3].trim();
    const openBraceIdx = forMatch[0].length - 1;
    const bodyEnd = findMatchingBrace(trimmed, openBraceIdx);
    if (bodyEnd >= 0) {
      const body = trimmed.slice(openBraceIdx + 1, bodyEnd).trim();
      const bodyLin = blockToLin(body, indent + 1);
      return [`${pad}#(${init};${cond};${incr}){`, ...bodyLin, `${pad}}`];
    }
  }

  // Generic statement — pass through as-is (with semicolon)
  const clean = trimmed.replace(/;$/, '').trim();
  return [`${pad}${clean};`];
}

function findMatchingBrace(text, openBraceIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openBraceIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingParen(text, openParenIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openParenIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Convert an if/else if/else chain to LIN.
 * Input is a single statement: if (...) { ... } or if (...) { ... } else { ... }
 */
function convertIfChain(code, indent) {
  const pad = '  '.repeat(indent);
  const result = [];

  const ifPrefix = code.match(/^if\s*\(/);
  if (!ifPrefix) {
    return [`${pad}${code}`];
  }

  const openParenIdx = ifPrefix[0].length - 1;
  const closeParenIdx = findMatchingParen(code, openParenIdx);
  if (closeParenIdx < 0) return [`${pad}${code}`];

  const cond = code.slice(openParenIdx + 1, closeParenIdx).trim();
  const openBraceIdx = code.indexOf('{', closeParenIdx);
  if (openBraceIdx < 0) return [`${pad}${code}`];

  const bodyEnd = findMatchingBrace(code, openBraceIdx);
  if (bodyEnd < 0) return [`${pad}${code}`];

  const body = code.slice(openBraceIdx + 1, bodyEnd).trim();
  const rest = code.slice(bodyEnd + 1).trim();

  // Convert if body
  const bodyLin = blockToLin(body, indent + 1);
  result.push(`${pad}?(${cond}){`);
  result.push(...bodyLin);
  result.push(`${pad}}`);

  // Handle else if / else
  if (rest) {
    const elseIfPrefix = rest.match(/^else\s+if\s*\(/);
    const elseMatch = rest.match(/^else\s*\{/);

    if (elseIfPrefix) {
      const eiOpenParen = elseIfPrefix[0].length - 1;
      const eiCloseParen = findMatchingParen(rest, eiOpenParen);
      if (eiCloseParen >= 0) {
        const eicond = rest.slice(eiOpenParen + 1, eiCloseParen).trim();
        const eiOpenBrace = rest.indexOf('{', eiCloseParen);
        if (eiOpenBrace >= 0) {
          const eiBodyEnd = findMatchingBrace(rest, eiOpenBrace);
          if (eiBodyEnd >= 0) {
            const eibody = rest.slice(eiOpenBrace + 1, eiBodyEnd).trim();
            const eirest = rest.slice(eiBodyEnd + 1).trim();

            const eibodyLin = blockToLin(eibody, indent + 1);
            result.push(`${pad}:(${eicond}){`);
            result.push(...eibodyLin);
            result.push(`${pad}}`);

            if (eirest) {
              result.push(...convertIfChain(`if (false) {} ${eirest}`, indent).slice(3));
            }
          }
        }
      }
    } else if (elseMatch) {
      const elseOpenBrace = elseMatch[0].length - 1;
      const elseEnd = findMatchingBrace(rest, elseOpenBrace);

      if (elseEnd >= 0) {
        const elseContent = rest.slice(elseOpenBrace + 1, elseEnd).trim();
        const elseBodyLin = blockToLin(elseContent, indent + 1);
        result.push(`${pad}:{`);
        result.push(...elseBodyLin);
        result.push(`${pad}}`);
      }
    }
  }

  return result;
}

/**
 * Convert a block of TS statements to LIN.
 */
function blockToLin(block, indent) {
  const stmts = splitStatements(block);
  const lines = [];
  for (const stmt of stmts) {
    lines.push(...stmtToLin(stmt, indent));
  }
  return lines;
}

/**
 * Split a block into statements, respecting braces, parens, and strings.
 * Splits on ';' at depth 0, and on '}' when brace depth returns to 0.
 */
function splitStatements(block) {
  const stmts = [];
  let current = '';
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = null;

  for (let i = 0; i < block.length; i++) {
    const c = block[i];

    if (inString) {
      current += c;
      if (c === '\\') { current += block[++i]; continue; }
      if (c === inString) inString = null;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      current += c;
      continue;
    }

    if (c === '{') {
      braceDepth++;
      current += c;
      continue;
    }

    if (c === '}') {
      braceDepth--;
      current += c;
      if (braceDepth === 0) {
        const rest = block.slice(i + 1).trim();
        if (rest.startsWith('else') || rest.startsWith('=')) {
          continue;
        }
        const trimmed = current.trim();
        if (trimmed) stmts.push(trimmed);
        current = '';
      }
      continue;
    }

    if (c === '(') parenDepth++;
    if (c === ')') parenDepth--;

    if (c === ';' && braceDepth === 0 && parenDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) stmts.push(trimmed);
      current = '';
      continue;
    }

    current += c;
  }

  const trimmed = current.trim();
  if (trimmed) stmts.push(trimmed);

  return stmts;
}

/**
 * Convert a canonical TS function to LIN.
 *
 * @param {string} tsCode - Canonical TS function (function name(params) { ... })
 * @param {object} options - { addHeader: boolean }
 * @returns {string} LIN representation
 */
export function tsToLin(tsCode, options = {}) {
  const { addHeader = true } = options;
  const fn = parseTSFunction(tsCode);

  const bodyLin = blockToLin(fn.body, 1);
  const lines = [];

  if (addHeader) {
    lines.push(`@LIN:1.0`);
  }
  lines.push(`!${fn.name}(${fn.params}){`);
  lines.push(...bodyLin);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Full pipeline: TS → LIN → canonical → metrics
 */
export function tsToLinMetrics(tsCode, options = {}) {
  const lin = tsToLin(tsCode, options);
  const canonical = canonicalizeLin(lin);

  return {
    ts_code: tsCode,
    lin_code: lin,
    lin_canonical: canonical,
    ts_tokens: countTokens(tsCode),
    lin_tokens: countTokens(canonical),
    ts_bytes: countBytes(tsCode),
    lin_bytes: countBytes(canonical),
    ir_ratio_tokens: countTokens(canonical) / countTokens(tsCode),
    ir_ratio_bytes: countBytes(canonical) / countBytes(tsCode),
  };
}
