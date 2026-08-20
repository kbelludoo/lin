# AGENT_ENGINEERING_002: Cross-Model Replication Benchmark Report

## 1. Resumo Executivo
O benchmark avaliou 80 ensaios experimentais através de 4 famílias distintas de LLM:
- **Claude 3.5 Sonnet** (Anthropic)
- **GPT-4o** (OpenAI)
- **DeepSeek V3** (DeepSeek)
- **Llama 3.3 70B** (Meta - Open Weights)

## 2. Resultados Consolidados Globais (Médias Cross-Model)

| Pilha Arquitetural | Tokens Totais | Rodadas Reparo | Violações Invariantes | DAG Churn | Tokens Reconstrução | Corretude Cega |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **S1 (Python)** | 10.375 | 12,5 | 8,5 | 0 | 4.075 | 86,7% |
| **S2 (AINL Puro)** | 7.538 | 9,8 | 5,8 | 89,5 | 2.913 | 91,5% |
| **S3 (LIN Puro)** | **5.400** | 2,8 | **0,0** | **0,0** | 1.883 | 98,2% |
| **S4 (LIN + AINL)** | 5.500 | **1,2** | **0,0** | 2,3 | **1.803** | **99,5%** |

## 3. Comportamento por Família de Modelo (Fronteira de Pareto)
- **Invariância de Pareto**: Em **100% dos modelos testados (4 de 4)**, a Fronteira de Pareto é composta estritamente pelo par **{S3_lin, S4_hybrid}**.
- **Modelos Proprietários vs. Open Weights**:
  - Modelos proprietários de topo (Claude 3.5, GPT-4o, DeepSeek V3) atingiram 100% de corretude no S4 com 1 única rodada de reparo.
  - O modelo aberto (Llama 3.3 70B) manteve o mesmo padrão estrutural: no S1 (Python) sofreu 16 rodadas de reparo e 11 violações, enquanto no S4 reduziu para 2 reparos, 0 violações e 98% de corretude.

## 4. Conclusão Científica
A vantagem da composição LIN+AINL **não é um artefato de um modelo específico**. A separação entre unidades semânticas tipadas e orquestração de workflow reduz o custo de engenharia de agentes de forma consistente em todas as principais famílias de LLMs contemporâneas.
