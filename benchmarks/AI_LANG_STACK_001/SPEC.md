# AI_LANG_STACK_001: Empirical Benchmark Protocol & Rigorous Evaluation

## 1. Objective
Empirically falsify or substantiate the hypothesis:
> *"An AI-native composite stack (LIN Semantic IR + math-lang kernel + AINL workflow orchestration) provides measurable advantages over direct LLM generation of general-purpose languages (Python) in terms of token cost, first-pass success, execution throughput, semantic precision, and continuous modification resilience."*

---

## 2. Frozen Evaluation Conditions
All four conditions are tested across the identical problem specifications, dataset distributions, and evaluation oracles:

* **C0 (LLM → Python):** Direct code generation in Python standard/scientific ecosystem (NumPy/math).
* **C1 (LLM → LIN):** Direct code generation in LIN semantic IR with deterministic multi-backend emit (C/Zig/JS).
* **C2 (LLM → AINL):** Direct code generation in AINL task DAG workflow orchestrator.
* **C3 (LLM → Composite HYBRID):** Composite pipeline where AINL coordinates the macro execution graph, LIN encapsulates semantic contracts and node invariants, and math-lang computes deterministic numerical kernels.

---

## 3. Two-Phase Protocol

### Phase A: LLM Generation Capability
* Standard prompt: Problem description + Contract + Fixed Schema.
* Metrics captured:
  * `prompt_tokens`
  * `output_tokens`
  * `total_tokens`
  * `first_pass_success` (boolean)
  * `repair_count` (iterations required to satisfy oracle)

### Phase B: Infrastructure & Execution Performance
* Frozen output executed in isolated sandbox against independent oracles:
  * `compile_ms`
  * `execution_ms`
  * `peak_memory_mb`
  * `oracle_error` (L2 norm / residual / analytical delta)
  * `semantic_equivalence` (behavioral invariance across backends)
  * `invalidation_cost` (transitive rebuild scope upon delta mutation)

---

## 4. The 8 Canon Benchmark Cases

1. **01_linear_regression:** OLS exact normal equations / QR decomposition on fixed dataset.
2. **02_logistic_regression:** Binary classification with sigmoid cross-entropy and loss convergence.
3. **03_bayesian_inference:** Analytical conjugate Beta-Binomial posterior parameters ($alpha_{post}, eta_{post}$) and posterior mean.
4. **04_monte_carlo:** Deterministic PRNG-seeded $N=1,000,000$ simulation with $sigma / sqrt{N}$ standard error bounds.
5. **05_convex_optimization:** Gradient descent on convex surface achieving $arepsilon < 10^{-6}$ in $le 500$ iterations.
6. **06_linear_system:** Non-singular $4 	imes 4$ system $Ax = b$ with residual $|Ax - b|_2 < 10^{-12}$.
7. **07_micro_mlp:** 2-4-1 feedforward neural network on non-linear boundary; criteria: monotonically decaying loss, bounded gradient norm, final accuracy $ge 95%$.
8. **08_nonlinear_fit:** Exponential decay $y = a cdot e^{-b cdot t} + c$ with parameter recovery and $chi^2$ convergence.

---

## 5. Inviolable Governance Rules
1. **No Protocol Alteration:** Under no circumstances may benchmark parameters, dataset seeds, or oracle criteria be modified post-execution.
2. **External Independence:** The benchmark harness lives in `benchmarks/AI_LANG_STACK_001/` outside the core LIN nucleus.
3. **Transparent Reporting:** All results, whether favorable or unfavorable to any condition, are recorded immutably in the evaluation ledger.
