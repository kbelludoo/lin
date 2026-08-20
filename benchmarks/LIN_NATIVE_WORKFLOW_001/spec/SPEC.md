# LIN_NATIVE_WORKFLOW_001: Unified Semantic IR with Native Workflow Primitives (C4)

## 1. Research Question & Architectural Hypothesis
* **Core Question:** Can `LIN` absorb workflow, pipeline, and task DAG primitives directly into its native grammar and IR (`@pipeline`, `@stage`, `@node`), eliminating the need for an external orchestrator (`AINL`) while preserving:
  1. Strict 0% over-invalidation;
  2. Perfect selective locality (Tiers 1–4);
  3. Continuous context continuity under 70% pruning;
  4. Multi-target compilation and compiler gate defense?
* **Hypothesis (H-NATIVE-WORKFLOW):**
  A single-pass unified compiler (`C4: LIN Native Workflow`) will eliminate the serialization and cross-language translation boundary between LIN and AINL, achieving:
  - Fewer total tokens than C3 (by sharing symbol tables and type schemas directly in the AST);
  - Lower end-to-end execution and rebuild latency (single-pass dependency graph compilation);
  - Equivalent 1.000 selectivity score and 0% invariant violation rate.

---

## 2. The 5 Evaluated Architectural Conditions
* **C0 (JS/TS Baseline):** Traditional unstructured multi-module codebase.
* **C1 (LIN Standalone):** Pure symbol-level micro IR without native workflow primitives.
* **C2 (AINL Standalone):** Pure macro workflow DAG orchestrator without micro-contracts.
* **C3 (Composite External):** Two-language stack (LIN micro + AINL macro).
* **C4 (LIN Native Workflow):** Unified single-language stack with native workflow primitives compiled in one pass.

---

## 3. Protocol Matrix
$$5 \text{ Conditions} \times 4 \text{ Benchmark Dimensions} \times 20 \text{ Repetitions} = 100 \text{ Comprehensive Evaluations}$$
