import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import fs from "fs";

const source = fs.readFileSync("benchmarks/AGENT_KERNEL_ENGINEERING_002/scenarios/iosched_variant_C/source.lin", "utf8");
const parsed = LinSurfaceParser.parse(source);

console.log("IR keys:", Object.keys(parsed.ir));
console.log("IR type:", typeof parsed.ir);
console.log("IR constructor:", parsed.ir.constructor?.name);

if (Array.isArray(parsed.ir)) {
  console.log("IR is array, length:", parsed.ir.length);
  if (parsed.ir[0]) {
    console.log("First item keys:", Object.keys(parsed.ir[0]));
    console.log("First item:", JSON.stringify(parsed.ir[0], null, 2).substring(0, 500));
  }
} else {
  console.log("IR is object");
  for (const [key, value] of Object.entries(parsed.ir)) {
    console.log("  " + key + ":", typeof value, Array.isArray(value) ? "array[" + value.length + "]" : typeof value);
  }
}

console.log("\nHashes:", JSON.stringify(parsed.hashes, null, 2));
