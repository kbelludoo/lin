// semantic_index_generator.mjs
// Generates semantic_index.json from source.lin ONLY
// Deterministic transformation: no task knowledge, no performance diagnosis

import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import fs from "fs";

function generateSemanticIndex(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const parsed = LinSurfaceParser.parse(source);
  
  if (!parsed.verification.valid) {
    throw new Error("Invalid LIN source: " + sourcePath);
  }

  const dag = parsed.dag;
  const nodes = {};
  
  // Build reverse mapping: unit_name -> node_id
  const unitNameToId = {};
  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    unitNameToId[node.unit_name] = nodeId;
  }
  
  // Extract nodes
  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    const nodeData = {
      id: nodeId,
      unit_name: node.unit_name,
      contract: extractContract(source, nodeId, node),
      effects: extractEffects(node),
      dependencies: extractDependencies(dag, nodeId),
      control_op: node.control_op,
      inputs: node.inputs || [],
      outputs: node.outputs || [],
      hash: parsed.hashes?.node_hashes?.[node.unit_name]?.slice(0, 16) || null
    };
    nodes[nodeId] = nodeData;
  }

  // Extract edges
  const edges = [];
  for (const edge of dag.edges) {
    edges.push({
      from: edge.from_node,
      from_port: edge.from_port,
      to: edge.to_node,
      to_port: edge.to_port
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source_hash: parsed.hashes?.workflow_hash?.slice(0, 32) || null,
    node_count: Object.keys(nodes).length,
    edge_count: edges.length,
    nodes: nodes,
    edges: edges,
    entry_node: dag.entry_node
  };
}

function extractContract(source, nodeId, node) {
  // Extract comments associated with this node from the raw source
  // Look for comments before the node definition
  const nodePattern = new RegExp("\\!" + nodeId + "[\\s\\S]*?\\{", "i");
  const nodeMatch = source.match(nodePattern);
  
  if (nodeMatch) {
    const nodeStart = nodeMatch.index;
    const beforeNode = source.substring(Math.max(0, nodeStart - 200), nodeStart);
    const commentMatch = beforeNode.match(/\/\/\s*([^\n]*)/g);
    if (commentMatch && commentMatch.length > 0) {
      // Get the last comment before the node
      const lastComment = commentMatch[commentMatch.length - 1];
      return lastComment.replace(/\/\//, "").trim();
    }
  }
  
  // Fallback: use unit_name
  return node.unit_name || "no contract extracted";
}

function extractEffects(node) {
  const effects = [];
  if (node.effects && Array.isArray(node.effects)) {
    effects.push(...node.effects);
  }
  // Infer from control_op
  if (node.control_op === "step") {
    effects.push("computational_step");
  } else if (node.control_op === "if") {
    effects.push("conditional_branch");
  } else if (node.control_op === "loop") {
    effects.push("iteration");
  }
  return effects.length > 0 ? effects : ["unknown_effect"];
}

function extractDependencies(dag, nodeId) {
  const deps = [];
  for (const edge of dag.edges) {
    if (edge.to_node === nodeId) {
      deps.push({
        from: edge.from_node,
        from_port: edge.from_port,
        to_port: edge.to_port
      });
    }
  }
  return deps;
}

// CLI interface
const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Usage: node semantic_index_generator.mjs <source.lin>");
  process.exit(1);
}

try {
  const index = generateSemanticIndex(sourcePath);
  console.log(JSON.stringify(index, null, 2));
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
