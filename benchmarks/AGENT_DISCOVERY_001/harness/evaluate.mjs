import fs from "fs";
import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";

const BASE = "benchmarks/AGENT_DISCOVERY_001";
const SCEN = BASE + "/scenarios";

function diffLines(original, modified) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  let added = 0, removed = 0, changed = 0;
  const maxLen = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= origLines.length) added++;
    else if (i >= modLines.length) removed++;
    else if (origLines[i] !== modLines[i]) changed++;
  }
  return { added, removed, changed, total_delta: added + removed + changed };
}

function extractFunction(code, funcName) {
  const pattern = "function " + funcName + "[\\s\\S]*?}";
  const regex = new RegExp(pattern);
  const match = code.match(regex);
  return match ? match[0].trim() : null;
}

async function evaluateVariant(variant) {
  const scenDir = SCEN + "/iosched_variant_" + variant;
  
  // Read current files
  const source = fs.readFileSync(scenDir + "/source.lin", "utf8");
  const bench = fs.readFileSync(scenDir + "/benchmark.mjs", "utf8");
  
  // Read originals (we'll use the variant A files as originals since they should be unchanged)
  const origSource = fs.readFileSync(SCEN + "/iosched_variant_A/source.lin", "utf8");
  const origBench = fs.readFileSync(SCEN + "/iosched_variant_A/benchmark.mjs", "utf8");
  
  // Diff
  const sourceDiff = diffLines(origSource, source);
  const benchDiff = diffLines(origBench, bench);
  
  // Check LIN parse
  let linValid = false;
  let linHash = null;
  try {
    const parsed = LinSurfaceParser.parse(source);
    linValid = parsed.verification.valid;
    linHash = parsed.hashes?.workflow_hash?.slice(0, 16) || null;
  } catch(e) { linValid = false; }
  
  // Check frozen functions
  let frozenOk = true;
  const origEnq = extractFunction(origBench, "iosched_enqueue");
  const modEnq = extractFunction(bench, "iosched_enqueue");
  if (origEnq && modEnq && origEnq !== modEnq) frozenOk = false;
  
  const origVer = extractFunction(origBench, "verifyAllDispatched");
  const modVer = extractFunction(bench, "verifyAllDispatched");
  if (origVer && modVer && origVer !== modVer) frozenOk = false;
  
  // Run benchmark if files changed
  let benchResult = null;
  if (sourceDiff.total_delta > 0 || benchDiff.total_delta > 0) {
    try {
      const { execSync } = await import("child_process");
      execSync("node benchmark.mjs", { cwd: scenDir, encoding: "utf8" });
      const resultJson = fs.readFileSync(scenDir + "/result.json", "utf8");
      benchResult = JSON.parse(resultJson);
    } catch(e) {
      benchResult = { error: e.message };
    }
  }
  
  return {
    variant,
    source_diff: sourceDiff,
    bench_diff: benchDiff,
    files_changed: sourceDiff.total_delta > 0 || benchDiff.total_delta > 0,
    lin_valid: linValid,
    lin_hash: linHash,
    frozen_functions_ok: frozenOk,
    benchmark_result: benchResult
  };
}

async function main() {
  console.log("================================================================");
  console.log("  AGENT_DISCOVERY_001 -- Evaluation Harness");
  console.log("================================================================\n");
  
  const variants = ["A", "B", "C", "D"];
  const results = {};
  
  for (const v of variants) {
    console.log("Evaluating variant " + v + "...");
    const r = await evaluateVariant(v);
    results[v] = r;
    
    console.log("  Files changed: " + r.files_changed);
    console.log("  Source diff: +" + r.source_diff.added + " -" + r.source_diff.removed + " ~" + r.source_diff.changed + " (delta: " + r.source_diff.total_delta + ")");
    console.log("  Bench diff:  +" + r.bench_diff.added + " -" + r.bench_diff.removed + " ~" + r.bench_diff.changed + " (delta: " + r.bench_diff.total_delta + ")");
    console.log("  LIN valid: " + r.lin_valid + (r.lin_hash ? " (hash: " + r.lin_hash + "...)" : ""));
    console.log("  Frozen functions OK: " + r.frozen_functions_ok);
    
    if (r.benchmark_result && r.benchmark_result.results) {
      console.log("  Benchmark results:");
      for (const [wl, res] of Object.entries(r.benchmark_result.results)) {
        console.log("    " + wl + ": " + JSON.stringify(res));
      }
    } else if (r.benchmark_result && r.benchmark_result.error) {
      console.log("  Benchmark error: " + r.benchmark_result.error);
    } else {
      console.log("  No benchmark result (no changes)");
    }
    console.log("");
  }
  
  fs.writeFileSync(BASE + "/results/evaluation.json", JSON.stringify(results, null, 2));
  console.log("Evaluation saved to results/evaluation.json");
}

main().catch(console.error);
