/**
 * FIRE_TEST_003_NODE_SEMVER / analyze.mjs
 * Unbiased aggregation comparing Original JS (node-semver v7.8.5) vs LIN Multi-Target Lowerings (TS, Rust, Zig, C).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeSemverRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const targets = [
    "ORIGINAL_NODE_SEMVER_JS",
    "LIN_TS_EMIT",
    "LIN_RUST_EMIT",
    "LIN_ZIG_EMIT",
    "LIN_C_EMIT"
  ];

  const summary = {};

  for (const t of targets) {
    const recs = raw.records.filter(r => r.target_id === t);
    const n = recs.length;

    const officialPass = recs[0].official_suite_pass_rate;
    const fuzzerCrashes = recs.reduce((a, r) => a + r.fuzzer_crashes, 0);
    const fuzzerDivergences = recs.reduce((a, r) => a + r.fuzzer_divergences, 0);
    const throughput = recs[0].throughput_ops_sec;
    const latencyNs = recs[0].mean_parse_latency_ns;
    const ramKb = recs[0].peak_memory_kb;
    const tokens = recs[0].surface_tokens;
    const rebuildMs = recs[0].incremental_rebuild_ms;
    const overInval = recs[0].over_invalidation_rate;
    const gateAction = recs[0].adversarial_gate_action;
    const ratio = recs[0].semantic_to_operational_ratio;

    summary[t] = {
      label: recs[0].target_label,
      official_suite_pass: officialPass,
      fuzzing_100k_status: `${fuzzerCrashes} crashes / ${fuzzerDivergences} div`,
      throughput_ops_sec: Number(throughput).toLocaleString(),
      parse_latency_ns: `${latencyNs} ns`,
      peak_memory: `${(ramKb / 1024).toFixed(1)} MB`,
      surface_tokens: tokens,
      rebuild_latency_ms: rebuildMs,
      over_invalidation: overInval,
      adversarial_gate: gateAction,
      ratio: ratio
    };
  }

  const outPath = path.join(runDir, 'final_semver_fire_test_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("SemVer Fire Test Report saved to:", outPath);

  console.log("\n=== FIRE TEST 003: NODE-SEMVER (ORIGINAL JS VS LIN REWRITE) ===");
  console.table(summary);

  return summary;
}

analyzeSemverRun();
