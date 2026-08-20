/**
 * AI_LANG_STACK_001 / analyze_run_002.mjs
 * Comprehensive statistical distribution analyzer (mean, median, stddev, p50, p95, p99, min, max).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(sorted.length - 1, idx)];
}

export function analyzeRun002() {
  const runDir = path.join(ROOT, 'results', 'RUN_002');
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, 'raw.json'), 'utf8'));

  const report = {};

  for (const cond of raw.conditions) {
    const records = raw.records.filter(r => r.condition === cond.id);
    const runtimes = records.map(r => r.execution_ms).sort((a, b) => a - b);
    const memories = records.map(r => r.peak_memory_mb).sort((a, b) => a - b);

    const n = runtimes.length;
    const mean = runtimes.reduce((a, b) => a + b, 0) / n;
    const variance = runtimes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stddev = Math.sqrt(variance);

    report[cond.id] = {
      label: cond.label,
      trials: n,
      mean_ms: Number(mean.toFixed(2)),
      median_ms: Number(percentile(runtimes, 0.50).toFixed(2)),
      stddev_ms: Number(stddev.toFixed(2)),
      p50_ms: Number(percentile(runtimes, 0.50).toFixed(2)),
      p95_ms: Number(percentile(runtimes, 0.95).toFixed(2)),
      p99_ms: Number(percentile(runtimes, 0.99).toFixed(2)),
      min_ms: Number(runtimes[0].toFixed(2)),
      max_ms: Number(runtimes[n - 1].toFixed(2)),
      avg_ram_mb: Number((memories.reduce((a, b) => a + b, 0) / n).toFixed(2))
    };
  }

  const outPath = path.join(runDir, 'final_statistical_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("Statistical Distribution Report written to:", outPath);
  console.table(report);
  return report;
}

analyzeRun002();
