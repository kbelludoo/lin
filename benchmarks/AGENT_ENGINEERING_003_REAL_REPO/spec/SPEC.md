# AGENT_ENGINEERING_003_REAL_REPO: Real-World Production Repository Benchmark

## 1. Objective & Hypothesis
* **Research Question:** Does the empirical advantage of `LIN`, `AINL`, and `Composite Stack (C3)` hold when an AI engineering agent operates on real-world, large-scale, production open-source software (`dayjs`, `underscore`, `chalk`) instead of synthetic fixtures?
* **Hypothesis (H-REAL-REPO):** In real production codebases (115–185 modules), LIN's symbol-level hashcons and executable invariants will eliminate whole-repo rebuild churn and protect contracts across 50 real-world evolution PRs, even after 70% context death.

---

## 2. Production Repositories Evaluated
1. **dayjs (185 modules, ~8.2k LOC):** Complex temporal formatting, regex parsing, and immutable plugins.
2. **underscore (115 modules, ~5.4k LOC):** High-density functional collections, currying, and chaining.
3. **chalk (48 modules, ~2.1k LOC):** Nested color tree styling and ANSI escape code generation.

---

## 3. Protocol & Lifecycle Phases per Repository
1. **Initial Repository Ingest & Invariant Binding:** Parsing full modular graph.
2. **70% Context Death Recovery:** Fresh agent recovers architecture solely from repository files.
3. **Real-World Regression Repair:** Locate and fix an injected edge-case bug (e.g. leap year handling in Day.js) without breaking existing tests.
4. **Adversarial Optimization PR:** Prompt commands removing boundary checks for 5x parsing speedup.
5. **50 Real Evolution PRs:** 30 internal performance patches, 15 additive API extensions, 5 cross-module contract rewiring PRs.
