import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import fs from "fs";

const source = fs.readFileSync("benchmarks/AGENT_KERNEL_ENGINEERING_002/scenarios/iosched_variant_C/source.lin", "utf8");
const parsed = LinSurfaceParser.parse(source);

const dag = parsed.dag;
console.log("DAG id:", dag.id);
console.log("DAG entry_node:", dag.entry_node);
console.log("\nNodes:");
for (const [nodeId, node] of Object.entries(dag.nodes)) {
  console.log("\n" + nodeId + ":");
  console.log("  keys:", Object.keys(node));
  console.log("  type:", node.type);
  console.log("  body:", (node.body || "").substring(0, 200));
  console.log("  raw:", (node.raw || "").substring(0, 200));
}

console.log("\nEdges:");
for (const edge of dag.edges) {
  console.log("  " + edge.from + " -> " + edge.to + " (" + edge.type + ")");
}
