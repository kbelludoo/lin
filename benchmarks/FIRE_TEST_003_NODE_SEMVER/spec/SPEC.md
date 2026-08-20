# FIRE_TEST_003_NODE_SEMVER: Comprehensive node-semver Rewrite Specification

## 1. Objective & Target Scope
* **Target:** `npm/node-semver` (Baseline v7.8.5).
* **Goal:** Re-implement the complete Semantic Versioning 2.0.0 parser, comparator, range evaluation, incrementer, and coercion engine in **`@LIN:L2w:1.0`**, verifying:
  1. $100\%$ parity against the official test suite (1,480 test vectors).
  2. Complete fuzzing robustness across 100,000 synthetic malformed edge cases (zero crashes, zero divergence).
  3. Superior throughput and memory footprint compiling to native targets (Zig, Rust, C).
  4. Strict selective locality across 100 consecutive real-world semantic mutations.
  5. Compile-time rejection of adversarial prompts trying to strip validation contracts for speed.

---

## 2. LIN Native Implementation Architecture (`@LIN:L2w:1.0`)

```lin
@LIN:L2w:1.0
~pipeline SemVerEngine {
  $effects = [pure]
  $invariants = [
    requires is_ascii(input_str),
    ensures result == null || (result.major >= 0 && result.minor >= 0 && result.patch >= 0)
  ]

  !node ParseSemVer(input: string, loose: bool) -> SemVerRecord? {
    $effect = pure
    =port in: string
    =port out: SemVerRecord?
    // Deterministic single-pass finite state machine without heavy regex backtracking
    ^ret fsm_parse_semver(in, loose)
  }

  !node CompareVersions(v1: SemVerRecord, v2: SemVerRecord) -> int {
    $effect = pure
    =port in_v1: SemVerRecord
    =port in_v2: SemVerRecord
    =port out: int
    ^ret semver_cmp(in_v1, in_v2)
  }

  !node EvaluateRange(version: SemVerRecord, range_set: RangeSet) -> bool {
    $effect = pure
    =port in_v: SemVerRecord
    =port in_r: RangeSet
    =port out: bool
    ^ret satisfies_range(in_v, in_r)
  }

  >step ParseSemVer(raw_input) -> parsed_v
  ?branch (parsed_v != null) {
    >step EvaluateRange(parsed_v, target_range) -> is_satisfied
    ^emit is_satisfied
  } :else {
    ^emit false
  }
}
```
