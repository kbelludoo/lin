# IR_BENCHMARK_V1 — LIN como Intermediate Representation

> **Objetivo:** Medir se LIN funciona como IR válida com vantagem de tamanho,
> equivalência semântica e compilação multi-target.
> **Status:** DESIGN (não executado)
> **Hipótese principal:** H_IR-01

---

## Arquitetura do Benchmark

```
         TS Source (baseline)
              │
    ┌─────────┼─────────┐
    ↓         ↓         ↓
  manual    LLM       LLM
  rewrite   zero-shot  few-shot
    │         │         │
    ↓         ↓         ↓
  LIN IR    LIN IR    LIN IR
    │         │         │
    └─────────┼─────────┘
              ↓
         Verifier
              │
    ┌─────────┼─────────┐
    ↓         ↓         ↓
  types   effects   contracts
    └─────────┼─────────┘
              ↓
         Oracle (independente)
              │
    ┌─────────┼─────────┐
    ↓         ↓         ↓
  TS        Python    Rust
  (target)  (target)  (target)
```

## Fases

### Fase 1: Canonical LIN (sem LLM)

**Pergunta:** LIN funciona como IR quando gerado deterministicamente?

```
TS source (canonical)
    ↓
rewriter deterministic
    ↓
LIN IR
    ↓
verifier (types + effects)
    ↓
oracle (semântica)
    ↓
compiler → TS / Python / Rust
```

**Métricas:**
- `IR_ratio = bytes(LIN) / bytes(TS)` — deve ser < 1.0
- `semantic_eq = oracle(LIN) == oracle(TS)` — deve ser TRUE
- `compile_rate(target)` por target
- `target_size_ratio = bytes(target) / bytes(TS_baseline)`

**Critério de aceitação:**
- IR_ratio < 0.8 (LIN 20% menor que TS)
- semantic_eq = TRUE para 100% das tarefas
- compile_rate ≥ 90% para TS target

### Fase 2: LLM → LIN (zero-shot)

**Pergunta:** Um LLM gera LIN válido sem prompt de instrução?

```
TS source
    ↓
LLM (prompt: "gere LIN equivalente")
    ↓
LIN IR (candidate)
    ↓
verifier
    ↓
oracle
```

**Métricas:**
- `valid_lin_rate` — % que passa verifier
- `semantic_eq_rate` — % que passa oracle
- `IR_ratio` — tamanho do LIN gerado vs TS

### Fase 3: Multi-Target Compilation

**Pergunta:** LIN compila para múltiplos targets sem perda?

```
LIN IR (canonical)
    ↓
compiler_ts / compiler_py / compiler_rs
    ↓
target code
    ↓
target-specific oracle (execução real)
```

**Targets:**
| Target | Oracle | Métrica |
|--------|--------|---------|
| TypeScript | Node.js exec | pass@1 |
| Python | python3 exec | pass@1 |
| Rust | cargo test | compile + pass@1 |

**Critério:** compile_rate(target) ≥ 80% para cada target

### Fase 4: Portability (opcional)

**Pergunta:** A mesma LIN IR compila para todos os targets?

```
LIN IR (uma vez)
    ↓
compiler_ts → TS → oracle_ts
compiler_py → Py → oracle_py
compiler_rs → Rs → oracle_rs
```

**Métrica:** `portability_rate` — % de LINs que compila para todos os targets

---

## Dataset

Reutiliza `MANIFEST.json` existente (T001-T030), mas com adições:

| Campo | Descrição |
|-------|-----------|
| `canonical_lin` | LIN gerado deterministicamente (não por LLM) |
| `ts_baseline` | TS canônico para comparação |
| `targets` | Lista de targets suportados |

**Tarefas iniciais:** T001-T010 (logic_state + operation_tracing)

---

## Dependências Técnicas

### Compiladores (necessários)

| Compiler | Status | Descrição |
|----------|--------|-----------|
| `lin_to_ts.mjs` | ✅ Existe (parcial) | LIN → TypeScript |
| `lin_to_py.mjs` | ❌ Não existe | LIN → Python |
| `lin_to_rs.mjs` | ❌ Não existe | LIN → Rust |

### Verificador (existe)

| Componente | Status | Descrição |
|------------|--------|-----------|
| `lin_verifier_adapter.mjs` | ✅ | Syntax + effects check |
| `types_checker` | ❌ Não existe | Type inference/checking |
| `contracts_checker` | ❌ Não existe | Pre/post conditions |

### Oracles (existem)

Todos os oráculos T001-T030 já transpilam LIN internamente.
Precisamos de oracles adicionais para targets Python/Rust.

---

## Orçamento Estimado

| Fase | Tarefas | Targets | Execuções | Tempo estimado |
|------|---------|---------|-----------|----------------|
| 1 (Canonical) | 10 | 1 | 10 | ~5 min |
| 2 (LLM) | 10 | 1 | 10 | ~30 min |
| 3 (Multi-target) | 10 | 3 | 30 | ~15 min |
| 4 (Portability) | 10 | 3 | 30 | ~15 min |
| **Total** | | | | **~65 min** |

---

## Decisões Pendentes

1. **Canonical LIN:** quem gera? Rewriter determinístico ou LIN compiler reverso?
2. **Targets:** Python e Rust são viáveis para o scope inicial, ou focar só em TS?
3. **Types checker:** implementar ou usar o verifier existente (syntax + effects)?
4. **Dataset:** reutilizar T001-T030 ou criar tarefas específicas para IR?
5. **Oracles multi-target:** implementar ou executar o código target diretamente?

---

## Próximos Passos (quando aprovado)

1. Implementar `lin_to_ts.mjs` completo (se não existir)
2. Criar rewriter determinístico TS → LIN
3. Implementar Fase 1 (canonical) como validação
4. Executar e medir IR_ratio + semantic_eq
5. Decidir se Fase 2-4 vale o investimento
