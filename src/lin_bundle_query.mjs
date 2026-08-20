/**
 * LIN Bundle Query — índice consultável parcial para IA.
 *
 * Permite que a IA consulte partes específicas do bundle
 * sem carregar o aplicativo inteiro no contexto.
 *
 * Redução brutal de tokens:
 *   bundle completo: ~N módulos
 *   query parcial:   ~k módulos onde k << N
 */
import { LINB_FORMAT_VERSION } from './lin_bundle.mjs';
import { generatePartialLoadout, loadoutToContextText } from './lin_ai_manifest.mjs';

/**
 * Consultar um bundle LINB com uma query em linguagem natural ou estruturada.
 *
 * Queries suportadas:
 *   "symbol auth.login"     → módulo + dependências transitivas
 *   "effect network"        → todos os módulos com efeito network
 *   "module payments"       → apenas o módulo payments
 *   "deps auth.login"       → apenas as dependências de auth.login
 *   "all"                   → todos os módulos (慎重)
 *   "search <term>"         → busca por nome em módulos/efeitos
 */
export function queryBundle(bundle, queryString) {
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }

  const q = parseBundleQuery(queryString);
  const modules = bundle.modules || [];
  const results = [];

  switch (q.type) {
    case 'symbol': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) {
        results.push(mod);
        for (const dep of resolveTransitiveDeps(modules, mod)) {
          if (!results.find((r) => r.id === dep.id)) results.push(dep);
        }
      }
      break;
    }
    case 'effect': {
      const effectEntry = (bundle.effects || []).find((e) => e.name === q.target);
      if (effectEntry) {
        for (const modId of effectEntry.modules) {
          const mod = modules.find((m) => m.id === modId);
          if (mod && !results.find((r) => r.id === mod.id)) results.push(mod);
        }
      }
      break;
    }
    case 'module': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) results.push(mod);
      break;
    }
    case 'deps': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) {
        for (const dep of resolveTransitiveDeps(modules, mod)) {
          results.push(dep);
        }
      }
      break;
    }
    case 'type': {
      for (const mod of modules) {
        if (mod.signature?.params?.some((p) => p.type === q.target)) {
          if (!results.find((r) => r.id === mod.id)) results.push(mod);
        }
      }
      break;
    }
    case 'contract': {
      for (const c of bundle.contracts || []) {
        if (c.module === q.target) {
          const mod = modules.find((m) => m.id === c.module);
          if (mod) results.push({ ...mod, _contracts: c });
        }
      }
      break;
    }
    case 'search': {
      const term = q.target.toLowerCase();
      for (const mod of modules) {
        if (
          mod.id.toLowerCase().includes(term) ||
          mod.effects?.some((e) => e.toLowerCase().includes(term)) ||
          mod.calls?.some((c) => c.toLowerCase().includes(term))
        ) {
          if (!results.find((r) => r.id === mod.id)) results.push(mod);
        }
      }
      break;
    }
    case 'all':
    default: {
      results.push(...modules);
    }
  }

  return {
    query: q.original,
    type: q.type,
    target: q.target,
    result_count: results.length,
    total_modules: modules.length,
    compression_ratio: results.length / Math.max(modules.length, 1),
    modules: results.map((m) => ({
      id: m.id,
      signature: m.signature,
      effects: m.effects,
      calls: m.calls,
      contracts: m.contracts || m._contracts,
      hash: m.semantic_hash,
    })),
  };
}

/**
 * Gerar texto otimizado para contexto de IA a partir de uma query.
 * Esta é a função principal para consumo por modelo.
 */
export function queryToContext(bundle, queryString) {
  const result = queryBundle(bundle, queryString);
  const loadout = {
    _format: 'LINB-AI-PARTIAL/1',
    architecture: {
      name: bundle.app?.name || 'unnamed',
      version: bundle.app?.version || '0.0.0',
      semantic_hash: bundle.semantic_hash,
      entrypoints: bundle.entrypoints || [],
      total_modules: bundle.modules?.length || 0,
      total_effects: bundle.effects?.length || 0,
      total_contracts: bundle.contracts?.length || 0,
    },
    modules: result.modules,
    dependency_graph: buildPartialGraph(result.modules),
    effects_index: buildEffectsIndex(result.modules),
    contracts: (bundle.contracts || []).filter((c) =>
      result.modules.some((m) => m.id === c.module)
    ),
    query_info: {
      query: result.query,
      matched: result.result_count,
      total: result.total_modules,
      saved_pct: Math.round((1 - result.compression_ratio) * 100),
    },
  };
  return loadoutToContextText(loadout);
}

/**
 * Listar todos os símbolos disponíveis no bundle (operazione leve).
 */
export function listSymbols(bundle) {
  if (!bundle || !bundle.modules) return [];
  return bundle.modules.map((m) => ({
    id: m.id,
    effects: m.effects,
    params: m.signature?.params?.length || 0,
    hash: m.semantic_hash,
  }));
}

/**
 * Obter estatísticas resumidas do bundle.
 */
export function bundleStats(bundle) {
  if (!bundle || !bundle.modules) return null;
  const mods = bundle.modules;
  return {
    total_modules: mods.length,
    total_symbols: mods.length,
    total_effects: [...new Set(mods.flatMap((m) => m.effects || []))].length,
    total_contracts: (bundle.contracts || []).length,
    total_calls: mods.reduce((s, m) => s + (m.calls?.length || 0), 0),
    semantic_hash: bundle.semantic_hash,
    format: bundle.format,
    app: bundle.app,
  };
}

function parseBundleQuery(raw) {
  const original = String(raw || '').trim();
  const q = original.toLowerCase();

  const prefixPatterns = [
    { re: /^(?:symbol|sym|fn|func|function)[:\s]+(.+)$/i, type: 'symbol' },
    { re: /^(?:effect|eff)[:\s]+(.+)$/i, type: 'effect' },
    { re: /^(?:module|mod)[:\s]+(.+)$/i, type: 'module' },
    { re: /^(?:deps?|depend)[:\s]+(.+)$/i, type: 'deps' },
    { re: /^(?:type|typ)[:\s]+(.+)$/i, type: 'type' },
    { re: /^(?:contract|pre|post)[:\s]+(.+)$/i, type: 'contract' },
    { re: /^(?:search|find|grep)[:\s]+(.+)$/i, type: 'search' },
    { re: /^all$/i, type: 'all' },
  ];

  for (const { re, type } of prefixPatterns) {
    const m = original.match(re);
    if (m) return { type, target: (m[1] || '').trim(), original };
  }

  return { type: 'search', target: original, original };
}

function resolveTransitiveDeps(modules, mod) {
  const visited = new Set();
  const result = [];
  const queue = [...(mod.calls || [])];

  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const dep = modules.find((m) => m.id === name);
    if (dep) {
      result.push(dep);
      queue.push(...(dep.calls || []));
    }
  }

  return result;
}

function buildPartialGraph(modules) {
  const ids = new Set(modules.map((m) => m.id));
  const graph = {};
  for (const m of modules) {
    graph[m.id] = (m.calls || []).filter((c) => ids.has(c));
  }
  return graph;
}

function buildEffectsIndex(modules) {
  const idx = {};
  for (const m of modules) {
    for (const e of m.effects || []) {
      if (!idx[e]) idx[e] = [];
      idx[e].push(m.id);
    }
  }
  return idx;
}
