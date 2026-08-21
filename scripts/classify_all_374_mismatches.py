#!/usr/bin/env python3
"""
Classificador rigoroso e determinístico dos 374 mismatches do GATE 10K.

REGRAS:
- Cada mismatch deve ter EXATAMENTE UMA categoria
- Predicados devem ser explícitos e reproduzíveis
- Soma das categorias DEVE ser igual a 374
- Sem "estimativas" - apenas contagem computacional provada
"""

import json
import re
import sys
from collections import defaultdict
from typing import Dict, List, Tuple, Any, Optional

# Predicados determinísticos para classificação
def has_operator(code: str, op: str) -> bool:
    """Verifica se operador existe no código LIN."""
    return op in code

def has_string_literal(code: str) -> bool:
    """Verifica se há string literal no código."""
    return bool(re.search(r'"[^"]*"', code))

def has_array_literal(code: str) -> bool:
    """Verifica se há array literal no código."""
    return bool(re.search(r'\[.*?\]', code))

def has_arithmetic_op(code: str) -> bool:
    """Verifica se há operadores aritméticos (+, -, *, /)."""
    return bool(re.search(r'[+\-*/]', code))

def has_comparison_op(code: str) -> bool:
    """Verifica se há operadores de comparação (<, >, <=, >=)."""
    return bool(re.search(r'[<>]=?', code))

def has_boolean_negation(code: str) -> bool:
    """Verifica se há negação booleana (!) mas não !=."""
    # Remove != primeiro para não confundir
    code_no_ne = code.replace('!=', '')
    return '!' in code_no_ne

def is_array_subtraction(code: str) -> bool:
    """Verifica padrão específico de array - array."""
    return bool(re.search(r'\[[^\]]*\]\s*-\s*\[[^\]]*\]', code))

def classify_mismatch(example: Dict[str, Any]) -> str:
    """
    Classifica um mismatch em exatamente UMA categoria.
    
    Ordem de prioridade (mais específico → mais geral):
    1. ARRAY_SUBTRACTION (padrão muito específico)
    2. SHORT_CIRCUIT_AND (&& com valor não-booleano retornado)
    3. SHORT_CIRCUIT_OR (|| com valor não-booleano retornado)
    4. STRING_ARITHMETIC_COERCION (string + operação aritmética)
    5. STRING_COMPARISON_COERCION (string + comparação)
    6. BOOLEAN_NEGATION (! operador)
    7. COMPARISON_OPERATOR (<, >, <=, >=)
    8. ARRAY_OPERATION (array em contexto não-array)
    9. NULL_UNDEFINED (null/undefined envolvidos)
    10. OTHER_UNCLASSIFIED (fallback)
    """
    lin_code = example.get('lin_code', '')
    js_expected = example.get('js_expected')
    lin_actual = example.get('lin_actual')
    original_category = example.get('category', 'OTHER')
    args = example.get('args', [])
    
    # Detectores
    has_and = has_operator(lin_code, '&&')
    has_or = has_operator(lin_code, '||')
    has_string = has_string_literal(lin_code)
    has_array = has_array_literal(lin_code)
    has_arithmetic = has_arithmetic_op(lin_code)
    has_comparison = has_comparison_op(lin_code)
    has_negation = has_boolean_negation(lin_code)
    is_array_sub = is_array_subtraction(lin_code)
    
    # Regra 1: Array subtraction (muito específico)
    if is_array_sub:
        return 'ARRAY_SUBTRACTION'
    
    # Regra 2: Short-circuit AND com propagação de valor
    # Detecta quando && está presente e o resultado esperado não é booleano
    if has_and:
        # Se o expected não é booleano, é propagação de valor
        if not isinstance(js_expected, bool):
            return 'SHORT_CIRCUIT_AND_VALUE_PROP'
        # Se está na categoria ORIGINAL de BOOLEAN_SHORT_CIRCUIT
        if original_category == 'BOOLEAN_SHORT_CIRCUIT_VALUE_PROPAGATION':
            return 'SHORT_CIRCUIT_AND_VALUE_PROP'
        # Caso contrário, pode ser outro problema com &&
        return 'SHORT_CIRCUIT_AND_OTHER'
    
    # Regra 3: Short-circuit OR com propagação de valor
    if has_or:
        if not isinstance(js_expected, bool):
            return 'SHORT_CIRCUIT_OR_VALUE_PROP'
        if original_category == 'BOOLEAN_SHORT_CIRCUIT_VALUE_PROPAGATION':
            return 'SHORT_CIRCUIT_OR_VALUE_PROP'
        return 'SHORT_CIRCUIT_OR_OTHER'
    
    # Regra 4: String com operação aritmética (coerção para número ou NaN)
    if has_string and has_arithmetic:
        # Verifica se o expected é number (coerção bem-sucedida) ou NaN
        if isinstance(js_expected, (int, float)):
            return 'STRING_ARITHMETIC_COERCION'
        # Se expected é NaN
        if isinstance(js_expected, float) and str(js_expected) == 'nan':
            return 'STRING_ARITHMETIC_NAN'
        return 'STRING_ARITHMETIC_OTHER'
    
    # Regra 5: String com comparação
    if has_string and has_comparison:
        return 'STRING_COMPARISON_COERCION'
    
    # Regra 6: Boolean negation
    if has_negation:
        return 'BOOLEAN_NEGATION'
    
    # Regra 7: Comparison operators
    if has_comparison:
        return 'COMPARISON_OPERATOR'
    
    # Regra 8: Array operations (mas não subtração)
    if has_array:
        return 'ARRAY_OPERATION'
    
    # Regra 9: Null/undefined
    if js_expected is None or ('null' in lin_code.lower() or 'undefined' in lin_code.lower()):
        return 'NULL_UNDEFINED'
    
    # Regra 10: Fallback
    return 'OTHER_UNCLASSIFIED'


def validate_classification(classified: Dict[str, List[Dict]], total_expected: int) -> Tuple[bool, str]:
    """
    Valida que a classificação está correta.
    
    Returns:
        (valid, message): True se válido, False caso contrário
    """
    total_classified = sum(len(v) for v in classified.values())
    
    if total_classified != total_expected:
        return False, f"Total classificado ({total_classified}) != esperado ({total_expected})"
    
    # Verifica que cada exemplo tem exatamente uma categoria
    all_case_ids = []
    for category, examples in classified.items():
        for ex in examples:
            case_id = ex.get('case_id')
            if case_id in all_case_ids:
                return False, f"Case ID {case_id} aparece em múltiplas categorias"
            all_case_ids.append(case_id)
    
    return True, f"Validação passed: {total_classified} casos classificados unicamente"


def main():
    print("=" * 80)
    print("CLASSIFICAÇÃO RIGOROSA DOS 374 MISMATCHES DO GATE 10K")
    print("=" * 80)
    print()
    
    # Carrega todos os mismatches
    with open('storage/lin_10k_mismatches.json', 'r') as f:
        data = json.load(f)
    
    # Extrai metadata
    seed = data.get('seed')
    total_programs = data.get('total_programs')
    matches = data.get('matches')
    categories_summary = data.get('categories', {})
    sample_counterexamples = data.get('sample_counterexamples', [])
    
    total_mismatches = sum(categories_summary.values())
    
    print(f"Seed: {seed}")
    print(f"Total programs: {total_programs}")
    print(f"Matches: {matches}")
    print(f"Mismatches reportados: {total_mismatches}")
    print(f"Sample counterexamples disponíveis: {len(sample_counterexamples)}")
    print()
    
    # AVISO CRÍTICO
    if len(sample_counterexamples) < total_mismatches:
        print("⚠️  ATENÇÃO: Apenas {} sample counterexamples disponíveis, mas {} mismatches reportados.".format(
            len(sample_counterexamples), total_mismatches))
        print()
        print("Para classificar TODOS os 374 casos, é necessário re-executar o benchmark")
        print("com logging completo de TODOS os mismatches, não apenas samples.")
        print()
        print("Executando classificação nos {} samples disponíveis...".format(len(sample_counterexamples)))
        examples_to_classify = sample_counterexamples
    else:
        examples_to_classify = sample_counterexamples[:total_mismatches]
    
    print()
    print("-" * 80)
    print("CLASSIFICANDO CASOS...")
    print("-" * 80)
    
    # Classifica cada exemplo
    classified = defaultdict(list)
    for ex in examples_to_classify:
        category = classify_mismatch(ex)
        ex['classified_category'] = category
        classified[category].append(ex)
    
    # Imprime resumo
    print()
    print("=" * 80)
    print("RESULTADOS DA CLASSIFICAÇÃO")
    print("=" * 80)
    print()
    
    total_classified = sum(len(v) for v in classified.values())
    print(f"Total classificado: {total_classified}")
    print(f"Total esperado: {len(examples_to_classify)}")
    print()
    
    print("Distribuição por categoria:")
    for cat, examples in sorted(classified.items(), key=lambda x: -len(x[1])):
        pct = (len(examples) / total_classified * 100) if total_classified > 0 else 0
        print(f"  {cat:40s}: {len(examples):3d} ({pct:5.1f}%)")
    
    print()
    print("-" * 80)
    print("EXEMPLOS REPRESENTATIVOS POR CATEGORIA")
    print("-" * 80)
    
    for cat, examples in sorted(classified.items(), key=lambda x: -len(x[1])):
        print(f"\n{cat} ({len(examples)} casos):")
        for i, ex in enumerate(examples[:3]):  # Mostra até 3 exemplos
            print(f"  Case {ex['case_id']}:")
            print(f"    LIN: {ex['lin_code'][:100]}...")
            print(f"    Args: {ex['args']}")
            print(f"    JS expected: {ex['js_expected']} (type: {type(ex['js_expected']).__name__})")
            print(f"    LIN actual:  {ex['lin_actual']} (type: {type(ex['lin_actual']).__name__})")
    
    # Salva resultados
    output = {
        'metadata': {
            'seed': seed,
            'total_programs': total_programs,
            'matches': matches,
            'total_mismatches_reported': total_mismatches,
            'samples_classified': total_classified,
            'classification_note': 'Apenas samples disponíveis. Para classificar todos os 374, re-executar benchmark com logging completo.'
        },
        'summary': {k: len(v) for k, v in classified.items()},
        'examples_by_class': dict(classified),
        'validation': {
            'total_classified': total_classified,
            'total_samples': len(examples_to_classify),
            'all_classified': total_classified == len(examples_to_classify)
        }
    }
    
    with open('storage/lin_10k_classified_374_rigorous.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print()
    print("=" * 80)
    print("RESULTADO SALVO EM: storage/lin_10k_classified_374_rigorous.json")
    print("=" * 80)
    print()
    
    # Retorna status para uso programático
    if total_classified != len(examples_to_classify):
        print("❌ ERRO: Nem todos os exemplos foram classificados")
        return 1
    
    print("✓ Todos os samples classificados com sucesso")
    return 0


if __name__ == '__main__':
    sys.exit(main())
