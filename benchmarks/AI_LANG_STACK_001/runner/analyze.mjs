/**
 * AI_LANG_STACK_001 / analyze.mjs
 * Pure, unbiased ranking and statistical metrics analysis.
 * No preference logic: strictly aggregates PASS/FAIL, tokens, runtime, and memory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function analyzeRun(runId = 'RUN_001') {
  const runDir = path.join(ROOT, 'results', runId);
  const rawPath = path.join(runDir, 'raw.json');
  if (!fs.existsSync(rawPath)) {
    console.error(`No raw results found at ${rawPath}`);
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const summary = {};

  for (const cond of raw.conditions) {
    const records = raw.records.filter(r => r.condition === cond.id);
    const totalCases = records.length;
    const passCount = records.filter(r => r.status === 'PASS').length;
    const firstPassCount = records.filter(r => r.first_pass === true).length;
    const totalTokens = records.reduce((acc, r) => acc + (r.tokens || 0), 0);
    const avgRuntime = records.reduce((acc, r) => acc + (r.execution_ms || 0), 0) / (totalCases || 1);
    const avgMemory = records.reduce((acc, r) => acc + (r.peak_memory_mb || 0), 0) / (totalCases || 1);

    summary[cond.id] = {
      label: cond.label,
      pass_rate: `${passCount}/${totalCases} (${((passCount/totalCases)*100).toFixed(1)}%)`,
      first_pass_rate: `${firstPassCount}/${totalCases} (${((firstPassCount/totalCases)*100).toFixed(1)}%)`,
      total_tokens: totalTokens,
      avg_execution_ms: Number(avgRuntime.toFixed(2)),
      avg_peak_memory_mb: Number(avgMemory.toFixed(2))
    };
  }

  const reportPath = path.join(runDir, 'final_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log("Analysis Summary written to:", reportPath);
  console.table(summary);
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  analyzeRun(process.argv[2] || 'RUN_001');
}
