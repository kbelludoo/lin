# LIN_MINIMAL_V1 — Experimental Results

**Date:** 2026-08-18
**Model:** qwen2.5-coder:7b (Ollama)
**Tasks:** T001, T002, T003 (logic_state family)
**Protocol:** PHASE0_SMOKE / v1.0.0

---

## Summary

```
LIN_MINIMAL_V1:
  semantic_gain       = NOT_OBSERVED
  token_efficiency    = NEGATIVE (A dominates B)
  syntactic_guidance  = OBSERVED (B: 100% compile vs A: 66.7%)
  recovery_capability = NOT_OBSERVED (RSR = 0.00)
```

## Experiment 1: A/B/C/D × T001-T003 (1 attempt)

| Cond | Oracle% | Avg Tokens | Pareto | Status |
|------|---------|------------|--------|--------|
| A (TS baseline) | 33.3% | 210 | Dominant | ✅ Reference |
| B (LIN minimal) | 33.3% | 308 | Dominated | ⚠️ No semantic gain |
| C (LIN few-shot) | 0.0% | 666 | Dominated | ❌ Rejected |
| D (LIN constrained) | 33.3% | 753 | Dominated | ❌ Rejected by cost |

**Pareto:** A dominates B (same oracle rate, fewer tokens).

**Token decomposition:**
- A: prompt=133, completion=77
- B: prompt=204, completion=104
- Cost of teaching LIN: +71 prompt tokens (+53%)
- No quality improvement

## Experiment 2: Oracle Audit (Canonical Solutions)

| Task | TS→Oracle | TS→Verifier→Oracle | LIN→Verifier→Oracle | LIN→Oracle |
|------|-----------|-------------------|--------------------|-----------| 
| T001 | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| T003 | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |

**Conclusion:** Both oracles are correct. T003 is genuinely difficult for the model, not a benchmark bug.

## Experiment 3: Micro-Ablation T002/T003 × A/B/D/E

### Failure Class Transitions

| Task | A (1att) | B (1att) | D (1att) | E (3att, trauma) |
|------|----------|----------|----------|-----------------|
| T002 | INVALID_LIN | ORACLE_FAILURE | ORACLE_FAILURE | ORACLE_FAILURE → INVALID_LIN → INVALID_LIN |
| T003 | ORACLE_FAILURE | ORACLE_FAILURE | ORACLE_FAILURE | ORACLE_FAILURE → ORACLE_FAILURE → ORACLE_FAILURE |

### Key Finding: No Recovery

```
T002: B=ORACLE_FAILURE  E=INVALID_LIN  → ❌ NO RECOVERY
      (Trauma made it worse: model switched from "passes verifier, fails oracle"
       to "fails verifier")

T003: B=ORACLE_FAILURE  E=ORACLE_FAILURE  → ❌ NO RECOVERY
      (Trauma feedback had no effect across 3 attempts)
```

**RSR (Recovery Success Rate) = 0.00** for both tasks.

### Aggregate Metrics

| Cond | Oracle% | Init% | Recov% | RSR | Avg Tokens |
|------|---------|-------|--------|-----|------------|
| A | 0.0% | 0.0% | 0.0% | 0.00 | 220 |
| B | 0.0% | 0.0% | 0.0% | 0.00 | 333 |
| D | 0.0% | 0.0% | 0.0% | 0.00 | 333 |
| E | 0.0% | 0.0% | 0.0% | 0.00 | 1297 |

**E costs 5.9× more tokens than A with zero improvement.**

## Interpretation

The verifier + trauma mechanism does **not** increase the model's semantic resolution capacity. It only filters candidates. The model cannot recover from logical failures through structured feedback.

This confirms the user's hypothesis:
> "o problema não está na quantidade de LIN gerado; está no custo e na qualidade da indução da gramática no contexto."

And the stronger conclusion:
> "o verifier não está aumentando a capacidade de resolução do modelo, apenas filtrando candidatos."

## What LIN Does Well (Not Tested Here)

- Compact representation (tokens per line of logic)
- Deterministic compilation
- Verifier-enforced constraints (T002: B avoids forbidden effects that A uses)
- Structural control

## What LIN Does NOT Do (Tested Here)

- Improve semantic reasoning (no quality gain)
- Enable recovery from logical failures (RSR = 0)
- Reduce total token cost (negative efficiency)

## Recommendation

**Stop investigating "LIN improves reasoning" on qwen2.5-coder:7b.**

The evidence is clear:
1. LIN minimal grammar → same quality, higher cost
2. LIN few-shot → worse quality, much higher cost
3. LIN + trauma retry → no recovery, 5.9× cost

If the project continues, focus on:
- LIN as a **compilation target** (deterministic transformation)
- LIN as a **verification interface** (enforcing constraints)
- LIN as a **compact representation** (measured in isolation, not end-to-end)

The cognitive loop hypothesis (LIN + verifier + trauma → recovery) is **not supported** by this data on this model.
