import { LinWorkflowEngine } from "./lin_workflow_engine.mjs";

export class LinSurfaceParser {
  static parse(sourceText) {
    const lines = sourceText.split("\n");
    const workflowNodes = {};
    const workflowEdges = [];
    let insideWorkflow = false;
    let workflowId = "main_workflow";
    let entryNode = null;
    let prevNodeId = null;

    // Detectar declaração formal de efeitos no cabeçalho (~effects{...})
    const effectsMatch = sourceText.match(/~effects\{([^\}]+)\}/);
    const declaredEffects = effectsMatch ? effectsMatch[1].split(",").map(e => e.trim()) : ["pure"];
    const isDeclaredPureOnly = declaredEffects.includes("pure") && !declaredEffects.includes("io") && !declaredEffects.includes("async");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("//")) continue;

      if (line.startsWith("~workflow")) {
        insideWorkflow = true;
        continue;
      }

      if (insideWorkflow) {
        if (line === "}") {
          insideWorkflow = false;
          continue;
        }

        if (line.startsWith("step ")) {
          const stepMatch = line.match(/^step\s+([A-Za-z0-9_]+)\s*->\s*(.*)$/);
          if (stepMatch) {
            const nodeId = stepMatch[1];
            let rest = stepMatch[2].trim();

            if (!entryNode) entryNode = nodeId;

            let controlOp = "step";
            let controlConfig = {};

            const retryMatch = rest.match(/^retry\((\d+),\s*([A-Za-z0-9_]+)\)\s+(.*)$/);
            if (retryMatch) {
              controlOp = "retry";
              controlConfig = { retries: parseInt(retryMatch[1], 10), backoff: retryMatch[2] === "exp" ? "exponential" : "linear" };
              rest = retryMatch[3].trim();
            }

            const branchMatch = rest.match(/^(.*?)\s*\?\((.*?)\)\s*->\s*([A-Za-z0-9_]+)\s*:\s*->\s*([A-Za-z0-9_]+)$/);
            let actionExpr = rest;
            if (branchMatch) {
              actionExpr = branchMatch[1];
              controlOp = "if";
              controlConfig.condition_predicate = branchMatch[2];
              controlConfig.then_target = branchMatch[3];
              controlConfig.else_target = branchMatch[4];
            }

            const callMatch = actionExpr.match(/^([A-Za-z0-9_]+)\((.*)\)$/);
            const unitName = callMatch ? callMatch[1] : actionExpr;

            const isIO = actionExpr.includes("http_") || actionExpr.includes("memory_") || actionExpr.includes("fs_");
            
            // Se o módulo declarou ~effects{pure} estrito, qualquer expressão de corpo com IO viola o contrato formal!
            const nodeEffects = isIO ? ["io", "async"] : ["pure"];
            const violatesPure = (isDeclaredPureOnly && isIO);

            workflowNodes[nodeId] = {
              id: nodeId,
              unit_name: unitName,
              inputs: [{ name: "in", type: "any" }],
              outputs: [{ name: "out", type: "any" }],
              effects: nodeEffects,
              body_ast: { raw_expr: actionExpr, isIO, violatesPure },
              control_op: controlOp,
              control_config: controlConfig
            };

            if (prevNodeId) {
              workflowEdges.push({
                from_node: prevNodeId,
                from_port: "out",
                to_node: nodeId,
                to_port: "in"
              });
            }
            prevNodeId = nodeId;
          }
        }
      }
    }

    const dag = {
      id: workflowId,
      entry_node: entryNode || "start",
      nodes: workflowNodes,
      edges: workflowEdges
    };

    const verification = LinWorkflowEngine.verifyWorkflow(dag);
    
    // Adicionar verificação estrita de violação de efeito
    for (const [nid, node] of Object.entries(dag.nodes)) {
      if (node.body_ast && node.body_ast.violatesPure) {
        verification.valid = false;
        verification.errors.push(`Effect violation on node '${nid}': Module declares ~effects{pure}, but step executes un-sandboxed IO expression '${node.body_ast.raw_expr}'.`);
      }
    }

    return {
      dag,
      verification,
      hashes: LinWorkflowEngine.computeHierarchicalHash(dag)
    };
  }
}
