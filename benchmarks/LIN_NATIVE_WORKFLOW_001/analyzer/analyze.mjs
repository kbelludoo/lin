/**
 * LIN_NATIVE_WORKFLOW_001 / analyze.mjs
 * Aggregates C0, C1, C2, C3 vs C4 (LIN Native Workflow).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeNativeRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const conditions = [
    "C0_JS_TS_BASELINE",
    "C1_LIN_STANDALONE",
    "C2_AINL_STANDALONE",
    "C3_COMPOSITE_EXTERNAL",
    "C4_LIN_NATIVE_WORKFLOW"
  ];

  const summary = {};

  for (const cond of conditions) {
    const recs = raw.records.filter(r => r.condition === cond);
    const n = recs.length;

    const avgTokens = recs.reduce((a, r) => a + r.total_tokens, 0) / n;
    const avgRecon = recs.reduce((a, r) => a + r.p70_recon_tokens, 0) / n;
    const avgLat = recs.reduce((a, r) => a + r.execution_latency_ms, 0) / n;
    const overInval = recs[0].over_invalidation_rate;
    const selectivity = recs[0].selectivity_score;
    const invariants = recs[0].invariants_preserved;
    const overheadTok = recs[0].cross_language_overhead_tokens;

    summary[cond] = {
      label: cond,
      mean_tokens_full_cycle: Math.round(avgTokens),
      mean_p70_recon_tokens: Math.round(avgRecon),
      mean_latency_ms: Number(avgLat.toFixed(1)),
      over_invalidation_rate: overInval,
      SELECTIVITY_SCORE: Number(selectivity.toFixed(3)),
      invariants_preserved: invariants,
      cross_language_overhead: overheadTok
    };
  }

  const outPath = path.join(runDir, 'final_native_workflow_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("Native Workflow Analysis Report saved to:", outPath);

  console.log("\n=== LIN NATIVE WORKFLOW (C4) VS COMPOSITE (C3) & BASELINES ===");
  console.table(summary);

  return summary;
}

analyzeNativeRun();
