# AGENT_ENGINEERING_001: End-to-End Autonomous Agent Engineering Benchmark

## 1. Visão Geral
Mede o custo multidimensional e a resiliência de engenharia de agentes autônomos sob ciclos consecutivos de evolução, mutação e perda total de contexto (Context Death).

## 2. Pilhas Arquiteturais Avaliadas
- **S1 (Convencional)**: LLM -> Python (prompts + scripts imperativos dinâmicos)
- **S2 (Grafo Operacional)**: LLM -> AINL Puro (prompts + DAG operacional)
- **S3 (Linguagem Semântica)**: LLM -> LIN Puro (prompts + tipos refinados e efeitos)
- **S4 (Arquitetura Composta)**: LLM -> LIN + AINL (contratos/invariantes LIN em nós + DAG AINL)

## 3. Dimensões de Carga (Workloads)
- **W1 (Construção Inicial)**: Sistema completo de checkout, autenticação, saldo, regras e auditoria.
- **W2 (Expansão de Funcionalidade)**: Adição de descontos dinâmicos, novas taxas e limites.
- **W3 (Correção de Bug com Amnésia)**: Reset total do histórico do chat. Novo agente recebe apenas arquivos no workspace.
- **W4 (Ataque Adversarial / Invariantes)**: Tentativa de forçar saldo negativo ou quebra de sandbox de efeitos.
- **W5 (Evolução Pós-Morte de Contexto)**: Adição de retry exponencial e nova política contábil sem regressões.

## 4. Métricas Coletadas Independentemente (Sem Pesos A Priori)
1. `tokens_consumed`: Total de tokens de entrada e saída gastos pelo agente.
2. `repair_rounds`: Quantidade de turnos até o sistema passar 100% nos testes de oráculo.
3. `invariant_violations`: Violações de contratos estáticos ou regras fundamentais de segurança.
4. `dag_churn`: Total de nós/arestas modificados desnecessariamente no fluxo operacional.
5. `reconstruction_tokens`: Tokens gastos pelo novo agente após a amnésia para entender o sistema.
6. `latency_ms`: Tempo de compilação e validação do pipeline.
7. `correctness_rate`: Taxa de aprovação em asserções oraculares cegas.

## 5. Análise e Saídas
- Ranking individual por métrica
- Identificação da Fronteira de Pareto (dominância sem trade-offs artificiais)
- Análise de sensibilidade por perfil de carga
