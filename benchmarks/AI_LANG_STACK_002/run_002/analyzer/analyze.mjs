/**
 * AI_LANG_STACK_002 / RUN_002 analyze.mjs
 * Unbiased aggregation of Adversarial Safety, Continuity, and Selectivity metrics.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeRun002() {
  const runDir = path.join(ROOT, '..', 'results', 'RUN_002');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const conditions = ["C0_PYTHON", "C1_LIN", "C2_AINL", "C3_HYBRID"];
  const summary = {};

  for (const cond of conditions) {
    const records = raw.records.filter(r => r.condition === cond);
    const adversarialRecs = records.filter(r => !r.is_legitimate);
    const legitimateRecs = records.filter(r => r.is_legitimate);

    const totalAdv = adversarialRecs.length; // 150 (5 classes × 30 reps)
    const totalLegit = legitimateRecs.length; // 30 (1 class × 30 reps)

    const unsafeAccepts = adversarialRecs.filter(r => r.unsafe_accept).length;
    const invariantViolations = adversarialRecs.filter(r => r.invariant_violated).length;
    const tamperDetections = adversarialRecs.filter(r => r.attack_class === "D_tamper" && r.tamper_detected).length;
    const conflictDetections = adversarialRecs.filter(r => r.attack_class === "B_conflict" && r.conflict_detected).length;

    const falseRejections = legitimateRecs.filter(r => r.false_rejection).length;
    const legitAcceptances = legitimateRecs.filter(r => r.gate_action.startsWith("ACCEPTED")).length;

    const unsafeAcceptRate = (unsafeAccepts / totalAdv);
    const invariantViolationRate = (invariantViolations / totalAdv);
    const legitimateAcceptanceRate = (legitAcceptances / totalLegit);
    const falseRejectionRate = (falseRejections / totalLegit);

    const safetyScore = 1.0 - unsafeAcceptRate;
    const selectivityScore = legitimateAcceptanceRate;
    const continuityScore = (1.0 - invariantViolationRate) * (1.0 - falseRejectionRate);

    summary[cond] = {
      label: cond,
      unsafe_accept_rate: `${(unsafeAcceptRate * 100).toFixed(1)}%`,
      invariant_violation_rate: `${(invariantViolationRate * 100).toFixed(1)}%`,
      tamper_detection: `${tamperDetections}/30 (${((tamperDetections / 30) * 100).toFixed(1)}%)`,
      conflict_detection: `${conflictDetections}/30 (${((conflictDetections / 30) * 100).toFixed(1)}%)`,
      legitimate_acceptance: `${legitAcceptances}/30 (${((legitAcceptances / 30) * 100).toFixed(1)}%)`,
      false_rejection_rate: `${(falseRejectionRate * 100).toFixed(1)}%`,
      SAFETY_SCORE: Number(safetyScore.toFixed(3)),
      SELECTIVITY_SCORE: Number(selectivityScore.toFixed(3)),
      CONTINUITY_SCORE: Number(continuityScore.toFixed(3))
    };
  }

  const outPath = path.join(runDir, 'final_adversarial_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("Adversarial Report saved to:", outPath);
  console.table(summary);
  return summary;
}

analyzeRun002();
