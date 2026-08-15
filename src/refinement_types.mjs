/**
 * LIN Refinement Types — Idris/Agda/LiquidHaskell style.
 *
 * Syntax in LIN params:
 *   !fn(x:int{0..100}, name:str{len<=64}, items:list{non_empty})
 *
 * The compiler parses these constraints and emits runtime guards
 * at the top of each function for every target language.
 */

/**
 * Parse a refinement annotation from a LIN param type string.
 * Examples:
 *   "int{0..100}"        → { base: 'int', constraints: [{ kind: 'range', min: 0, max: 100 }] }
 *   "str{len<=64}"       → { base: 'str', constraints: [{ kind: 'maxlen', max: 64 }] }
 *   "int{>0}"            → { base: 'int', constraints: [{ kind: 'gt', value: 0 }] }
 *   "list{non_empty}"    → { base: 'list', constraints: [{ kind: 'non_empty' }] }
 *   "str{match=/^[a-z]+$/}" → { base: 'str', constraints: [{ kind: 'match', pattern: '^[a-z]+$' }] }
 */
export function parseRefinement(typeStr) {
  const s = String(typeStr || '').trim();
  const m = s.match(/^([a-z]+)\{(.+)\}$/);
  if (!m) return null;

  const base = m[1];
  const raw = m[2].trim();
  const constraints = [];

  for (const part of raw.split(',').map((p) => p.trim())) {
    // range: 0..100
    const range = part.match(/^(-?\d+)\.\.(-?\d+)$/);
    if (range) {
      constraints.push({ kind: 'range', min: Number(range[1]), max: Number(range[2]) });
      continue;
    }
    // comparison: >0, >=1, <256, <=100
    const cmp = part.match(/^([<>]=?)(-?\d+)$/);
    if (cmp) {
      const op = cmp[1];
      const val = Number(cmp[2]);
      if (op === '>') constraints.push({ kind: 'gt', value: val });
      else if (op === '>=') constraints.push({ kind: 'gte', value: val });
      else if (op === '<') constraints.push({ kind: 'lt', value: val });
      else if (op === '<=') constraints.push({ kind: 'lte', value: val });
      continue;
    }
    // len constraints: len<=64, len>=1, len>0, len<1024
    const lenC = part.match(/^len([<>]=?)(\d+)$/);
    if (lenC) {
      const op = lenC[1];
      const val = Number(lenC[2]);
      if (op === '<=') constraints.push({ kind: 'maxlen', max: val });
      else if (op === '>=') constraints.push({ kind: 'minlen', min: val });
      else if (op === '<') constraints.push({ kind: 'maxlen', max: val - 1 });
      else if (op === '>') constraints.push({ kind: 'minlen', min: val + 1 });
      continue;
    }
    // non_empty
    if (part === 'non_empty') {
      constraints.push({ kind: 'non_empty' });
      continue;
    }
    // not_null
    if (part === 'not_null') {
      constraints.push({ kind: 'not_null' });
      continue;
    }
    // match regex: match=/^[a-z]+$/
    const rx = part.match(/^match=\/(.+)\/$/);
    if (rx) {
      constraints.push({ kind: 'match', pattern: rx[1] });
      continue;
    }
  }

  return constraints.length ? { base, constraints } : null;
}

/**
 * Emit runtime guard code for a single param with refinement constraints.
 */
export function emitRefinementGuard(paramName, refinement, target) {
  if (!refinement) return [];
  const lines = [];

  for (const c of refinement.constraints) {
    if (c.kind === 'range') {
      lines.push(...emitRangeGuard(paramName, c.min, c.max, target));
    } else if (c.kind === 'gt') {
      lines.push(emitCompareGuard(paramName, '>', c.value, target));
    } else if (c.kind === 'gte') {
      lines.push(emitCompareGuard(paramName, '>=', c.value, target));
    } else if (c.kind === 'lt') {
      lines.push(emitCompareGuard(paramName, '<', c.value, target));
    } else if (c.kind === 'lte') {
      lines.push(emitCompareGuard(paramName, '<=', c.value, target));
    } else if (c.kind === 'maxlen') {
      lines.push(...emitLenGuard(paramName, '<=', c.max, target));
    } else if (c.kind === 'minlen') {
      lines.push(...emitLenGuard(paramName, '>=', c.min, target));
    } else if (c.kind === 'non_empty') {
      lines.push(...emitNonEmptyGuard(paramName, target));
    } else if (c.kind === 'not_null') {
      lines.push(...emitNotNullGuard(paramName, target));
    } else if (c.kind === 'match') {
      lines.push(...emitMatchGuard(paramName, c.pattern, target));
    }
  }

  return lines;
}

function emitRangeGuard(p, min, max, t) {
  const msg = `"${p}: must be in range ${min}..${max}"`;
  if (t === 'js' || t === 'ts') return [`  if (${p} < ${min} || ${p} > ${max}) throw new RangeError(${msg});`];
  if (t === 'py') return [`    if not (${min} <= ${p} <= ${max}): raise ValueError(${msg})`];
  if (t === 'go') return [`\tif ${p} < ${min} || ${p} > ${max} { panic(${msg}) }`];
  if (t === 'rust') return [`    assert!(${p} >= ${min} && ${p} <= ${max}, ${msg});`];
  if (t === 'c') return [`  if (${p} < ${min} || ${p} > ${max}) { fprintf(stderr, ${msg}); abort(); }`];
  if (t === 'java') return [`    if (${p} < ${min} || ${p} > ${max}) throw new IllegalArgumentException(${msg});`];
  if (t === 'zig') return [`    if (${p} < ${min} or ${p} > ${max}) @panic(${msg});`];
  return [`  // refinement: ${p} in ${min}..${max}`];
}

function emitCompareGuard(p, op, val, t) {
  const msg = `"${p}: must be ${op} ${val}"`;
  if (t === 'js' || t === 'ts') return `  if (!(${p} ${op} ${val})) throw new RangeError(${msg});`;
  if (t === 'py') return `    if not (${p} ${op} ${val}): raise ValueError(${msg})`;
  if (t === 'go') return `\tif !(${p} ${op} ${val}) { panic(${msg}) }`;
  if (t === 'rust') return `    assert!(${p} ${op} ${val}, ${msg});`;
  if (t === 'java') return `    if (!(${p} ${op} ${val})) throw new IllegalArgumentException(${msg});`;
  return `  // refinement: ${p} ${op} ${val}`;
}

function emitLenGuard(p, op, val, t) {
  const msg = `"${p}: length must be ${op} ${val}"`;
  if (t === 'js' || t === 'ts') return [`  if (!(${p}.length ${op} ${val})) throw new RangeError(${msg});`];
  if (t === 'py') return [`    if not (len(${p}) ${op} ${val}): raise ValueError(${msg})`];
  if (t === 'go') return [`\tif !(len(${p}) ${op} ${val}) { panic(${msg}) }`];
  if (t === 'rust') return [`    assert!(${p}.len() ${op} ${val}, ${msg});`];
  if (t === 'java') return [`    if (!(${p}.length() ${op} ${val})) throw new IllegalArgumentException(${msg});`];
  return [`  // refinement: len(${p}) ${op} ${val}`];
}

function emitNonEmptyGuard(p, t) {
  const msg = `"${p}: must be non-empty"`;
  if (t === 'js' || t === 'ts') return [`  if (!${p} || ${p}.length === 0) throw new RangeError(${msg});`];
  if (t === 'py') return [`    if not ${p}: raise ValueError(${msg})`];
  if (t === 'go') return [`\tif len(${p}) == 0 { panic(${msg}) }`];
  if (t === 'rust') return [`    assert!(!${p}.is_empty(), ${msg});`];
  if (t === 'java') return [`    if (${p} == null || ${p}.isEmpty()) throw new IllegalArgumentException(${msg});`];
  return [`  // refinement: ${p} non_empty`];
}

function emitNotNullGuard(p, t) {
  const msg = `"${p}: must not be null"`;
  if (t === 'js' || t === 'ts') return [`  if (${p} == null) throw new TypeError(${msg});`];
  if (t === 'py') return [`    if ${p} is None: raise TypeError(${msg})`];
  if (t === 'go') return [`\tif ${p} == nil { panic(${msg}) }`];
  if (t === 'rust') return [`    // ${p} is non-optional by type`];
  if (t === 'java') return [`    java.util.Objects.requireNonNull(${p}, ${msg});`];
  return [`  // refinement: ${p} not_null`];
}

function emitMatchGuard(p, pattern, t) {
  const msg = `"${p}: must match /${pattern}/"`;
  if (t === 'js' || t === 'ts') return [`  if (!/${pattern}/.test(${p})) throw new RangeError(${msg});`];
  if (t === 'py') return [`    import re`, `    if not re.match(r'${pattern}', ${p}): raise ValueError(${msg})`];
  if (t === 'go') return [`\tif matched, _ := regexp.MatchString("${pattern}", ${p}); !matched { panic(${msg}) }`];
  if (t === 'rust') return [`    // regex guard: ${pattern}`];
  if (t === 'java') return [`    if (!${p}.matches("${pattern}")) throw new IllegalArgumentException(${msg});`];
  return [`  // refinement: ${p} match /${pattern}/`];
}
