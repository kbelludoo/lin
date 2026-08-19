# HYPOTHESIS_REGISTER.md — Registro Central de Hipóteses

> **Visão:** Registro vivo de hipóteses testadas, com status, escopo e evidência.
> **Regra:** Status são imutáveis uma vez registrados. Novos dados criam novas entradas, não reescrevem existentes.

---

## Status possíveis

| Status | Significado |
|--------|-------------|
| `PENDING` | Hipótese definida, não testada |
| `INCONCLUSIVE` | Dados insuficientes para decidir |
| `PARTIAL` | Alguns critérios atendidos, outros não |
| `SUPPORTED` | Critérios de aceitação atendidos |
| `REJECTED` | Critérios de rejeição atendidos |

---

## H_COG-01 — Representação Aumenta Zero-Shot

```
Enunciado: "LIN + prompt mínimo aumenta pass@1 vs TS baseline"
Critério:  pass@1(C) ≤ pass@1(B) - 5% → rejeitada
Dataset:    T001, T002, T003 (logic_state)
Protocolo:  LIN_MINIMAL_V1 / Qwen2.5-Coder-7B
Status:     REJECTED
```

**Evidência:**
- pass@1(A/TS) = 33.3%, pass@1(B/LIN min) = 33.3%, pass@1(C/LIN few-shot) = 0.0%
- C < B - 5% → critério de rejeição satisfeito
- A domina B no Pareto (mesma qualidade, menos tokens)

**Artefatos:**
- `results/ABCD_TEST_1787105445413/COMPARISON.json`
- `results/milestones/LIN_MINIMAL_V1_RESULTS.md`

---

## H_COG-02 — Trauma Estruturado Melhora Recuperação

```
Enunciado: "LIN + verifier + trauma retry (k=3) aumenta RSR vs sem retry"
Critério:  RSR(E) ≤ RSR(D) → rejeitada
Dataset:    T002, T003 (logic_state, medium)
Protocolo:  MICRO_ABLATION / Qwen2.5-Coder-7B
Status:     REJECTED
```

**Evidência:**
- RSR(E) = 0.00, RSR(D) = 0.00
- T002: E piorou (ORACLE_FAILURE → INVALID_LIN após trauma)
- T003: E sem mudança (ORACLE_FAILURE ×3)
- Custo: E gasta 5.9× mais tokens que A

**Artefatos:**
- `results/MICRO_ABLATION_1787105985584/RESULTS.json`
- `results/milestones/LIN_MINIMAL_V1_RESULTS.md`

---

## H_COMPACT-01 — LIN Produz Saída Mais Compacta

```
Enunciado: "A saída LIN é mais compacta que a saída TS equivalente"
Critério:  completion_tokens(B) < completion_tokens(A) para mesma tarefa
Dataset:    T001, T002, T003
Protocolo:  ABCD_TEST / Qwen2.5-Coder-7B
Status:     INCONCLUSIVE
```

**Evidência:**
- T001: A=57 comp_tok, B=53 comp_tok (LIN levemente mais compacto)
- T002: A=46 comp_tok, B=108 comp_tok (LIN gasta mais)
- T003: A=128 comp_tok, B=150 comp_tok (LIN gasta mais)
- Observação: output compression isolada pode existir, mas end-to-end token efficiency é negativa

**Nota:** A economia de saída LIN é superada pelo custo de prompt. A hipótese de compactação isolada requer teste sem custo de indução (ex: modelo pré-treinado em LIN).

**Artefatos:**
- `results/ABCD_TEST_1787105445413/COMPARISON.json`

---

## H_VERIFY-01 — LIN Enforça Restrições de Efeito

```
Enunciado: "O verifier LIN bloqueia código que viola forbidden_effects"
Critério:  Verificador rejeita código com efeitos proibidos
Dataset:    T002 (forbidden: buffer.push, buffer.shift, globalState)
Protocolo:  MICRO_ABLATION / Qwen2.5-Coder-7B
Status:     SUPPORTED
```

**Evidência:**
- T002/A (TS): Código usa `buffer.push` e `buffer.shift` → INVALID_LIN (verifier bloqueia corretamente)
- T002/B (LIN min): Código evita efeitos proibidos → passa verifier, mas falha oracle (lógica incorreta)
- Canonical TS solution também é bloqueada pelo verifier quando usa efeitos proibidos

**Interpretação:** O verifier funciona como camada de restrição. O problema é que o modelo não consegue implementar a lógica correta mesmo quando a representação é válida.

**Artefatos:**
- `results/MICRO_ABLATION_1787105985584/RESULTS.json`
- `harness/oracle_audit.mjs`

---

## H_COG-03 — Modelos Pequenos Superam Grandes com LIN

```
Enunciado: "Camada Cognitiva LIN permite que modelos 3B superem modelos 7B+"
Critério:  pass@k(F) ≥ pass@1(B) ∧ tokens(F) ≤ tokens(B)
Dataset:    Não testado
Protocolo:  Não executado
Status:     PENDING
```

**Nota:** Requer modelo 3B (ex: Qwen2.5-3B) e execução do sistema F.

---

## Resumo

| ID | Hipótese | Status | Primeiro Teste |
|----|----------|--------|----------------|
| H_COG-01 | Representação aumenta zero-shot | **REJECTED** | 2026-08-18 |
| H_COG-02 | Trauma melhora recuperação | **REJECTED** | 2026-08-18 |
| H_COMPACT-01 | LIN produz saída compacta | INCONCLUSIVE | 2026-08-18 |
| H_VERIFY-01 | LIN enforça restrições | **SUPPORTED** | 2026-08-18 |
| H_COG-03 | Modelos pequenos superam grandes | PENDING | — |

---

## H_IR-01 — LIN como IR Valida e Compila Multi-Target

```
Enunciado: "Uma representação LIN semanticamente equivalente permite
            validação e compilação multi-target com menor tamanho de
            artefato intermediário do que representações tradicionais,
            sem perda de comportamento."
Critério:  IR_size(LIN) < IR_size(TS) ∧ semantic_equivalence(LIN, TS) = TRUE
            ∧ compile_success(target) ≥ compile_success(TS) para cada target
Dataset:    T001-T010 (logic_state + code_transformation)
Protocolo:  IR_BENCHMARK_V1 Phase 1+2
Status:     PARTIAL (Phase 1+2 concluídos)
```

**Evidência (Phase 1 — sem LLM, canonical TS→LIN):**
- 7/10 tasks: semantic equivalence = TRUE
- 3/10 tasks: LIN fails due to transpiler limitations (T005 partial, T006, T009)
- Avg IR ratio (bytes): 0.703 (29.7% compression)
- Global compression: 29.1% (3675 TS bytes → 2606 LIN bytes)

**Evidência (Phase 2 — LLM→LIN vs LLM→TS, Qwen 2.5 Coder 7B):**

| Condition | Semantic Eq | Avg Prompt | Avg Comp | Avg Total |
|-----------|-------------|------------|----------|-----------|
| Phase 1 Canonical | 70% | 0 | 29 | 29 |
| A: LLM→TS | 80% | 127 | 93 | 219 |
| B: LLM→LIN (zero-shot) | 50% | 195 | 103 | 298 |
| C: LLM→LIN (few-shot) | 0% | 226 | 70 | 296 |

**Resultado crítico:**
- LLM→LIN é **pior que LLM→TS em todas as dimensões**:
  - Equivalência semântica: 50% vs 80%
  - Prompt tokens: 195 vs 127 (+54%)
  - Completion tokens: 103 vs 93 (+11%)
  - Total tokens: 298 vs 219 (+36%)
- A compressão estrutural de ~29% **não se transfere** para LLM→LIN
- Few-shot piora: 0% de equivalência

**Interpretação:**
A vantagem estrutural do LIN (fase 1) é real mas não é capturável pelo modelo.
O custo de indução (prompt) + o overhead de geração destrói qualquer ganho.
O modelo não consegue produzir LIN compacto — ele produz LIN 11% maior que TS.

**Nota:** ~29% é a compressão observada por este canonicalizer e este subconjunto. O teto teórico do LIN não foi provado — serialização binária, deduplicação, HashCons, aliases ou uma IR mais expressiva poderiam produzir resultados diferentes.

**Métricas por task (8 pass):**

| Task | IR ratio | Compression | Status |
|------|----------|-------------|--------|
| T001 | 0.675 | 32.5% | ✅ |
| T002 | 0.672 | 32.8% | ✅ |
| T003 | 0.711 | 28.9% | ✅ |
| T004 | 0.753 | 24.7% | ✅ |
| T005 | 0.724 | 27.6% | ✅ |
| T006 | 0.735 | 26.5% | ✅ |
| T008 | 0.700 | 30.0% | ✅ |
| T010 | 0.651 | 34.9% | ✅ |

**Nota:** Phase 1 mede o limite estrutural determinístico (sem LLM). ~29% de compressão é a observação experimental. Canonicalizer ceiling = NOT YET PROVEN.

**Artefatos:**
- `benchmarks/ir_ablation/results/IR_FASE1_*/REPORT.json`
- `benchmarks/ir_ablation/ts_to_lin.mjs` (canonicalizer)
- `benchmarks/ir_ablation/fase1_benchmark.mjs` (benchmark runner)

**Métricas:**
- `IR_ratio = size(LIN) / size(TS)` (menor = melhor)
- `semantic_eq = oracle(LIN) == oracle(TS)` (deve ser TRUE)
- `compile_rate(target)` por target
- `target_size_ratio = size(target_output) / size(TS_output)`

**Artefatos esperados:**
- `benchmarks/ir_ablation/` (novo benchmark)
- `compilers/lin_to_*.mjs` (compiladores multi-target)

---

## H_COMPACT-01_v2 — Compactação LIN Isolada (sem custo de indução)

```
Enunciado: "Quando o custo de prompt é eliminado (ex: modelo pré-treinado
            ou fine-tuned em LIN), a saída LIN é significativamente
            mais compacta que TS para o mesmo comportamento."
Critério:  completion_tokens(LIN) < 0.5 × completion_tokens(TS)
            ∧ semantic_equivalence = TRUE
Dataset:    T001-T010
Protocolo:  IR_BENCHMARK_V1 (comadapter zero-prompt)
Status:     PENDING
```

**Mudança vs H_COMPACT-01 original:**
- Original testou end-to-end (prompt + output) → INCONCLUSIVE
- v2 testa isoladamente (apenas output) → requer adapter sem prompt de instrução
- Se v2 for suportado, a compactação existe mas é destruída pelo custo de indução

**Nota:** H_COMPACT-01 original permanece como INCONCLUSIVE (imutável).
v2 é uma nova entrada que isola a variável correta.

---

## Resumo Atualizado

| ID | Hipótese | Status | Primeiro Teste |
|----|----------|--------|----------------|
| H_COG-01 | Representação aumenta zero-shot | **REJECTED** | 2026-08-18 |
| H_COG-02 | Trauma melhora recuperação | **REJECTED** | 2026-08-18 |
| H_COMPACT-01 | LIN produz saída compacta (end-to-end) | INCONCLUSIVE | 2026-08-18 |
| H_VERIFY-01 | LIN enforça restrições | **SUPPORTED** | 2026-08-18 |
| H_COG-03 | Modelos pequenos superam grandes | PENDING | — |
| H_IR-01 | **LIN como IR valida e compila multi-target** | **PARTIAL** | 2026-08-18 |
| **H_COMPACT-01_v2** | **Compactação isolada (sem custo de prompt)** | **PENDING** | — |
