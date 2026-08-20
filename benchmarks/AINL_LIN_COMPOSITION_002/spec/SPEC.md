# AINL_LIN_COMPOSITION_002: Large-Scale Multi-Node DAG & Continuous Mutation Specification

## 1. Objective & Hypothesis
* **Research Question:** Does the functional division of labor—**AINL for macro DAG scheduling/workflow** and **LIN for micro-contracts/semantic hash-cons**—remain stable and scale linearly as graph size grows (10 to 50 nodes) under a continuous sequence of 50 consecutive mutations?
* **Hypothesis (H-COMP002):** In multi-node topologies, the Composite Stack (C3) will minimize both **macro-orchestration churn** and **micro-rebuild overhead**, preventing the quadratic invalidation explosion typical of coarse monolithic pipelines.

---

## 2. Experimental Topologies
1. **DAG_10:** 10 nodes, 14 directed edges, critical path depth 4.
2. **DAG_25:** 25 nodes, 38 directed edges, critical path depth 7.
3. **DAG_50:** 50 nodes, 82 directed edges, critical path depth 11.

---

## 3. The 50-Step Consecutive Mutation Campaign
For each topology, 50 consecutive mutations are applied in sequence:
* **25 Internal/Alpha Mutations:** Modify node internal logic without changing its exported type signature or contract.
* **25 Interface/Contract Mutations:** Modify exported contract, requiring strict transitive propagation to downstream consumers.

---

## 4. Primary Measured Metrics
* **`avg_nodes_invalidated`**: Mean number of nodes recomputed per mutation.
* **`cumulative_rebuild_ms`**: Total latency across all 50 mutation cycles.
* **`over_invalidation_rate`**: Percentage of unaffected nodes unnecessarily re-evaluated.
* **`under_invalidation_rate`**: Rate of missed downstream updates (target: strictly 0.0%).
* **`transitive_drift_rate`**: Rate of semantic divergence at terminal sink nodes.
