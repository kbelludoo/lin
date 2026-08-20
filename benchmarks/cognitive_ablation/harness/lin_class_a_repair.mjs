/**
 * lin_class_a_repair.mjs — Engine Determinístico de Reparo Classe A para LIN
 * 
 * Regras estritas:
 * 1. Não altera código que já seja sintaticamente válido.
 * 2. Aplica apenas transformações inequívocas e seguras (Classe A).
 * 3. Retorna metadados estruturados sobre o reparo.
 */

export class LinClassARepairEngine {
  constructor() {
    this.rules = [
      {
        id: 'REMOVE_REDUNDANT_RETURN_BEFORE_LIN_RETURN_SIGIL',
        description: 'Remove a palavra-chave redundante "return" imediatamente antes do sigilo de retorno LIN "^"',
        confidence: 'deterministic',
        semantic_risk: 'none',
        match: (code) => /\breturn\s+\^/g.test(code),
        apply: (code) => code.replace(/\breturn\s+\^/g, '^')
      },
      {
        id: 'NORMALIZE_IF_WRAPPING_LIN_CONDITIONAL',
        description: 'Normaliza "if(?(cond))" ou "if(?(cond){...})" gerado por confusão sintática JS/LIN',
        confidence: 'deterministic',
        semantic_risk: 'none',
        match: (code) => /\bif\s*\(\s*\?\s*\(/g.test(code),
        apply: (code) => code.replace(/\bif\s*\(\s*\?\s*\(([^)]+)\)\s*\)/g, '?($1)')
      },
      {
        id: 'NORMALIZE_ELSE_IF_WRAPPING_LIN_CONDITIONAL',
        description: 'Normaliza "else if(?(cond))" para ":(cond)"',
        confidence: 'deterministic',
        semantic_risk: 'none',
        match: (code) => /\belse\s+if\s*\(\s*\?\s*\(/g.test(code),
        apply: (code) => code.replace(/\belse\s+if\s*\(\s*\?\s*\(([^)]+)\)\s*\)/g, ':($1)')
      }
    ];
  }

  /**
   * Tenta aplicar reparos Classe A em código candidato
   * @param {string} code - Código original gerado pelo modelo
   * @returns {{ repaired: boolean, original_code: string, repaired_code: string, applied_rules: Array }}
   */
  repair(code) {
    let current = code;
    const applied = [];

    for (const rule of this.rules) {
      if (rule.match(current)) {
        const before = current;
        current = rule.apply(current);
        if (current !== before) {
          applied.push({
            rule_id: rule.id,
            description: rule.description,
            confidence: rule.confidence,
            semantic_risk: rule.semantic_risk
          });
        }
      }
    }

    return {
      repaired: applied.length > 0,
      original_code: code,
      repaired_code: current,
      applied_rules: applied
    };
  }
}
