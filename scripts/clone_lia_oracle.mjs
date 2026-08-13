/**
 * Exact semantic-hash oracle helpers for clone-lia loop.
 * Rule: semantic_hash_exact_like_P200 — no soft match / padding.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emitAilFromSource, extractJsFunctions } from '../src/emitter.mjs';
import { compileLiaToJs } from '../src/compiler.mjs';

const require = createRequire(import.meta.url);

export function hashOutputs(outputs) {
  return crypto.createHash('sha256').update(JSON.stringify(outputs.map((x) => String(x)))).digest('hex');
}

export function holdoutArgs(arity, n = 8) {
  const seeds = [
    [0], [1], [2], [-1], [''], ['a'], ['foo'],
    [0, 1], [1, 2], ['a', 'b'], ['foo', 'bar'], ['', ''], [1, 2, 3], [3, 2, '0'],
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = seeds[i % seeds.length];
    const args = [];
    for (let j = 0; j < arity; j++) args.push(s[j % s.length]);
    out.push(args);
  }
  return out;
}

export function unsupported(fn) {
  const body = String(fn.body || '');
  const params = (fn.params || []).join(',');
  if (/\b(async|await|yield)\b/.test(body)) return 'async_gen';
  if (/\.\.\./.test(params) || /[{[]/.test(params)) return 'complex_params';
  if (/<[A-Z]/.test(params)) return 'generics';
  if (/`/.test(body)) return 'template_literal';
  if (/\brequire\s*\(/.test(body) || /\bimport\b/.test(body) || /\bexport\b/.test(body)) return 'host_or_module_ref';
  // Capitalized module-ish free refs (C.M), not builtins Math/JSON/Object/...
  const builtins = /^(Math|JSON|Object|Array|String|Number|Boolean|Date|Error|RegExp|Buffer|console|Promise|Symbol|Map|Set|WeakMap|WeakSet|Reflect|Intl)$/;
  const caps = body.match(/\b([A-Z][A-Za-z0-9_]*)\./g) || [];
  for (const m of caps) {
    const id = m.slice(0, -1);
    if (!builtins.test(id)) return 'host_or_module_ref';
  }
  return null;
}

function loadFn(js, name) {
  const tmp = path.join(os.tmpdir(), `lia_clo_${name}_${crypto.randomBytes(3).toString('hex')}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  try {
    delete require.cache[tmp];
    const mod = require(tmp);
    const fn = typeof mod === 'function' ? mod : mod[name] || mod.default;
    if (typeof fn !== 'function') {
      fs.rmSync(tmp, { force: true });
      return { ok: false, reason: 'not_fn', tmp: null };
    }
    return { ok: true, fn, tmp };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    return { ok: false, reason: String(e.message || e).slice(0, 160), tmp: null };
  }
}

function rm(tmp) {
  try {
    if (tmp) fs.rmSync(tmp, { force: true });
  } catch {
    /* ignore */
  }
}

export function runCases(fn, cases) {
  return cases.map((a) => {
    try {
      return String(fn(...a));
    } catch (e) {
      return `ERROR:${e.message || e}`;
    }
  });
}

/** Build oracle from classic/arrow-extracted fn source body. */
export function oracleFromFn(fn) {
  const bad = unsupported(fn);
  if (bad) return { status: 'skip', reason: bad, name: fn.name };
  const raw = `function ${fn.name}(${fn.params.join(',')}){${fn.body}}`;
  const wrapped = `${raw}\nmodule.exports=${fn.name};\n`;
  const o = loadFn(wrapped, fn.name);
  if (!o.ok) return { status: 'skip', reason: `orig:${o.reason}`, name: fn.name };
  const cases = holdoutArgs(fn.params.length, 8);
  const outputs = runCases(o.fn, cases);
  rm(o.tmp);
  return {
    status: 'ok',
    name: fn.name,
    params: fn.params,
    body: fn.body,
    cases,
    outputs,
    hash: hashOutputs(outputs),
  };
}

/** Emit LIA → compile → exact hash vs oracle. */
export function verifyFnAgainstOracle(oracle) {
  const classic = `function ${oracle.name}(${oracle.params.join(',')}){${oracle.body}}`;
  let lia;
  try {
    lia = emitAilFromSource(classic, { shortenLocals: true });
  } catch (e) {
    return { status: 'fail', stage: 'emit', reason: String(e.message || e), name: oracle.name };
  }
  if (!lia || !lia.includes(`!${oracle.name}(`)) {
    return { status: 'skip', stage: 'emit', reason: 'emit_empty', name: oracle.name };
  }
  let compiled;
  try {
    compiled = compileLiaToJs(lia, { exportMode: 'single' });
  } catch (e) {
    return {
      status: 'fail', stage: 'compile', reason: String(e.message || e), name: oracle.name, lia,
    };
  }
  const c = loadFn(compiled.js, oracle.name);
  if (!c.ok) {
    return {
      status: 'fail', stage: 'runtime', reason: c.reason, name: oracle.name, lia, js: compiled.js,
    };
  }
  const outputs = runCases(c.fn, oracle.cases);
  rm(c.tmp);
  const hash = hashOutputs(outputs);
  let match = 0;
  for (let i = 0; i < oracle.outputs.length; i++) {
    if (outputs[i] === oracle.outputs[i]) match++;
  }
  const behavior_eq = oracle.outputs.length ? match / oracle.outputs.length : 0;
  const hash_match = hash === oracle.hash;
  const ok = behavior_eq === 1.0 && hash_match;
  return {
    status: ok ? 'pass' : 'fail',
    stage: 'verify',
    name: oracle.name,
    behavior_eq,
    hash_match,
    hash,
    oracle_hash: oracle.hash,
    outputs,
    lia,
    js: compiled.js,
    reason: ok ? null : 'holdout_mismatch',
  };
}

function stripTsLight(src) {
  let s = String(src);
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  s = s.replace(/\bfunction\s+([A-Za-z_$][\w$]*)\s*<[^>]+>\s*\(/g, 'function $1(');
  s = s.replace(/\)\s*:\s*[^{;]+\{/g, '){');
  s = s.replace(/\s+as\s+const\b/g, '');
  s = s.replace(/\s+as\s+[A-Za-z_$][\w$<>\[\]|&.,\s]*/g, '');
  s = s.replace(/([A-Za-z_$0-9)\]])\!(?=\s*([.;,)\]\}\[]|$))/g, '$1');
  return s;
}

export function extractFromFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (/\.tsx?$/i.test(filePath)) text = stripTsLight(text);
  return { text, fns: extractJsFunctions(text) };
}

export function walkJs(root) {
  const SKIP = /[\\/](\.git|node_modules|dist|build|coverage|test(s)?|vendor|docs?|\.husky)([\\/]|$)/i;
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.test(p + path.sep)) stack.push(p);
      } else if (/\.(js|mjs|cjs|ts|tsx)$/i.test(e.name) && !SKIP.test(p)
        && !/\.(test|spec)\./i.test(e.name)) {
        out.push(p);
      }
    }
  }
  return out;
}
