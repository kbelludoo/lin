import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import fs from "fs";

const source = fs.readFileSync("benchmarks/AGENT_KERNEL_ENGINEERING_002/scenarios/iosched_variant_C/source.lin", "utf8");
const parsed = LinSurfaceParser.parse(source);

console.log("Parsed type:", typeof parsed);
console.log("Parsed keys:", Object.keys(parsed));
console.log("Parsed constructor:", parsed.constructor?.name);

// Check verification
console.log("\nVerification:", JSON.stringify(parsed.verification, null, 2));

// Check if ir exists
console.log("\nHas ir:", "ir" in parsed);
console.log("ir value:", parsed.ir);

// Check hashes
console.log("\nHashes:", JSON.stringify(parsed.hashes, null, 2));

// Check all string properties
for (const [key, value] of Object.entries(parsed)) {
  if (typeof value === "string") {
    console.log("String " + key + ":", value.substring(0, 100));
  } else if (typeof value === "object" && value !== null) {
    console.log("Object " + key + ":", Object.keys(value));
  }
}
