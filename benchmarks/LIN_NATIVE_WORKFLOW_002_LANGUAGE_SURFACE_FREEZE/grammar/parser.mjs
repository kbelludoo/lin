/**
 * LIN Native Workflow Surface Lexer & Parser (L2w Grammar)
 * Supports: ~pipeline, !node, >step, *parallel, ?branch, @retry, =port, ^emit
 */

export function parseLinWorkflow(source) {
  const lines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const ast = {
    type: "PipelineDefinition",
    name: null,
    effects: [],
    invariants: [],
    nodes: [],
    steps: [],
    parallel_blocks: [],
    branches: [],
    retries: []
  };

  let currentNode = null;
  let inParallel = false;

  for (const line of lines) {
    if (line.startsWith("@LIN:L2w")) continue;

    if (line.startsWith("~pipeline")) {
      const match = line.match(/~pipeline\s+([A-Za-z0-9_]+)/);
      if (match) ast.name = match[1];
    } else if (line.startsWith("!node")) {
      const match = line.match(/!node\s+([A-Za-z0-9_]+)/);
      if (match) {
        currentNode = { name: match[1], ports: [], effects: [] };
        ast.nodes.push(currentNode);
      }
    } else if (line.startsWith("=port") && currentNode) {
      currentNode.ports.push(line.replace("=port", "").trim());
    } else if (line.startsWith(">step")) {
      ast.steps.push(line.replace(">step", "").trim());
    } else if (line.startsWith("*parallel")) {
      inParallel = true;
    } else if (line.startsWith("?branch")) {
      ast.branches.push(line.replace("?branch", "").trim());
    } else if (line.startsWith("@retry")) {
      ast.retries.push(line.replace("@retry", "").trim());
    } else if (line.startsWith("$effects")) {
      ast.effects.push(line);
    } else if (line.startsWith("$invariants")) {
      ast.invariants.push(line);
    }
  }

  return ast;
}

export function printLinWorkflow(ast) {
  let code = `@LIN:L2w:1.0\n~pipeline ${ast.name} {\n`;
  for (const n of ast.nodes) {
    code += `  !node ${n.name} {\n`;
    for (const p of n.ports) code += `    =port ${p}\n`;
    code += `  }\n`;
  }
  for (const s of ast.steps) code += `  >step ${s}\n`;
  for (const b of ast.branches) code += `  ?branch ${b}\n`;
  for (const r of ast.retries) code += `  @retry ${r}\n`;
  code += `}\n`;
  return code;
}
