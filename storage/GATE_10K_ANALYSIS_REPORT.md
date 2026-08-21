# GATE 10K Analysis Report

## Executive Summary

**Status:** GATE 10K - Strong improvement, but NOT yet closed

### Key Metrics
- **Total programs:** 10,000
- **Matches:** 9,626 (96.3%)
- **Mismatches:** 374 (3.7%)
- **Reduction from previous:** 1,169 → 374 (**68% reduction in divergences**)
- **Mutation score:** 3/3 (100% - all mutants killed)

---

## Mismatch Classification by Semantic Pattern

The 374 mismatches have been classified into semantic categories based on AST/operation analysis:

### Root Cause Distribution (Estimated)

| Category | Sample Count | Estimated Total | % of Total |
|----------|-------------|-----------------|------------|
| STRING_ARITHMETIC_COERCION | 16 | ~120 | 34% |
| SHORT_CIRCUIT_AND_IN_OTHER | 9 | ~67 | 18% |
| BOOLEAN_TYPE_MISMATCH | 8 | ~60 | 16% |
| COMPARISON_OPERATOR | 6 | ~45 | 12% |
| SHORT_CIRCUIT_OR_IN_OTHER | 4 | ~30 | 8% |
| BOOLEAN_NEGATION | 4 | ~30 | 8% |
| SHORT_CIRCUIT_AND | 1 | ~7 | 2% |
| STRING_NUMBER_COERCION | 1 | ~7 | 2% |
| OTHER_UNCLASSIFIED | 1 | ~7 | 2% |

### Grouped by Root Cause

1. **Short-circuit (&& ||) value propagation:** ~104 cases (28%)
2. **String/number coercion in arithmetic:** ~127 cases (34%)
3. **Boolean type/comparison issues:** ~90 cases (24%)
4. **Comparison operators (< > <= >=):** ~45 cases (12%)
5. **Other/Unclassified:** ~7 cases (2%)

---

## Representative Examples by Priority

### 1. STRING_ARITHMETIC_COERCION (~120 cases)

**Issue:** String operations with arithmetic produce incorrect coercion

**Example Case 108:**
```
LIN: !prog_108(a,b,c){res=(((!43)-("str_6"*false))+(["str_8",17,"str_28"]+(45!=-14)));^res}
Args: [-4, 16, 28]
JS expected: 'NaNstr_8,17,str_28true'
LIN actual:  '0str_8,17,str_28true'
```
**Root cause:** `"str_6"*false` should be `NaN`, but LIN produces `0`

**Example Case 234:**
```
LIN: !prog_234(a,b,c){res=((!(29<b))-(43+(a*"str_37")));^res}
Args: [9, 9, 7]
JS expected: None
LIN actual:  -42
```
**Root cause:** `a*"str_37"` should be `NaN`, affecting downstream arithmetic

---

### 2. SHORT_CIRCUIT_AND_IN_OTHER (~67 cases)

**Issue:** `&&` operator not preserving operand value correctly

**Example Case 17:**
```
LIN: !prog_17(a,b,c){res=((true&&44)-(false*-5));^res}
Args: [16, -2, 18]
JS expected: 44
LIN actual:  49
```
**Root cause:** `(true&&44)` correctly evaluates to `44`, but `(false*-5)` should be `-0` or the subtraction is being evaluated differently. JS: `44 - 0 = 44`, LIN: `44 - (-5) = 49`

**Example Case 349:**
```
LIN: !prog_349(a,b,c){res=(((a||23)&&23)*("str_41">=[c,50]));^res}
Args: [10, -4, 15]
JS expected: 23
LIN actual:  0
```
**Root cause:** Short-circuit value `23` not being propagated; comparison with array may also be involved

---

### 3. BOOLEAN_TYPE_MISMATCH (~60 cases)

**Issue:** Array operations and boolean comparisons not matching JS semantics

**Example Case 160:**
```
LIN: !prog_160(a,b,c){res=([c,true,-17]-[50,c,38]);^res}
Args: [10, 24, 15]
JS expected: None
LIN actual:  [15, True, None]
```
**Root cause:** Array subtraction `[...] - [...]` should produce `null` in JS, but LIN keeps the array structure

**Example Case 287:**
```
LIN: !prog_287(a,b,c){res=("str_28">"str_38");^res}
Args: [10, 13, 10]
JS expected: False
LIN actual:  'str_28">"str_38'
```
**Root cause:** String comparison not being evaluated; code appears unparsed

---

## Recommended Fix Priority

### Phase 1: High-Impact Fixes (~247 cases, 66%)

1. **STRING_ARITHMETIC_COERCION** (120 cases)
   - Fix: Ensure string*number, string-number, etc. produce NaN, not 0
   - Impact: 32% of total mismatches

2. **SHORT_CIRCUIT_AND_IN_OTHER** (67 cases)
   - Fix: Preserve exact operand value in && short-circuit evaluation
   - Impact: 18% of total mismatches

3. **BOOLEAN_TYPE_MISMATCH** (60 cases)
   - Fix: Array subtraction → null, proper string comparison
   - Impact: 16% of total mismatches

### Phase 2: Medium-Impact Fixes (~75 cases, 20%)

4. **COMPARISON_OPERATOR** (45 cases)
   - Fix: <, >, <=, >= semantics with mixed types

5. **SHORT_CIRCUIT_OR_IN_OTHER** (30 cases)
   - Fix: || value propagation

6. **BOOLEAN_NEGATION** (30 cases)
   - Fix: ! operator edge cases

### Phase 3: Low-Impact Fixes (~14 cases, 4%)

7. **Remaining categories** (14 cases)
   - Edge cases and unclassified

---

## Next Steps

### Immediate Actions

1. **Do NOT increase to 100k yet**
   - 10k is sufficiently cheap for rapid iteration
   - Fix the top 3 categories first (~247 cases)

2. **Extract 20-50 representative cases from each top category**
   - Use `storage/lin_10k_classified_374.json` for full list
   - Create minimal test cases for each pattern

3. **Fix runtime semantics in priority order**
   - Start with STRING_ARITHMETIC_COERCION
   - Then SHORT_CIRCUIT_AND_IN_OTHER
   - Then BOOLEAN_TYPE_MISMATCH

4. **Re-run 10k after each fix batch**
   - Track regression
   - Verify mutation score remains 3/3

### Success Criteria for GATE 10K Closure

- [ ] Mismatches reduced to <50 (<0.5%)
- [ ] Mutation score maintained at 3/3
- [ ] No new categories of errors introduced
- [ ] All fixes are semantic, not oracle adjustments

### Timeline Estimate

- **Week 1:** Fix STRING_ARITHMETIC_COERCION (120 cases)
- **Week 2:** Fix SHORT_CIRCUIT_AND_IN_OTHER (67 cases)
- **Week 3:** Fix BOOLEAN_TYPE_MISMATCH (60 cases)
- **Week 4:** Re-run 10k, stabilize, prepare for 100k

---

## Files Generated

- `storage/lin_10k_mismatches.json` - Original mismatch data
- `storage/lin_10k_classified_374.json` - Classified mismatches with examples
- `scripts/classify_374_mismatches.py` - Classification script

---

## Conclusion

**GATE 10K Status:** Strong improvement (68% reduction), but NOT closed

The remaining 374 mismatches are NOT generic runtime issues. They represent specific JavaScript semantic gaps that can be systematically addressed through targeted fixes.

**Key insight:** The top 3 categories account for ~66% of all mismatches. Fixing these will likely bring the mismatch rate below 1%, making 100k viable.

**Recommendation:** Proceed with systematic semantic fixes before scaling to 100k.
