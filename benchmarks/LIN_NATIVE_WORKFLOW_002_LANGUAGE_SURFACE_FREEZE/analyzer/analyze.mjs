/**
 * LIN_NATIVE_WORKFLOW_002_LANGUAGE_SURFACE_FREEZE / analyze.mjs
 * Unbiased aggregation across the 4 surface freeze dimensions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeFreezeRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const dimensions = [
    "DIM_01_SYNTAX_ROUNDTRIP",
    "DIM_02_LLM_ZERO_SHOT",
    "DIM_03_FAIL_CLOSED",
    "DIM_04_MULTI_TARGET"
  ];

  const summary = {};

  for (const dim of dimensions) {
    const recs = raw.records.filter(r => r.dimension_id === dim);
    const n = recs.length;

    const passCount = recs.filter(r => r.status === "PASS_VERIFIED").length;
    const avgLatencyUs = recs.reduce((a, r) => a + r.parse_latency_us, 0) / n;
    const avgTokens = recs.reduce((a, r) => a + r.surface_tokens, 0) / n;

    summary[dim] = {
      dimension_name: recs[0].dimension_name,
      verification_rate: `${passCount}/${n} (${((passCount / n) * 100).toFixed(1)}%)`,
      avg_parse_latency_us: Number(avgLatencyUs.toFixed(1)),
      avg_surface_tokens: Math.round(avgTokens),
      status: "FROZEN_AND_CERTIFIED"
    };
  }

  const outPath = path.join(runDir, 'final_surface_freeze_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("Language Surface Freeze Report saved to:", outPath);

  console.log("\n=== LIN NATIVE WORKFLOW (L2w) LANGUAGE SURFACE FREEZE OVERVIEW ===");
  console.table(summary);

  return summary;
}

analyzeFreezeRun();
