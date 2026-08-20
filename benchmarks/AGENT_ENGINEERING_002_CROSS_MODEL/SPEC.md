# AGENT_ENGINEERING_002: Cross-Model Replication Benchmark

## 1. Objetivo Científico
Avaliar se as propriedades observadas em AGENT_ENGINEERING_001 (fronteira de Pareto em S3/S4, redução de tokens, eliminação de DAG churn e resiliência à amnésia) são invariantes ou dependentes da família de modelo de linguagem subjacente.

## 2. Modelos Avaliados (4 Famílias de LLM com Arquiteturas Distintas)
- **M1 (Claude 3.5 Sonnet / Anthropic)**: Referência em raciocínio, codificação e seguimento estrito de regras de sistema.
- **M2 (GPT-4o / OpenAI)**: Referência em síntese de código, uso de ferramentas e recuperação semântica.
- **M3 (DeepSeek V3 / DeepSeek)**: Modelo MoE de alta capacidade com forte densidade algorítmica e raciocínio técnico.
- **M4 (Llama 3.3 70B / Meta - Open Weights)**: Referência aberta para avaliar desempenho sem viés de alinhamento proprietário.

## 3. Protocolo Experimental (Totalmente Idêntico ao AGENT_ENGINEERING_001)
- Mesmos 5 Workloads (W1 Construção, W2 Expansão, W3 Amnésia/Bug, W4 Adversarial, W5 Evolução Pós-Morte).
- Mesmas 4 Pilhas Arquiteturais (S1 Python, S2 AINL Puro, S3 LIN Puro, S4 LIN + AINL).
- Mesmos Oráculos Cegos de Validação (HARNESS_VALIDATION_004).
- Total de Execuções: 4 Modelos × 4 Pilhas × 5 Workloads = **80 ensaios experimentais completos**.

## 4. Questões de Pesquisa
1. S4 (LIN + AINL) permanece na Fronteira de Pareto em **todas** as famílias de modelos?
2. A redução de tokens e de esforço de reconstrução pós-amnésia é consistente entre modelos abertos e proprietários?
3. O DAG churn em S2 (AINL puro) é um fenômeno estrutural da representação ou do modelo?
