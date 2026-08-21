#!/usr/bin/env python3
"""
Classify the 374 mismatches from GATE 10K by AST/operation semantics.

This script analyzes the LIN code patterns to categorize mismatches into:
- && / || short-circuit value propagation
- Comparison operators (<, <=, >, >=)
- String ↔ number coercion
- Array → primitive conversion
- NaN handling
- null / undefined
- Arithmetic operations
- Array subtraction (array - array)
- Boolean negation (!)
- Other
"""

import json
import re
from collections import Counter, defaultdict

def extract_operators(lin_code):
    """Extract operators and patterns from LIN code."""
    ops = {
        '&&': False,
        '||': False,
        'comparison': False,  # <, <=, >, >=
        'string_number_coercion': False,
        'array_op': False,
        'nan_related': False,
        'null_undefined': False,
        'arithmetic': False,
        'boolean_negation': False,
        'array_subtraction': False,
    }
    
    # Check for && and ||
    if '&&' in lin_code:
        ops['&&'] = True
    if '||' in lin_code:
        ops['||'] = True
    
    # Check for comparison operators
    if re.search(r'[<>]=?', lin_code):
        ops['comparison'] = True
    
    # Check for string literals
    if re.search(r'"str_\d+"', lin_code):
        ops['string_number_coercion'] = True
    
    # Check for array literals
    if re.search(r'\[.*\]', lin_code):
        ops['array_op'] = True
    
    # Check for array subtraction specifically
    if re.search(r'\[.*\]-\[.*\]', lin_code):
        ops['array_subtraction'] = True
    
    # Check for boolean negation
    if '!' in lin_code and '!=' not in lin_code:
        ops['boolean_negation'] = True
    
    # Check for arithmetic operators
    if re.search(r'[+\-*/]', lin_code):
        ops['arithmetic'] = True
    
    return ops

def classify_mismatch(example):
    """Classify a mismatch example into semantic categories."""
    lin_code = example.get('lin_code', '')
    js_expected = example.get('js_expected')
    lin_actual = example.get('lin_actual')
    category = example.get('category', 'OTHER')
    
    ops = extract_operators(lin_code)
    
    classifications = []
    
    # Primary classification based on existing category + operator analysis
    if category == 'BOOLEAN_SHORT_CIRCUIT_VALUE_PROPAGATION':
        if ops['&&']:
            classifications.append('SHORT_CIRCUIT_AND')
        elif ops['||']:
            classifications.append('SHORT_CIRCUIT_OR')
        else:
            classifications.append('BOOLEAN_TYPE_MISMATCH')
    
    elif category == 'STRING_NUMBER_COERCION':
        classifications.append('STRING_NUMBER_COERCION')
    
    elif category == 'OTHER':
        # Analyze the pattern more deeply
        if ops['array_subtraction']:
            classifications.append('ARRAY_SUBTRACTION')
        elif ops['&&']:
            classifications.append('SHORT_CIRCUIT_AND_IN_OTHER')
        elif ops['||']:
            classifications.append('SHORT_CIRCUIT_OR_IN_OTHER')
        elif ops['boolean_negation'] and not ops['arithmetic']:
            classifications.append('BOOLEAN_NEGATION')
        elif ops['string_number_coercion'] and ops['arithmetic']:
            classifications.append('STRING_ARITHMETIC_COERCION')
        elif ops['comparison']:
            classifications.append('COMPARISON_OPERATOR')
        elif ops['array_op']:
            classifications.append('ARRAY_OPERATION')
        elif isinstance(js_expected, float) and str(js_expected) == 'nan':
            classifications.append('NaN_HANDLING')
        elif js_expected is None:
            classifications.append('NULL_UNDEFINED')
        else:
            classifications.append('OTHER_UNCLASSIFIED')
    
    return classifications

def main():
    # Load the mismatches
    with open('storage/lin_10k_mismatches.json', 'r') as f:
        data = json.load(f)
    
    examples = data.get('sample_counterexamples', [])
    categories_summary = data.get('categories', {})
    
    print("=" * 80)
    print("GATE 10K MISMATCH ANALYSIS")
    print("=" * 80)
    print(f"\nTotal programs: {data.get('total_programs', 'N/A')}")
    print(f"Matches: {data.get('matches', 'N/A')}")
    print(f"Mismatches: {sum(categories_summary.values())}")
    print(f"\nOriginal categories: {categories_summary}")
    print()
    
    # Classify all examples
    classified = defaultdict(list)
    for ex in examples:
        classes = classify_mismatch(ex)
        for cls in classes:
            classified[cls].append(ex)
    
    # Print summary
    print("=" * 80)
    print("RECLASSIFIED BY SEMANTIC PATTERN")
    print("=" * 80)
    for cls, exs in sorted(classified.items(), key=lambda x: -len(x[1])):
        print(f"\n{cls}: {len(exs)} cases")
    
    # Show representative examples for each class
    print("\n" + "=" * 80)
    print("REPRESENTATIVE EXAMPLES PER CLASS")
    print("=" * 80)
    
    for cls, exs in sorted(classified.items(), key=lambda x: -len(x[1])):
        print(f"\n--- {cls} ({len(exs)} cases) ---")
        for i, ex in enumerate(exs[:5]):  # Show up to 5 examples per class
            print(f"\n  Case {ex['case_id']}:")
            print(f"    Code: {ex['lin_code']}")
            print(f"    Args: {ex['args']}")
            print(f"    JS expected: {ex['js_expected']}")
            print(f"    LIN actual:  {ex['lin_actual']}")
            print(f"    Original category: {ex['category']}")
    
    # Save detailed classification
    output = {
        'summary': {k: len(v) for k, v in classified.items()},
        'examples_by_class': {k: v for k, v in classified.items()}
    }
    
    with open('storage/lin_10k_classified_374.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n\nDetailed classification saved to: storage/lin_10k_classified_374.json")

if __name__ == '__main__':
    main()
