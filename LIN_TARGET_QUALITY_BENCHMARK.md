# LIN Target Quality Benchmark

**Host:** win32 **Date:** 2026-08-15 **Suite:** `tests/target_quality.lin`
**Rule:** all 7 real nucleus langs must FULL (compile AND run) before rank. Stubs excluded.

Warmup=2, repeats=9, metric=median wall ms of running the already-compiled artifact.

| lang | compile | run | ms | bytes | rank |
|------|---------|-----|----|-------|------|
| c | PASS | PASS | 32.46 | 1798 | 1 |
| rust | PASS | PASS | 35.20 | 2270 | 2 |
| go | PASS | PASS | 35.46 | 3267 | 3 |
| py | PASS | PASS | 105.27 | 1736 | 4 |
| ts | PASS | PASS | 113.98 | 487 | 5 |
| js | PASS | PASS | 115.27 | 447 | 6 |
| java | PASS | PASS | 197.86 | 2579 | 7 |

**Winner (this host):** `c` — 32.46ms, 1798 emitted bytes.
CLI default stays `ts` (clone / behavior_eq). `futurePickBestLang` is MEASURED only when given FULL rows; without a bench it stays NOT_RUN.
