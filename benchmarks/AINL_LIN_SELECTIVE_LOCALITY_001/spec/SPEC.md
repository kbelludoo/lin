# AINL_LIN_SELECTIVE_LOCALITY_001: Selective Locality & Layer Boundary Specification

## 1. Thesis & Falsifiable Objective
* **Core Question:** When changes occur across different architectural dimensions—ranging from purely internal implementation details to structural DAG topology mutations—does the composite system (`AINL + LIN`) correctly classify and isolate the change to its minimal necessary layer?
* **Core Metric (Selective Locality Score):**
  $$\text{Selectivity} = \frac{\text{Correctly Classified & Minimal Layer Transitions}}{\text{Total Mutations Tested}}$$
* **Failure Modes:**
  * **Over-propagation (Unnecessary Churn):** Modifying macro DAG topology or invalidating downstream nodes for purely internal or additive effect changes.
  * **Under-propagation (Missed Boundary Crossing):** Failing to invalidate downstream nodes or update DAG edges when a breaking contract or structural dependency change occurs.

---

## 2. The Four Mutation Tiers
1. **Tier 1 (T1_LOCAL_IMPL - Pure Internal Implementation):**
   * *Target Layer:* `LIN_INTERNAL_ONLY`
   * *Expected Action:* Rebuild only the modified function. 0 DAG edges modified, 0 downstream nodes invalidated.
2. **Tier 2 (T2_EFFECT_SANDBOX - Effect Sandbox Modification):**
   * *Target Layer:* `LIN_EFFECTS_GATE`
   * *Expected Action:* Validate effect boundary (e.g. `pure` vs `log_audit`). 0 DAG edges modified, 0 downstream nodes invalidated.
3. **Tier 3 (T3_TYPE_CONTRACT - Type Contract Modification):**
   * *Target Layer:* `LIN_CONTRACT_TRANSITIVE`
   * *Expected Action:* Transitive re-typecheck of direct downstream consumers. 0 DAG edges modified, downstream nodes invalidated.
4. **Tier 4 (T4_STRUCTURAL_DAG - Structural DAG Topology Mutation):**
   * *Target Layer:* `AINL_DAG_TOPOLOGY`
   * *Expected Action:* Modify workflow graph topology (insert/delete node, alter dependency edges). Both DAG edges and downstream nodes updated.

---

## 3. Protocol & Execution Matrix
$$4 \text{ Tiers} \times 2 \text{ Conditions (C1 Selective vs C2 Coarse)} \times 30 \text{ Repetitions} = 240 \text{ Trials}$$
