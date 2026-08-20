/**
 * FIRE_TEST_004_JQ / analyze.mjs
 * Unbiased product-level aggregation: Original C jq v1.7.1 vs LIN-jq (Rust, Zig, C).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeJqRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const targets = ["ORIGINAL_C_JQ", "LIN_JQ_RUST", "LIN_JQ_ZIG", "LIN_JQ_C"];
  const summary = {};

  for (const t of targets) {
    const recs = raw.records.filter(r => r.target_id === t);
    const n = recs.length;

    const avgColdStart = recs.reduce((a, r) => a + r.cold_start_latency_ms, 0) / n;
    const avgStreamThroughput = recs.reduce((a, r) => a + r.streaming_throughput_mb_sec, 0) / n;
    const avgRss = recs.reduce((a, r) => a + r.peak_memory_rss_mb, 0) / n;
    const avgRebuild = recs.reduce((a, r) => a + r.incremental_rebuild_latency_ms, 0) / n;
    const binSize = recs[0].binary_size_kb;
    const tokens = recs[0].agent_maintenance_tokens;
    const overInval = recs[0].over_invalidation_rate;
    const passRate = recs[0].official_test_suite_pass_rate;

    summary[t] = {
      label: recs[0].target_label,
      official_test_suite: `${recs[0].official_tests_count} tests (${passRate})`,
      cold_start_latency: `${avgColdStart.toFixed(2)} ms`,
      streaming_throughput: `${avgStreamThroughput.toFixed(1)} MB/s`,
      peak_memory_rss: `${avgRss.toFixed(1)} MB`,
      binary_size: `${binSize} KB`,
      maintenance_tokens: tokens,
      rebuild_latency_ms: Number(avgRebuild.toFixed(1)),
      over_invalidation: overInval,
      semantic_ratio: recs[0].semantic_to_operational_ratio
    };
  }

  const outPath = path.join(runDir, 'final_jq_product_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("JQ Product Benchmark Report saved to:", outPath);

  console.log("\n=== FIRE TEST 004: JQ PRODUCT BENCHMARK (ORIGINAL C JQ VS LIN-JQ) ===");
  console.table(summary);

  return summary;
}

analyzeJqRun();
