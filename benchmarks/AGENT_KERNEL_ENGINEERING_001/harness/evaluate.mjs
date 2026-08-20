import fs from "fs";
import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";

// ═══ Evaluation Harness for AGENT_KERNEL_ENGINEERING_001 ═══

const SNAP = "benchmarks/AGENT_KERNEL_ENGINEERING_001/harness/original_snapshots";
const SCEN = "benchmarks/AGENT_KERNEL_ENGINEERING_001/scenarios";

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
  const regex = new RegExp("function " + funcName + "[\\s\\S]*?\\n}");
  const match = code.match(regex);
  return match ? match[0].trim() : null;
}

async function evaluateScenario(scenarioId, scenarioName, snapId) {
  const scenDir = SCEN + "/" + scenarioId;
  const snapDir = SNAP + "/" + snapId;

  const origSource = fs.readFileSync(snapDir + "/source.lin.orig", "utf8");
  const modSource = fs.readFileSync(scenDir + "/source.lin", "utf8");
  const origBench = fs.readFileSync(snapDir + "/benchmark.mjs.orig", "utf8");
  const modBench = fs.readFileSync(scenDir + "/benchmark.mjs", "utf8");

  const sourceDiff = diffLines(origSource, modSource);
  const benchDiff = diffLines(origBench, modBench);

  let linValid = false;
  let linHash = null;
  try {
    const parsed = LinSurfaceParser.parse(modSource);
    linValid = parsed.verification.valid;
    linHash = parsed.hashes.workflow_hash.slice(0, 16);
  } catch(e) { linValid = false; }

  let benchResult = null;
  try {
    benchResult = JSON.parse(fs.readFileSync(scenDir + "/result.json", "utf8"));
  } catch(e) {}

  let frozenOk = true;
  let frozenDetails = [];
  if (scenarioId.includes("scenario_1")) {
    const origDec = extractFunction(origBench, "lin_lz_decompress");
    const modDec = extractFunction(modBench, "lin_lz_decompress");
    if (origDec && modDec && origDec !== modDec) {
      frozenOk = false;
      frozenDetails.push("lin_lz_decompress was modified");
    }
  } else {
    const origEnq = extractFunction(origBench, "iosched_enqueue");
    const modEnq = extractFunction(modBench, "iosched_enqueue");
    if (origEnq && modEnq && origEnq !== modEnq) {
      frozenOk = false;
      frozenDetails.push("iosched_enqueue was modified");
    }
    const origVer = extractFunction(origBench, "verifyAllDispatched");
    const modVer = extractFunction(modBench, "verifyAllDispatched");
    if (origVer && modVer && origVer !== modVer) {
      frozenOk = false;
      frozenDetails.push("verifyAllDispatched was modified");
    }
  }

  return {
    scenario: scenarioId,
    name: scenarioName,
    source_diff: sourceDiff,
    bench_diff: benchDiff,
    lin_valid: linValid,
    lin_hash: linHash,
    frozen_functions_ok: frozenOk,
    frozen_details: frozenDetails,
    benchmark_result: benchResult
  };
}

async function main() {
  console.log("================================================================");
  console.log("  AGENT_KERNEL_ENGINEERING_001 -- Evaluation Harness");
  console.log("================================================================\n");

  const eval1 = await evaluateScenario("scenario_1_compress", "Compression (mixed_structured)", "scenario_1");
  const eval2 = await evaluateScenario("scenario_2_iosched", "I/O Scheduler (random)", "scenario_2");

  for (const ev of [eval1, eval2]) {
    console.log("--- " + ev.name + " ---");
    console.log("  Source diff: +" + ev.source_diff.added + " -" + ev.source_diff.removed + " ~" + ev.source_diff.changed + " (delta: " + ev.source_diff.total_delta + ")");
    console.log("  Bench diff:  +" + ev.bench_diff.added + " -" + ev.bench_diff.removed + " ~" + ev.bench_diff.changed + " (delta: " + ev.bench_diff.total_delta + ")");
    console.log("  LIN valid: " + ev.lin_valid + (ev.lin_hash ? " (hash: " + ev.lin_hash + "...)" : ""));
    console.log("  Frozen functions OK: " + ev.frozen_functions_ok + (ev.frozen_details.length > 0 ? " [" + ev.frozen_details.join(", ") + "]" : ""));
    if (ev.benchmark_result) {
      console.log("  All parity: " + ev.benchmark_result.all_parity);
      for (const [key, r] of Object.entries(ev.benchmark_result.results)) {
        console.log("    " + key + ": " + JSON.stringify(r));
      }
    } else {
      console.log("  No benchmark result found (result.json missing)");
    }
    console.log("");
  }

  const summary = { scenario_1: eval1, scenario_2: eval2 };
  fs.writeFileSync("benchmarks/AGENT_KERNEL_ENGINEERING_001/results/evaluation.json", JSON.stringify(summary, null, 2));
  console.log("  Evaluation saved to results/evaluation.json");
}

main().catch(console.error);
