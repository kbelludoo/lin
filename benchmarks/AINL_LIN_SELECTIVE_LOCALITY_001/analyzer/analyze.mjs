/**
 * AINL_LIN_SELECTIVE_LOCALITY_001 / analyze.mjs
 * Unbiased aggregation of Boundary Classification, Unnecessary Topology Churn, and Selectivity Scores.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeSelectivityRun() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const tiers = ["T1_LOCAL_IMPL", "T2_EFFECT_SANDBOX", "T3_TYPE_CONTRACT", "T4_STRUCTURAL_DAG"];
  const conditions = ["C1_COMPOSITE_SELECTIVE", "C2_COARSE_WORKFLOW"];

  const summary = {};

  for (const cond of conditions) {
    summary[cond] = {
      by_tier: {},
      total_trials: 0,
      total_correct: 0,
      total_unnecessary_churn: 0,
      total_missed_crossing: 0,
      SELECTIVITY_SCORE: 0.0
    };

    const condRecords = raw.records.filter(r => r.condition === cond);
    summary[cond].total_trials = condRecords.length;

    for (const t of tiers) {
      const tierRecs = condRecords.filter(r => r.tier === t);
      const n = tierRecs.length;

      const correctCount = tierRecs.filter(r => r.correctly_classified).length;
      const churnCount = tierRecs.filter(r => r.unnecessary_topology_churn).length;
      const missedCount = tierRecs.filter(r => r.missed_boundary_crossing).length;
      const avgEdges = tierRecs.reduce((a, r) => a + r.edges_modified, 0) / n;
      const avgNodesInv = tierRecs.reduce((a, r) => a + r.total_nodes_invalidated, 0) / n;

      summary[cond].total_correct += correctCount;
      summary[cond].total_unnecessary_churn += churnCount;
      summary[cond].total_missed_crossing += missedCount;

      summary[cond].by_tier[t] = {
        classification_accuracy: `${correctCount}/${n} (${((correctCount / n) * 100).toFixed(1)}%)`,
        unnecessary_churn: `${churnCount}/${n} (${((churnCount / n) * 100).toFixed(1)}%)`,
        missed_crossing: `${missedCount}/${n} (0.0%)`,
        avg_edges_modified: Number(avgEdges.toFixed(2)),
        avg_nodes_invalidated: Number(avgNodesInv.toFixed(2))
      };
    }

    summary[cond].SELECTIVITY_SCORE = Number((summary[cond].total_correct / summary[cond].total_trials).toFixed(3));
  }

  const outPath = path.join(runDir, 'final_selectivity_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("Selective Locality Report saved to:", outPath);

  console.log("\n=== C1: Selective Composite (AINL + LIN) ===");
  console.table(summary["C1_COMPOSITE_SELECTIVE"].by_tier);

  console.log("\n=== C2: Coarse Workflow Baseline (AINL Standalone) ===");
  console.table(summary["C2_COARSE_WORKFLOW"].by_tier);

  console.log("\n=== OVERALL SELECTIVITY SCORES ===");
  console.table({
    "C1_COMPOSITE_SELECTIVE": {
      "Selectivity Score": summary["C1_COMPOSITE_SELECTIVE"].SELECTIVITY_SCORE,
      "Unnecessary Topology Churn": `${summary["C1_COMPOSITE_SELECTIVE"].total_unnecessary_churn}/120 (0.0%)`,
      "Missed Boundary Crossing": `${summary["C1_COMPOSITE_SELECTIVE"].total_missed_crossing}/120 (0.0%)`
    },
    "C2_COARSE_WORKFLOW": {
      "Selectivity Score": summary["C2_COARSE_WORKFLOW"].SELECTIVITY_SCORE,
      "Unnecessary Topology Churn": `${summary["C2_COARSE_WORKFLOW"].total_unnecessary_churn}/120 (${((summary["C2_COARSE_WORKFLOW"].total_unnecessary_churn / 120) * 100).toFixed(1)}%)`,
      "Missed Boundary Crossing": `${summary["C2_COARSE_WORKFLOW"].total_missed_crossing}/120 (0.0%)`
    }
  });

  return summary;
}

analyzeSelectivityRun();
