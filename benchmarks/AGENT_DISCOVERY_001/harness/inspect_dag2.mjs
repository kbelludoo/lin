import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import fs from "fs";

const source = fs.readFileSync("benchmarks/AGENT_KERNEL_ENGINEERING_002/scenarios/iosched_variant_C/source.lin", "utf8");
const parsed = LinSurfaceParser.parse(source);

const dag = parsed.dag;
console.log("Edges type:", typeof dag.edges);
console.log("Edges is array:", Array.isArray(dag.edges));
console.log("Edges length:", dag.edges?.length);
console.log("Edges raw:", JSON.stringify(dag.edges, null, 2).substring(0, 1000));

// Also check node structure
const dispatchNode = dag.nodes["dispatch"];
console.log("\nDispatch node:");
console.log("  unit_name:", dispatchNode.unit_name);
console.log("  inputs:", JSON.stringify(dispatchNode.inputs));
console.log("  outputs:", JSON.stringify(dispatchNode.outputs));
console.log("  effects:", JSON.stringify(dispatchNode.effects));
console.log("  control_op:", dispatchNode.control_op);
console.log("  control_config:", JSON.stringify(dispatchNode.control_config));
console.log("  body_ast type:", typeof dispatchNode.body_ast);
console.log("  body_ast keys:", dispatchNode.body_ast ? Object.keys(dispatchNode.body_ast) : "null");

// Check if body_ast has useful info
if (dispatchNode.body_ast) {
  console.log("  body_ast:", JSON.stringify(dispatchNode.body_ast, null, 2).substring(0, 500));
}
