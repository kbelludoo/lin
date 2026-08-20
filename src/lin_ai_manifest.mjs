/**
 * AI Manifest — índice para navegação da IA sobre um LINB bundle.
 *
 * Produz um documento otimizado para consumo por modelo de linguagem:
 * - arquitetura do app
 * - módulos com assinaturas semânticas
 * - grafo de dependências
 * - efeitos colaterais
 * - contratos
 * - entrada para consulta parcial (sem carregar tudo no contexto)
 */
import { LINB_FORMAT_VERSION } from './lin_bundle.mjs';

/**
 * Gerar o AI Manifest completo a partir de um bundle LINB.
 * Este é o documento que a IA recebe para entender o app.
 */
export function generateAILoadout(bundle) {
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }

  const modules = bundle.modules || [];
  const symbols = bundle.symbols || [];
  const effects = bundle.effects || [];
  const contracts = bundle.contracts || [];
  const ai = bundle.ai_manifest || {};

  return {
    _format: 'LINB-AI-LOADOUT/1',
    _purpose: 'Documento otimizado para consumo por modelo de linguagem. Não contém código — apenas estrutura semântica.',

    architecture: {
      name: bundle.app?.name || 'unnamed',
      version: bundle.app?.version || '0.0.0',
      semantic_hash: bundle.semantic_hash,
      entrypoints: bundle.entrypoints || [],
      total_modules: modules.length,
      total_effects: effects.length,
      total_contracts: contracts.length,
    },

    modules: modules.map((m) => ({
      id: m.id,
      signature: m.signature,
      effects: m.effects,
      calls: m.calls,
      hash: m.semantic_hash,
    })),

    dependency_graph: ai.dependency_graph || buildSimpleDeps(modules),

    effects_index: Object.fromEntries(
      effects.map((e) => [e.name, e.modules])
    ),

    contracts: contracts,

    type_index: bundle.types
      ? Object.fromEntries(bundle.types.map((t) => [t.name, t.usages]))
      : {},

    query_hints: {
      total_tokens_estimate: estimateTokens(modules),
      suggested_queries: [
        'Onde a autenticação ocorre?',
        'Quais módulos acessam banco de dados?',
        'O que depende de User?',
        'Quais efeitos colaterais existem?',
        'Quais são os pré/pós-condições de payment.process?',
        'Mostre o grafo de dependências do módulo auth',
      ],
    },
  };
}

function buildSimpleDeps(modules) {
  const graph = {};
  for (const m of modules) {
    graph[m.id] = m.calls.filter((c) => modules.some((x) => x.id === c));
  }
  return graph;
}

function estimateTokens(modules) {
  let chars = 0;
  for (const m of modules) {
    chars += m.id.length;
    chars += JSON.stringify(m.signature).length;
    chars += m.effects.join(',').length;
    chars += m.calls.join(',').length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Gerar um loadout parcial para um ou mais módulos específicos.
 * A IA não precisa carregar o app inteiro.
 */
export function generatePartialLoadout(bundle, query) {
  if (!bundle || bundle.format !== LINB_FORMAT_VERSION) {
    throw new Error('LINB_INVALID_FORMAT');
  }

  const modules = bundle.modules || [];
  const q = parseQuery(query);
  let selected = [];

  switch (q.type) {
    case 'symbol': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) {
        selected = [mod, ...resolveDeps(modules, mod)];
      }
      break;
    }
    case 'effect': {
      selected = modules.filter((m) => m.effects.includes(q.target));
      for (const m of [...selected]) selected.push(...resolveDeps(modules, m));
      break;
    }
    case 'module': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) selected = [mod];
      break;
    }
    case 'deps': {
      const mod = modules.find((m) => m.id === q.target);
      if (mod) selected = resolveDeps(modules, mod);
      break;
    }
    case 'all':
    default:
      selected = modules;
  }

  const unique = [...new Map(selected.map((m) => [m.id, m])).values()];

  return {
    _format: 'LINB-AI-PARTIAL/1',
    query: q,
    modules: unique.map((m) => ({
      id: m.id,
      signature: m.signature,
      effects: m.effects,
      calls: m.calls,
      contracts: m.contracts,
      hash: m.semantic_hash,
    })),
    resolved_count: unique.length,
    total_modules: modules.length,
  };
}

function resolveDeps(modules, mod) {
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
      queue.push(...dep.calls);
    }
  }

  return result;
}

function parseQuery(raw) {
  const q = String(raw || '').trim().toLowerCase();
  const prefixMatch = q.match(/^(symbol|effect|module|deps)[:\s]+(.+)$/i);
  if (prefixMatch) {
    return { type: prefixMatch[1].toLowerCase(), target: prefixMatch[2].trim() };
  }
  return { type: 'all', target: null };
}

/**
 * Serializar loadout para texto otimizado para contexto de modelo.
 * Formato compacto com marcadores para facilitar parsing pela IA.
 */
export function loadoutToContextText(loadout) {
  const lines = [];
  const a = loadout.architecture || {};

  lines.push(`# LIN App: ${a.name || '?'} v${a.version || '?'}`);
  lines.push(`Semantic Hash: ${a.semantic_hash || '?'}`);
  lines.push(`Modules: ${a.total_modules} | Effects: ${a.total_effects} | Contracts: ${a.total_contracts}`);
  lines.push(`Entrypoints: ${(a.entrypoints || []).join(', ') || 'none'}`);
  lines.push('');

  if (loadout.modules?.length) {
    lines.push('## Modules');
    for (const m of loadout.modules) {
      const params = (m.signature?.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
      const ret = m.signature?.returns || '?';
      lines.push(`- \`${m.id}\`(${params}) -> ${ret} [${(m.effects || []).join(',')}] hash:${m.hash}`);
      if (m.calls?.length) lines.push(`  calls: ${m.calls.join(', ')}`);
    }
    lines.push('');
  }

  if (loadout.contracts?.length) {
    lines.push('## Contracts');
    for (const c of loadout.contracts) {
      if (c.pre?.length) lines.push(`- ${c.module} PRE: ${c.pre.join(' AND ')}`);
      if (c.post?.length) lines.push(`- ${c.module} POST: ${c.post.join(' AND ')}`);
    }
    lines.push('');
  }

  if (loadout.effects_index && Object.keys(loadout.effects_index).length) {
    lines.push('## Effects Index');
    for (const [effect, mods] of Object.entries(loadout.effects_index)) {
      lines.push(`- ${effect}: ${mods.join(', ')}`);
    }
    lines.push('');
  }

  if (loadout.dependency_graph) {
    lines.push('## Dependency Graph');
    for (const [id, deps] of Object.entries(loadout.dependency_graph)) {
      if (deps?.length) lines.push(`- ${id} -> ${deps.join(', ')}`);
    }
  }

  return lines.join('\n');
}
