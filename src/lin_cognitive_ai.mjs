/**
 * lin_cognitive_ai.mjs — Máquina Cognitiva Neuro-Simbólica do LIN
 * 
 * Orquestra o runtime neural, o verificador de invariantes e o ciclo de trauma/recuperação.
 */

import { LinTransformerModel, LinTensorEngine } from './lin_neural_engine.mjs';
import { LinVerifierAdapter } from '../benchmarks/cognitive_ablation/harness/lin_verifier_adapter.mjs';

export class LinCognitiveAgent {
  constructor(options = {}) {
    this.model = new LinTransformerModel(options.modelConfig);
    this.verifier = new LinVerifierAdapter();
    this.traumaMemory = [];
    this.maxAttempts = options.maxAttempts || 3;
    this.neuralGenerator = options.neuralGenerator || null; // Hook para Ollama/Local se disponível
  }

  recordTrauma(trauma) {
    this.traumaMemory.push(trauma);
  }

  // Gera o contexto de pensamento em formato LIN/RULEL
  formatCognitivePrompt(task) {
    let prompt = `@LIN:agent:1.0\n.task{id="${task.id}" spec="${task.specification}"}\n`;
    if (this.traumaMemory.length > 0) {
      prompt += `.trauma_constraints{\n`;
      for (const tr of this.traumaMemory) {
        prompt += `  .forbid{rule="${tr.constraint_rule}" invariant="${tr.invariant_broken}" hint="${tr.remedy_hint}"}\n`;
      }
      prompt += `}\n`;
    }
    return prompt;
  }

  async runCognitiveCycle(task, oracleFn = null) {
    console.log(`\n🧠 [LIN Cognitive Engine] Iniciando resolução da tarefa: ${task.id}`);
    console.log(`   Especificação: "${task.specification}"`);

    for (let k = 1; k <= this.maxAttempts; k++) {
      console.log(`\n▶ [Tentativa ${k}/${this.maxAttempts}]`);

      // 1. Contexto Cognitivo e Formulação de Hipótese Neural
      const contextPrompt = this.formatCognitivePrompt(task);
      let candidateCode = '';

      if (this.neuralGenerator) {
        candidateCode = await this.neuralGenerator(contextPrompt, k, this.traumaMemory);
      } else {
        // Simulação do gerador neural com base na presença de traumas
        if (k === 1) {
          // Tentativa 1: Gera código com mutação proibida (para demonstrar o bloqueio pelo gate)
          candidateCode = `!solve(x){\n  db.write(x);\n  ^x * 2\n}`;
        } else {
          // Tentativa 2: Incorpora a restrição do trauma e produz o código puro
          candidateCode = `!solve(x){\n  ^x * 2\n}`;
        }
      }

      console.log(`   Candidato Gerado:\n   ${candidateCode.replace(/\n/g, '\n   ')}`);

      // 2. Verificação de Invariantes e Efeitos no LIN Gate
      const verifierRes = await this.verifier.verify(task, { candidate_code: candidateCode }, k);

      if (!verifierRes.passed) {
        console.log(`   ❌ [LIN Gate REJEITOU]: Violação de Invariante (${verifierRes.stage} / ${verifierRes.violation_class})`);
        console.log(`   ⚠️ [Trauma Registrado]: Regra "${verifierRes.constraint_rule}" -> ${verifierRes.remedy_hint}`);

        this.recordTrauma({
          attempt: k,
          stage: verifierRes.stage,
          violation_class: verifierRes.violation_class,
          constraint_rule: verifierRes.constraint_rule,
          invariant_broken: verifierRes.invariant_broken,
          remedy_hint: verifierRes.remedy_hint
        });
        continue;
      }

      console.log(`   ✅ [LIN Gate APROVOU]: Candidato respeita todas as regras e pureza de efeitos.`);

      // 3. Validação pelo Oráculo
      if (oracleFn) {
        const oracleRes = await oracleFn(task, { candidate_code: candidateCode });
        if (!oracleRes.passed) {
          console.log(`   ❌ [Oráculo Rejeitou]: ${oracleRes.hint}`);
          continue;
        }
      }

      console.log(`\n🎉 [CONVERGÊNCIA COGNITIVA ALCANÇADA] na tentativa ${k}!`);
      return {
        success: true,
        attempts: k,
        final_code: candidateCode,
        trauma_history: this.traumaMemory
      };
    }

    return {
      success: false,
      attempts: this.maxAttempts,
      trauma_history: this.traumaMemory
    };
  }
}
