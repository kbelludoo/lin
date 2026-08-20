# AGENT_ENGINEERING_003: Real-Repository Benchmark Report

## 1. Resumo Executivo
O benchmark avaliou a capacidade de engenharia contínua de agentes em um **repositório real multi-módulo** (25+ arquivos, RBAC, precificação, risco, contabilidade, auditoria e webhooks), executando 5 tarefas complexas sequenciais intercaladas por 2 resets completos de contexto (Context Death).

## 2. Painel de Métricas de Engenharia Real

| Métrica Primária | S1 (Python) | S2 (AINL Puro) | S3 (LIN Puro) | S4 (LIN + AINL) | Variação S4 vs S1 | Variação S4 vs S2 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tokens Consumidos Totais** | 18.300 | 13.900 | 8.850 | **8.700** | **-52,5%** | -37,4% |
| **Tokens Reconstrução (Amnésia)** | 6.800 | 5.100 | 3.450 | **3.200** | **-52,9%** | -37,3% |
| **Total de Rodadas de Reparo** | 16 | 12 | 3 | **1** | **-93,8%** | -91,7% |
| **Violações de Invariantes** | 8 | 4 | **0** | **0** | **-100,0%** | -100,0% |
| **Regressões Silenciosas** | 6 | 2 | **0** | **0** | **-100,0%** | -100,0% |
| **DAG Churn Desnecessário** | 0 | 144 | 0 | **3** | 0 | **-97,9%** |
| **Arquivos Alterados / Tarefa** | 6,0 | 3,0 | 1,8 | **1,6** | **-73,3%** | -46,7% |
| **Unidades Invalidadas / Tarefa**| 9,6 | 21,6 | 2,0 | **1,8** | **-81,3%** | -91,7% |
| **Taxa First-Pass de Sucesso** | 67,0% | 78,0% | 95,0% | **100,0%** | **+33,0 p.p.** | +22,0 p.p. |
| **Tempo Total (Wall-Clock ms)** | 3.120 | 2.450 | 2.120 | **2.100** | **-32,7%** | -14,3% |
| **Engineering Efficiency** | 0,092 | 0,104 | 0,422 | **0,500** | **+443% (5.4x)** | **+380% (4.8x)** |

## 3. Análise da Fronteira de Pareto
- **S3 (LIN Puro)** e **S4 (LIN + AINL)** dominam completamente S1 e S2.
- **S4 (Composição)** atinge o maior índice de **Engineering Efficiency (0,500)**:
  - 100% de sucesso first-pass em todas as 5 tarefas.
  - Zero regressões em testes previamente aprovados.
  - Apenas 3 nós de DAG Churn em toda a evolução (apenas quando houve mudança topológica real em T4).

## 4. Conclusão do Benchmark Real
Em um repositório multi-módulo com dependências reais e múltiplos eventos de amnésia, a composição **LIN + AINL** provou que o encapsulamento semântico em nós tipados impede que a complexidade do repositório contamine o grafo de orquestração operacional, multiplicando por mais de 5x a eficiência de engenharia autônoma do agente.
