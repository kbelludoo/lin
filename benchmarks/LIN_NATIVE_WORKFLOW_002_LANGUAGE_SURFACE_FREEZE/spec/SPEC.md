# LIN_NATIVE_WORKFLOW_002_LANGUAGE_SURFACE_FREEZE: Language Surface Freeze & Grammar Specification

## 1. Objective
Formally stabilize and freeze the public syntax for **LIN Native Workflow**, establishing a human- and LLM-ergonomic grammar that integrates atomic functional logic with macro-DAG orchestration in a single unified IR.

---

## 2. Canonical Surface Syntax (Frozen Primitives)

```lin
@LIN:L2w:1.0
~pipeline DataPipeline(input: DatasetRecord) -> ResultSummary {
  $effects = [fs_read, pure_math]
  $invariants = [requires len(input.records) > 0, ensures result.score >= 0.0]

  !node IngestNode(data: DatasetRecord) -> NormalizedBatch {
    $effect = fs_read
    =port out: NormalizedBatch
    ^ret normalize(data)
  }

  !node ComputeKernel(batch: NormalizedBatch) -> ModelMetrics {
    $effect = pure_math
    =port in: NormalizedBatch
    =port out: ModelMetrics
    ^ret evaluate_kernel(in)
  }

  >step IngestNode(input) -> batch_data
  ?branch (batch_data.is_valid) {
    *parallel {
      >step ComputeKernel(batch_data) -> metrics_a
      >step ComputeKernel(batch_data) -> metrics_b
    }
    ^emit combine_metrics(metrics_a, metrics_b)
  } :else {
    @retry(attempts=3, backoff=exponential)
    ^emit fallback_default()
  }
}
```

---

## 3. Four Evaluation Dimensions
1. **DIM_01 (AST Roundtrip):** Code $\rightarrow$ AST $\rightarrow$ Code identity check ($100\%$ roundtrip fidelity).
2. **DIM_02 (LLM Ergonomics):** Zero-shot generation success across LLMs without hallucinating non-existent sigils.
3. **DIM_03 (Fail-Closed Gates):** Rejection of un-typed ports, cyclical deadlocks, and undeclared effect leaks.
4. **DIM_04 (Multi-Target Lowering):** Deterministic code generation to **Rust**, **Zig**, **C**, and **TypeScript**.
