/**
 * LIN App Bundle (LINB/1) — formato de bundle legível por IA.
 *
 * Fluxo:
 *   LIN source → parseLia → IR → extrair semântica → LINB → (opcional) Brotli → Base64URL → URL
 *
 * O bundle NÃO é apenas código textual. Contém estrutura semântica que a IA
 * pode consultar diretamente sem precisar inferir a partir do texto.
 */
import { parseLia } from './compiler.mjs';
import { tryParseStmts, collectAssignedIds } from './body_ast.mjs';
import {
  contentHash,
  computeModuleSemanticHash,
  buildContentRegistry,
} from './content_hash.mjs';
import {
  inferTypes,
  parseParamList,
  rewriteFnValues,
  safeEmitId,
  isJsRuntimeOnly,
} from './emit_shared.mjs';
import { rewriteSafeParamIds, rawParamNames } from './emit_safe_ids_load.mjs';

export const LINB_FORMAT_VERSION = 'LINB/1';

/**
 * Extrair efeitos declarados do corpo de uma função LIN.
 * Detecta padrões: console., fetch(, require(, process., document., throw.
 */
function extractEffects(body) {
  const effects = [];
  const s = String(body || '');
  if (/\bthrow\b/.test(s)) effects.push('throw');
  if (/console\./.test(s)) effects.push('io');
  if (/\bfetch\(/.test(s)) effects.push('network');
  if (/\brequire\(/.test(s) || /\bimport\b/.test(s)) effects.push('module');
  if (/process\./.test(s)) effects.push('system');
  if (/document\./.test(s) || /window\./.test(s)) effects.push('dom');
  if (/setTimeout|setInterval/.test(s)) effects.push('async');
  if (effects.length === 0) effects.push('pure');
  return effects;
}

/**
 * Extrair chamadas de função do corpo (identificadores seguidos de '(').
 */
function extractCalls(body) {
  const calls = [];
  const callRe = /\b([A-Za-z_$][\w$.]*)\s*\(/g;
  let m;
  while ((m = callRe.exec(body)) !== null) {
    const name = m[1];
    if (!/^(if|else|while|for|return|throw|switch|case|var|let|const|typeof|function|new|in|of)$/.test(name)) {
      calls.push(name);
    }
  }
  return [...new Set(calls)];
}

/**
 * Extrair pré/pós-condições rudimentares do corpo.
 */
function extractContracts(name, params, body) {
  const pre = [];
  const post = [];
  const paramList = params.split(',').map((p) => p.trim()).filter(Boolean);

  for (const p of paramList) {
    const pName = p.replace(/:.+$/, '').trim();
    if (p.includes('{') && p.includes('}')) {
      const constraint = p.match(/\{([^}]+)\}/);
      if (constraint) pre.push(`${pName} ${constraint[1]}`);
    }
  }

  const returnStmts = (body || '').match(/\^([^;}\n]+)/g);
  if (returnStmts) {
    for (const r of returnStmts) {
      const expr = r.slice(1).trim();
      if (/==\s*null|===\s*null/.test(expr)) post.push('result == null');
      else if (/!=\s*null|!==\s*null/.test(expr)) post.push('result != null');
      else if (/^!/.test(expr)) post.push('result is truthy');
    }
  }

  return { pre, post };
}

/**
 * Construir um módulo semântico para uma função LIN.
 */
function buildSemanticModule(fn, prog) {
  const rawNames = rawParamNames(fn.params);
  const { names: paramNames } = parseParamList(fn.params);

  const bodyStmts = tryParseStmts(fn.body);
  const inferred = bodyStmts ? inferTypes(bodyStmts) : new Map();

  const paramTypes = paramNames.map((p) => {
    const cleanName = safeEmitId(p);
    const raw = (fn.rawParams || fn.params || '')
      .split(',')
      .map((s) => s.trim())
      .find((rp) => rp.replace(/:.+$/, '').trim() === p);
    if (raw && raw.includes(':')) return raw.split(':')[1].trim();
    const inf = inferred.get(cleanName);
    return inf || 'any';
  });

  const hash = contentHash(fn.name, fn.params, fn.body);
  const effects = extractEffects(fn.body);
  const calls = extractCalls(fn.body);
  const contracts = extractContracts(fn.name, fn.params, fn.body);

  return {
    id: fn.name,
    kind: 'function',
    signature: {
      params: paramNames.map((p, i) => ({
        name: safeEmitId(p),
        type: paramTypes[i] || 'any',
      })),
      returns: fn.returnType || 'any',
    },
    effects,
    calls,
    contracts,
    semantic_hash: hash,
    body_length: (fn.body || '').length,
  };
}

/**
 * Construir o grafo de dependências entre funções.
 */
function buildDependencyGraph(modules) {
  const graph = {};
  for (const mod of modules) {
    graph[mod.id] = {
      depends_on: mod.calls.filter((c) => modules.some((m) => m.id === c)),
      depended_by: [],
    };
  }
  for (const [id, entry] of Object.entries(graph)) {
    for (const dep of entry.depends_on) {
      if (graph[dep]) graph[dep].depended_by.push(id);
    }
  }
  return graph;
}

/**
 * Construir o AI Manifest a partir de módulos semânticos.
 */
export function buildAIManifest(modules, opts = {}) {
  const graph = buildDependencyGraph(modules);

  const allEffects = [...new Set(modules.flatMap((m) => m.effects))];
  const allCalls = [...new Set(modules.flatMap((m) => m.calls))];
  const entrypoints = opts.entrypoints || modules
    .filter((m) => !allCalls.includes(m.id) || opts.entrypoints?.includes(m.id))
    .map((m) => m.id);

  return {
    manifest_version: 'AIM/1',
    entrypoints,
    stats: {
      modules: modules.length,
      functions: modules.length,
      effects: allEffects,
      total_body_bytes: modules.reduce((s, m) => s + (m.body_length || 0), 0),
    },
    indices: {
      symbol_to_module: Object.fromEntries(modules.map((m) => [m.id, m.id])),
      function_to_calls: Object.fromEntries(modules.map((m) => [m.id, m.calls])),
      effect_to_modules: Object.fromEntries(
        allEffects.map((e) => [e, modules.filter((m) => m.effects.includes(e)).map((m) => m.id)])
      ),
      type_to_usages: Object.fromEntries(
        [...new Set(modules.flatMap((m) => m.signature.params.map((p) => p.type)))].map((t) => [
          t,
          modules.filter((m) => m.signature.params.some((p) => p.type === t)).map((m) => m.id),
        ])
      ),
      module_to_dependencies: Object.fromEntries(
        Object.entries(graph).map(([id, g]) => [id, g.depends_on])
      ),
    },
    dependency_graph: graph,
  };
}

/**
 * Empacotar um programa LIN parsed em formato LINB/1.
 *
 * @param {string} liaText - código fonte LIN
 * @param {object} opts - { name, version, entrypoints, targets[] }
 * @returns {object} bundle LINB/1
 */
export function packLinb(liaText, opts = {}) {
  const prog = parseLia(liaText);
  const modules = prog.fns.map((fn) => buildSemanticModule(fn, prog));
  const manifest = buildAIManifest(modules, { entrypoints: opts.entrypoints });

  const registry = buildContentRegistry(prog);
  const moduleHash = computeModuleSemanticHash(
    prog.fns.map((fn) => ({
      name: fn.name,
      params: fn.params,
      hash: registry[Object.keys(registry).find((k) => registry[k].name === fn.name)]?.hash || contentHash(fn.name, fn.params, fn.body),
      body: fn.body,
    })),
    prog.consts,
    prog.exports,
  );

  const symbols = modules.map((m) => ({
    name: m.id,
    hash: m.semantic_hash,
    effects: m.effects,
  }));

  return {
    format: LINB_FORMAT_VERSION,
    app: {
      name: opts.name || 'unnamed',
      version: opts.version || '0.0.0',
    },
    semantic_hash: moduleHash,
    source_header: prog.header,
    modules,
    symbols,
    types: [...new Set(modules.flatMap((m) => m.signature.params.map((p) => p.type)))].map((t) => ({
      name: t,
      usages: modules.filter((m) => m.signature.params.some((p) => p.type === t)).map((m) => m.id),
    })),
    effects: [...new Set(modules.flatMap((m) => m.effects))].map((e) => ({
      name: e,
      modules: modules.filter((m) => m.effects.includes(e)).map((m) => m.id),
    })),
    contracts: modules.filter((m) => m.contracts.pre.length || m.contracts.post.length).map((m) => ({
      module: m.id,
      pre: m.contracts.pre,
      post: m.contracts.post,
    })),
    dependencies: manifest.indices.module_to_dependencies,
    entrypoints: manifest.entrypoints,
    ai_manifest: manifest,
    consts: prog.consts || null,
    exports: prog.exports,
  };
}

/**
 * Desserializar um bundle LINB/1 de volta para LIN source.
 * Permite roundtrip: LIN → LINB → LIN.
 */
export function unpackToLin(bundle) {
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }

  const lines = [];
  if (bundle.source_header) lines.push(bundle.source_header);
  lines.push('^schema_once');

  if (bundle.consts) {
    const entries = Object.entries(bundle.consts);
    if (entries.length) {
      lines.push('$K{' + entries.map(([k, v]) => `${k}=${v}`).join(' ') + '}');
    }
  }

  for (const mod of bundle.modules) {
    const rawParams = (mod.signature.params || [])
      .map((p) => {
        if (p.type && p.type !== 'any') return `${p.name}: ${p.type}`;
        return p.name;
      })
      .join(',');
    const retPart = mod.signature.returns && mod.signature.returns !== 'any'
      ? ` -> ${mod.signature.returns}`
      : '';
    lines.push(`!${mod.id}(${rawParams})${retPart}{/* ${mod.semantic_hash} */}`);
  }

  if (bundle.exports && bundle.exports.length) {
    lines.push(`=ex{${bundle.exports.join(',')}}`);
  }

  return lines.join('\n');
}

/**
 * Serializar bundle para JSON string.
 */
export function serializeLinb(bundle) {
  return JSON.stringify(bundle, null, 0);
}

/**
 * Desserializar bundle de JSON string.
 */
export function deserializeLinb(json) {
  const bundle = typeof json === 'string' ? JSON.parse(json) : json;
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }
  return bundle;
}
