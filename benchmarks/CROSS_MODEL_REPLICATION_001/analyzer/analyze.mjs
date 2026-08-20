/**
 * CROSS_MODEL_REPLICATION_001 / analyze.mjs
 * Aggregates results across all 4 frontier model families to evaluate architecture invariance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeCrossModel() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const models = ["M1_DEEPSEEK_V3", "M2_CLAUDE_35_SONNET", "M3_GPT_4O", "M4_GEMINI_15_PRO"];
  const conditions = ["C0_PYTHON_BASELINE", "C1_LIN_STANDALONE", "C2_AINL_STANDALONE", "C3_COMPOSITE_STACK"];

  const summaryByModel = {};
  const aggregatedByCondition = {};

  for (const cond of conditions) {
    aggregatedByCondition[cond] = {
      label: cond,
      total_trials: 0,
      completed_trials: 0,
      tokens_list: [],
      latency_list: [],
      p70_tokens_list: [],
      violations_total: 0,
      unsafe_total: 0
    };
  }

  for (const m of models) {
    summaryByModel[m] = {};
    for (const cond of conditions) {
      const recs = raw.records.filter(r => r.model_id === m && r.condition === cond);
      const n = recs.length;

      const completed = recs.filter(r => r.lifecycle_completed).length;
      const avgTok = recs.reduce((a, r) => a + r.total_tokens, 0) / n;
      const avgLat = recs.reduce((a, r) => a + r.latency_ms, 0) / n;
      const avgRecon = recs.reduce((a, r) => a + r.recon_tokens_p70, 0) / n;
      const unsafe = recs.reduce((a, r) => a + r.unsafe_accepts, 0);
      const violations = recs.reduce((a, r) => a + r.invariant_violations, 0);

      summaryByModel[m][cond] = {
        completion_rate: `${completed}/${n} (${((completed/n)*100).toFixed(1)}%)`,
        avg_tokens: Math.round(avgTok),
        avg_latency_ms: Number(avgLat.toFixed(1)),
        avg_p70_recon_tokens: Math.round(avgRecon),
        violations_total: violations
      };

      aggregatedByCondition[cond].total_trials += n;
      aggregatedByCondition[cond].completed_trials += completed;
      aggregatedByCondition[cond].tokens_list.push(avgTok);
      aggregatedByCondition[cond].latency_list.push(avgLat);
      aggregatedByCondition[cond].p70_tokens_list.push(avgRecon);
      aggregatedByCondition[cond].violations_total += violations;
      aggregatedByCondition[cond].unsafe_total += unsafe;
    }
  }

  const crossModelOverview = {};
  for (const cond of conditions) {
    const agg = aggregatedByCondition[cond];
    const meanTok = agg.tokens_list.reduce((a, b) => a + b, 0) / models.length;
    const stdTok = Math.sqrt(agg.tokens_list.reduce((a, b) => a + Math.pow(b - meanTok, 2), 0) / models.length);
    const cvTok = (stdTok / meanTok) * 100;

    crossModelOverview[cond] = {
      label: cond,
      cross_model_completion: `${agg.completed_trials}/${agg.total_trials} (${((agg.completed_trials/agg.total_trials)*100).toFixed(1)}%)`,
      mean_tokens_all_models: Math.round(meanTok),
      token_variance_cv: `${cvTok.toFixed(2)}%`,
      mean_p70_recon_tokens: Math.round(agg.p70_tokens_list.reduce((a, b) => a + b, 0) / models.length),
      mean_latency_ms: Number((agg.latency_list.reduce((a, b) => a + b, 0) / models.length).toFixed(1)),
      violations_total: agg.violations_total,
      unsafe_accepts_total: agg.unsafe_total
    };
  }

  const outPath = path.join(runDir, 'final_cross_model_report.json');
  fs.writeFileSync(outPath, JSON.stringify({ summaryByModel, crossModelOverview }, null, 2));
  console.log("Cross-Model Report saved to:", outPath);

  console.log("\n=== CROSS-MODEL INVARIANCE OVERVIEW (All 4 Frontier Families) ===");
  console.table(crossModelOverview);

  return { summaryByModel, crossModelOverview };
}

analyzeCrossModel();
