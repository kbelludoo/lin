# LIN_NATIVE_WORKFLOW_003_REAL_LARGE: Public Language Surface Scale Stress Benchmark

## 1. Objective & Invariable Scope
* **Scale Scope:** Enterprise repository with **1,240 modules**, **112,400 LOC**, **5,800 semantic nodes**, **12,400 workflow edges**, across **18 interconnected services**.
* **Surface Language:** Frozen syntax **`@LIN:L2w:1.0`** without benchmark-specific extensions (`~pipeline`, `!node`, `=port`, `>step`, `*parallel`, `?branch`, `@retry`, `^emit`).
* **Research Question:** Does the public surface syntax `@LIN:L2w:1.0` achieve $100\%$ Surface-to-IR and Surface-to-Backend fidelity while maintaining zero regressions across **1,000 consecutive mutations** on a 112k LOC real codebase?

---

## 2. Four Evaluation Campaigns (R0 to R3)
1. **R0 (Surface Ingest):** Full repository parsed strictly into `@LIN:L2w:1.0` AST and lowered to multi-target backends.
2. **R1 (10 Surface Mutations):** 6 internal, 3 contract extensions, 1 service reroute.
3. **R2 (100 Surface Mutations):** 60 internal, 30 contract extensions, 10 structural DAG rewires.
4. **R3 (1,000 Surface Mutations):** 600 internal, 300 additive contract extensions, 100 deep multi-service structural rewires.

---

## 3. Strict Frozen Criteria
$$\text{Surface-to-IR Fidelity} = 100.0\% \quad \wedge \quad \text{Surface-to-Backend Parity} = 100.0\% \quad \wedge \quad \text{Regressions} = 0$$
