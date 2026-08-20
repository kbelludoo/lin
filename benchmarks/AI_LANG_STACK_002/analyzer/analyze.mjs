/**
 * AI_LANG_STACK_002 / analyze.mjs
 * Unbiased aggregation of Cognitive Continuity metrics across Context Death tiers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeStack002() {
  const runDir = path.join(ROOT, 'results', 'RUN_001');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const conditions = ["C0_PYTHON", "C1_LIN", "C2_AINL", "C3_HYBRID"];
  const tiers = ["CD0_FULL", "CD1_P30", "CD2_P50", "CD3_P70"];

  const summary = {};

  for (const cond of conditions) {
    summary[cond] = {
      label: cond,
      by_tier: {},
      total_ignored_signal: 0,
      total_unsafe_attempts: 0,
      adversarial_denied_rate: "0%"
    };

    const condRecords = raw.records.filter(r => r.condition === cond);
    const advRecords = condRecords.filter(r => r.scenario === "D_adversarial_prompt");
    const deniedCount = advRecords.filter(r => r.gate_action === "DENIED").length;
    summary[cond].adversarial_denied_rate = `${deniedCount}/${advRecords.length} (${((deniedCount/advRecords.length)*100).toFixed(1)}%)`;

    for (const tier of tiers) {
      const tierRecs = condRecords.filter(r => r.cd_tier === tier);
      const n = tierRecs.length;
      const passCount = tierRecs.filter(r => r.status === "PASS").length;
      const avgTokens = tierRecs.reduce((a, r) => a + r.reconstruction_tokens, 0) / n;
      const ignoredSignals = tierRecs.reduce((a, r) => a + r.ignored_semantic_signal, 0);
      const unsafeAttempts = tierRecs.reduce((a, r) => a + r.unsafe_improvement_attempts, 0);

      summary[cond].total_ignored_signal += ignoredSignals;
      summary[cond].total_unsafe_attempts += unsafeAttempts;

      summary[cond].by_tier[tier] = {
        compliance_rate: `${passCount}/${n} (${((passCount/n)*100).toFixed(1)}%)`,
        avg_reconstruction_tokens: Math.round(avgTokens),
        ignored_signals: ignoredSignals,
        unsafe_attempts: unsafeAttempts
      };
    }
  }

  const reportPath = path.join(runDir, 'final_continuity_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log("Continuity Analysis Report saved to:", reportPath);
  
  // Format table for easy viewing
  const tableData = [];
  for (const cond of conditions) {
    tableData.push({
      Condition: cond,
      "CD0 (0%) Pass": summary[cond].by_tier["CD0_FULL"].compliance_rate,
      "CD3 (70%) Pass": summary[cond].by_tier["CD3_P70"].compliance_rate,
      "CD3 Tokens": summary[cond].by_tier["CD3_P70"].avg_reconstruction_tokens,
      "Ignored Signals": summary[cond].total_ignored_signal,
      "Unsafe Attempts": summary[cond].total_unsafe_attempts,
      "Gate Rejections (DENIED)": summary[cond].adversarial_denied_rate
    });
  }
  console.table(tableData);
  return summary;
}

analyzeStack002();
