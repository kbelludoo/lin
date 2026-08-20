# AINL_TO_LIN_PARITY_MIGRATION_002_REAL_LARGE: Large-Scale Production Parity Benchmark

## 1. Objective & Strict Scale Profile
* **Scale Profile:**
  - **Modules:** 1,240 modules
  - **Lines of Code (LOC):** 112,400 LOC
  - **Semantic / Workflow Nodes:** 5,800 nodes
  - **DAG Workflow Edges:** 12,400 edges
  - **Services:** 18 interconnected microservices
* **Core Question:** Can `LIN Native Workflow (C4)` maintain 100% observable behavioral parity, sub-second incremental rebuilds, and 0% over-invalidation when scaling up to **1,000 consecutive real-world mutations** on a 112k LOC enterprise multi-service repository?

---

## 2. The Four Evaluation Campaigns (R0 to R3)
1. **R0 (Ingest):** Full repository parsing, type inference, effect graph resolution, and initial projection.
2. **R1 (10 Mutations):** 6 internal, 3 contract extensions, 1 service routing change.
3. **R2 (100 Mutations):** 60 internal, 30 contract extensions, 10 structural/service changes.
4. **R3 (1,000 Mutations):** 600 internal, 300 additive contract extensions, 100 deep structural DAG rewires / service topology mutations.

---

## 3. Strict Parity & Invariance Criteria
* Behavioral parity under holdout execution: strictly **100.0%**.
* Over-invalidation rate: strictly **0.0%**.
* Under-invalidation rate: strictly **0.0%** (zero missed downstream updates).
