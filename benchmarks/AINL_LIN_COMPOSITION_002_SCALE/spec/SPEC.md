# AINL_LIN_COMPOSITION_002_SCALE: 30-Node Workflow with 100 Consecutive Mutations

## 1. Research Question & Key Metric
* **Core Question:** When a 30-node DAG undergoes 100 consecutive real-world mutations, does the `AINL + LIN` composite maintain changes strictly localized, or does it trigger topology churn and cascading cache recomputation?
* **Core Metric:**
  $$\text{Maintenance Ratio} = \frac{\text{Semantic Change (Symbols modified)}}{\text{Operational Change (Nodes + Edges + Tasks invalidated)}}$$

---

## 2. Experimental Setup
* **Workflow:** 30 Nodes, 46 Directed Edges, Depth 8.
* **100 Consecutive Mutations:**
  * **60 Internal/Implementation Changes:** Alpha-renaming, local optimizations, constant folding, helper refactors (Interface invariant).
  * **30 Local Contract Extensions:** Adding optional arguments or extending local return records without breaking downstream types.
  * **10 Breaking Transitive Contract Changes:** Type signature changes requiring verified propagation to direct downstream consumers.

---

## 3. Evaluated Conditions
* **C1 (AINL + LIN):** LIN provides symbol-level hash-cons; AINL maintains topology.
* **C2 (AINL Standalone):** AINL task-level execution with standard coarse node containers.
