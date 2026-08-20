import fs from "fs";
import { LinSurfaceParser } from "../../../src/lin_surface_parser.mjs";
import { LinWorkflowEngine } from "../../../src/lin_workflow_engine.mjs";

console.log("=== EXECUTANDO LIN_LANGUAGE_SURFACE_001 (AGENT INTERFACE TEST) ===");

// 1. Programa real escrito na nova superfície sintática LIN
const linSource = `@LIN:L1c:1.0
^schema_once ^ops=enterprise_checkout
~G{?=if #=for ^=ret :else}
~effects{pure,io,async}

!validate_cart(cart: {total: num{>0}}): {valid: bool, total: num} {
  ?(cart.total <= 0) { ^{valid: false, total: 0} }
  ^{valid: true, total: cart.total}
}

!apply_vip_discount(cart: {valid: bool, total: num}): num {
  ?(cart.total >= 1000) { ^cart.total * 0.90 }
  ^cart.total
}

~workflow {
  step fetch_cart    -> http_get("https://api.internal/cart/123")
  step validate      -> validate_cart(fetch_cart)
  step apply_disc    -> apply_vip_discount(validate)
  step execute_pay   -> retry(3, exp) http_post("https://bank.gw/charge", apply_disc)
  step send_receipt  -> http_post("https://notify.internal/email", execute_pay)
}

=ex{validate_cart,apply_vip_discount}
`;

// 2. Parse da superfície para o Unified IR
const parseResult = LinSurfaceParser.parse(linSource);

console.log("1. Status do Parse da Superfície LIN:", parseResult.dag ? "SUCESSO (100%)" : "FALHA");
console.log("2. Nós do DAG Identificados:", Object.keys(parseResult.dag.nodes));
console.log("3. Arestas de Dependência Construídas:", parseResult.dag.edges.length);
console.log("4. Validação Estática de Efeitos:", parseResult.verification.valid ? "VÁLIDO" : "INVÁLIDO");
console.log("5. Semantic Hash Hierárquico Gerado:");
console.log("   - Edge Hash:", parseResult.hashes.edge_hash);
console.log("   - Workflow Hash:", parseResult.hashes.workflow_hash);

// 3. Emissão direta para TypeScript e Rust a partir da Superfície
const tsCode = LinWorkflowEngine.emitTypeScript(parseResult.dag);
const rustCode = LinWorkflowEngine.emitRust(parseResult.dag);

console.log("\n=== CÓDIGO TYPESCRIPT GERADO A PARTIR DA SUPERFÍCIE ===");
console.log(tsCode);

console.log("\n=== CÓDIGO RUST GERADO A PARTIR DA SUPERFÍCIE ===");
console.log(rustCode);

// 4. Medição de Tokens da Superfície Sintática
const surfaceChars = linSource.length;
const estTokens = Math.ceil(surfaceChars / 4);

console.log(`\nMétricas de Superfície Sintática:`);
console.log(`- Caracteres: ${surfaceChars}`);
console.log(`- Tokens Estimados: ~${estTokens} tokens (Ultra-compacto)`);

const summary = {
  benchmark_id: "LIN_LANGUAGE_SURFACE_001",
  parse_success: true,
  nodes_count: Object.keys(parseResult.dag.nodes).length,
  edges_count: parseResult.dag.edges.length,
  static_verification: parseResult.verification.valid,
  hierarchical_hash: parseResult.hashes,
  tokens_est: estTokens,
  emitted_ts_lines: tsCode.split("\n").length,
  emitted_rust_lines: rustCode.split("\n").length
};

fs.writeFileSync("benchmarks/LIN_LANGUAGE_SURFACE_001/results/SURFACE_001_SUMMARY.json", JSON.stringify(summary, null, 2));
console.log("\nBENCHMARK LIN_LANGUAGE_SURFACE_001 CONCLUÍDO COM SUCESSO.");