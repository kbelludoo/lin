import fs from "fs";
import { LinSurfaceParser } from "../../../../src/lin_surface_parser.mjs";

// ═══ Benchmark: I/O scheduler ═══
// The JS implementation below corresponds to the LIN source in source.lin.
// When modifying the algorithm, update BOTH source.lin and this JS implementation.

const MAX_SECTOR = 1000000;
const ITERS = 1000;

// ═══ LIN source verification ═══
const linSource = fs.readFileSync(new URL("./source.lin", import.meta.url), "utf8");
const parsed = LinSurfaceParser.parse(linSource);
console.log("LIN parse:", parsed.verification.valid ? "VALID" : "INVALID",
  "| nodes:", Object.keys(parsed.dag.nodes).length,
  "| edges:", parsed.dag.edges.length,
  "| hash:", parsed.hashes.workflow_hash.slice(0, 16) + "...");

// ═══ JS implementation (compiled output of source.lin) ═══

// enqueue function -- FROZEN, do not modify
function iosched_enqueue(queue, req) {
  queue.push(req);
  return queue;
}

// dispatch_batch -- the agent modifies this
function iosched_dispatch_batch(queue, batchSize) {
  queue.sort((a, b) => a.sector - b.sector);
  const result = [];
  for (let i = 0; i < batchSize && queue.length > 0; i++) {
    result.push(queue.shift());
  }
  return result;
}

// verifyAllDispatched -- FROZEN, do not modify
function verifyAllDispatched(dispatched, original) {
  if (dispatched.length !== original.length) return false;
  const ids = new Set(dispatched.map(r => r.id));
  for (const req of original) { if (!ids.has(req.id)) return false; }
  return true;
}

function computeSeekDistance(dispatchOrder) {
  let total = 0;
  for (let i = 1; i < dispatchOrder.length; i++) {
    total += Math.abs(dispatchOrder[i].sector - dispatchOrder[i-1].sector);
  }
  return total / dispatchOrder.length;
}

// ═══ Workload generation (seeded, FROZEN) ═══
let seed = 12345;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

function generateWorkload(type, count) {
  const reqs = [];
  seed = 12345;
  for (let i = 0; i < count; i++) {
    let sector;
    switch (type) {
      case "sequential": sector = (i * 8) % MAX_SECTOR; break;
      case "random": sector = Math.floor(rand() * MAX_SECTOR); break;
      case "mixed_rw": if (rand() < 0.7) sector = (i * 8) % MAX_SECTOR; else sector = Math.floor(rand() * MAX_SECTOR); break;
      case "bursty": const b = Math.floor(i / 8), w = i % 8; sector = ((b * 1000 + w * 4) + Math.floor(rand() * 3)) % MAX_SECTOR; break;
      default: sector = Math.floor(rand() * MAX_SECTOR);
    }
    reqs.push({ sector, size: 4 + Math.floor(rand() * 60), prio: Math.floor(rand() * 4), id: i });
  }
  return reqs;
}

const workloads = {
  "sequential": generateWorkload("sequential", 256),
  "random": generateWorkload("random", 256),
  "mixed_rw": generateWorkload("mixed_rw", 256),
  "bursty": generateWorkload("bursty", 256)
};

// ═══ Run benchmark ═══
console.log("\n--- Benchmark Results ---");
const results = {};
let allParity = true;

for (const [wlName, wlData] of Object.entries(workloads)) {
  const q = [];
  for (const req of wlData) iosched_enqueue(q, { ...req });
  const dispatched = iosched_dispatch_batch(q, wlData.length);
  const parity = verifyAllDispatched(dispatched, wlData);
  if (!parity) allParity = false;
  const seek = computeSeekDistance(dispatched);
  results[wlName] = { avg_seek: seek.toFixed(1), parity };
  console.log(`  ${wlName.padEnd(14)} seek: ${seek.toFixed(1).padStart(12)} | parity: ${parity ? "OK" : "FAIL"}`);
}

console.log(`\n  All parity: ${allParity ? "OK" : "FAIL"}`);

const summary = { all_parity: allParity, results, lin_valid: parsed.verification.valid };
fs.writeFileSync(new URL("./result.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log("\n  Results saved to result.json");