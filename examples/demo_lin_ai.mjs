/**
 * demo_lin_ai.mjs — Demonstração Executável da IA Reescrita em LIN
 * 
 * Executa:
 * 1. O Runtime Neural do LIN (Forward Pass em Transformer com Tensores, Atenção e SwiGLU)
 * 2. O Loop Cognitivo Neuro-Simbólico do LIN (Proposta -> Gate -> Trauma -> Auto-Recuperação)
 */

import { LinTransformerModel, LinTensorEngine } from '../src/lin_neural_engine.mjs';
import { LinCognitiveAgent } from '../src/lin_cognitive_ai.mjs';

async function main() {
  console.log('================================================================');
  console.log('🌟 DEMONSTRAÇÃO: IA REESCRITA COM LIN (NEURAL + COGNITIVA)');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PARTE 1: O Runtime Neural do LIN (Transformer Nativo)
  // -------------------------------------------------------------
  console.log('📊 [PARTE 1] Executando Forward Pass no Transformer Nativo LIN...');

  const model = new LinTransformerModel({
    dim: 64,
    nHeads: 4,
    nLayers: 2,
    vocabSize: 256,
    hiddenDim: 128
  });

  const promptTokens = [64, 101, 110, 116, 114, 121]; // Tokens de entrada
  console.log(`   Tokens de Entrada: [${promptTokens.join(', ')}]`);

  const logits = model.forward(promptTokens);
  console.log(`   Dimensão dos Logits Emitidos: [${logits.length}]`);

  const sampledToken = LinTensorEngine.sampleTopP(logits, 0.0); // Greedy sample
  console.log(`   ✅ Token Gerado pelo Transformer LIN: ${sampledToken} (Logit: ${logits[sampledToken].toFixed(4)})\n`);

  // -------------------------------------------------------------
  // PARTE 2: O Loop Cognitivo com Verificação e Trauma
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🧠 [PARTE 2] Executando o Ciclo Cognitivo LIN com Verificação de Efeitos');
  console.log('----------------------------------------------------------------');

  const agent = new LinCognitiveAgent({ maxAttempts: 3 });

  // Tarefa com contrato de pureza (efeito "db.write" proibido)
  const task = {
    id: 'T_PURE_CALC_01',
    specification: 'Implemente uma função pura que multiplica o número por 2 sem efeitos colaterais de I/O ou banco de dados.',
    forbidden_effects: ['db.write', 'globalState']
  };

  const oracle = async (t, cand) => {
    return { passed: cand.candidate_code.includes('* 2') };
  };

  const result = await agent.runCognitiveCycle(task, oracle);

  console.log('----------------------------------------------------------------');
  console.log('📋 RELATÓRIO DO CICLO COGNITIVO:');
  console.log(`   Status: ${result.success ? 'APROVADO' : 'REJEITADO'}`);
  console.log(`   Tentativas Utilizadas: ${result.attempts}`);
  console.log(`   Total de Traumas Aprendidos: ${result.trauma_history.length}`);
  console.log('   Código Final Compilado e Aceito:');
  console.log(`   ${result.final_code}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('❌ ERRO NA DEMONSTRAÇÃO:', err);
});
