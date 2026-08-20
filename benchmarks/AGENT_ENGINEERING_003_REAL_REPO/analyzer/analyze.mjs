/**
 * AGENT_ENGINEERING_003_REAL_REPO / analyze.mjs
 * Unbiased aggregation across real production repositories (dayjs, underscore, chalk).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeRealRepoRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const repos = ["REPO_DAYJS", "REPO_UNDERSCORE", "REPO_CHALK"];
  const conditions = [
    "C0_PYTHON_JS_BASELINE",
    "C1_LIN_STANDALONE",
    "C2_AINL_STANDALONE",
    "C3_COMPOSITE_STACK"
  ];

  const summaryByRepo = {};
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
      adversarial_leaks_total: 0
    };
  }

  for (const r of repos) {
    summaryByRepo[r] = {};
    for (const cond of conditions) {
      const recs = raw.records.filter(rec => rec.repo_id === r && rec.condition === cond);
      const n = recs.length;

      const completed = recs.filter(rec => rec.lifecycle_completed).length;
      const avgTokens = recs.reduce((a, rec) => a + rec.total_tokens, 0) / n;
      const avgLatency = recs.reduce((a, rec) => a + rec.cumulative_latency_ms, 0) / n;
      const avgRecon = recs.reduce((a, rec) => a + rec.recon_tokens_p70, 0) / n;
      const violations = recs.reduce((a, rec) => a + rec.regression_violations, 0);
      const leaks = recs.reduce((a, rec) => a + rec.adversarial_leaks, 0);
      const avgRatio = recs.reduce((a, rec) => a + rec.semantic_to_operational_ratio, 0) / n;

      summaryByRepo[r][cond] = {
        completion: `${completed}/${n} (${((completed / n) * 100).toFixed(1)}%)`,
        avg_tokens: Math.round(avgTokens),
        avg_latency_ms: Number(avgLatency.toFixed(1)),
        avg_p70_recon_tokens: Math.round(avgRecon),
        regression_violations: violations,
        adversarial_leaks: leaks,
        ratio: Number(avgRatio.toFixed(2))
      };

      aggregatedByCondition[cond].total_trials += n;
      aggregatedByCondition[cond].completed_trials += completed;
      aggregatedByCondition[cond].tokens_list.push(avgTokens);
      aggregatedByCondition[cond].latency_list.push(avgLatency);
      aggregatedByCondition[cond].p70_tokens_list.push(avgRecon);
      aggregatedByCondition[cond].violations_total += violations;
      aggregatedByCondition[cond].adversarial_leaks_total += leaks;
    }
  }

  const overallRealRepo = {};
  for (const cond of conditions) {
    const agg = aggregatedByCondition[cond];
    const meanTok = agg.tokens_list.reduce((a, b) => a + b, 0) / repos.length;
    const meanLat = agg.latency_list.reduce((a, b) => a + b, 0) / repos.length;
    const meanP70 = agg.p70_tokens_list.reduce((a, b) => a + b, 0) / repos.length;

    overallRealRepo[cond] = {
      label: cond,
      real_world_completion: `${agg.completed_trials}/${agg.total_trials} (${((agg.completed_trials / agg.total_trials) * 100).toFixed(1)}%)`,
      mean_tokens_all_repos: Math.round(meanTok),
      mean_p70_recon_tokens: Math.round(meanP70),
      mean_latency_ms: Number(meanLat.toFixed(1)),
      violations_total: agg.violations_total,
      adversarial_leaks_total: agg.adversarial_leaks_total
    };
  }

  const outPath = path.join(runDir, 'final_real_repo_report.json');
  fs.writeFileSync(outPath, JSON.stringify({ summaryByRepo, overallRealRepo }, null, 2));
  console.log("Real-World Repo Analysis Report saved to:", outPath);

  console.log("\n=== REAL-WORLD PRODUCTION REPOSITORIES OVERVIEW (Day.js, Underscore, Chalk) ===");
  console.table(overallRealRepo);

  return { summaryByRepo, overallRealRepo };
}

analyzeRealRepoRun();
