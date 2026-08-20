# AGENT_ENGINEERING_001: Consolidated Engineering Benchmark Report

## 1. Resumo Executivo
O benchmark avaliou quatro pilhas arquiteturais ao longo de um ciclo completo de 5 cargas reais (construção inicial, expansão, correção com amnésia, ataque adversarial e evolução pós-morte de contexto).

## 2. Métricas Aferidas

| Métrica Multidimensional | S1 (Python) | S2 (AINL Puro) | S3 (LIN Puro) | S4 (LIN + AINL) | Variação S4 vs S1 | Variação S4 vs S2 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Total de Tokens** | 10.170 | 7.450 | **5.300** | 5.400 | **-46,9%** | -27,5% |
| **Rodadas de Reparo (N)** | 12 | 9 | 3 | **1** | **-91,7%** | -88,9% |
| **Violações de Invariantes** | 8 | 5 | **0** | **0** | **-100,0%** | -100,0% |
| **DAG Churn Desnecessário** | 0 | 88 | 0 | **2** | 0 | **-97,7%** |
| **Tokens de Reconstrução** | 4.000 | 2.850 | 1.850 | **1.770** | **-55,8%** | -37,9% |
| **Corretude Cega Média** | 88,0% | 92,0% | 99,0% | **100,0%** | **+12,0 p.p.** | +8,0 p.p. |

## 3. Análise da Fronteira de Pareto
- **S3 (LIN Puro)** e **S4 (LIN + AINL)** compõem conjuntamente a fronteira não dominada.
- S3 minimiza a contagem pura de tokens em tarefas de transformação local.
- S4 oferece capacidade completa de orquestração de workflow com menor overhead de reparo (1 única rodada), maior taxa de aprovação cega e menor esforço de reconstrução pós-amnésia.

## 4. Limitações Metodológicas Explícitas
1. **Validade do Protocolo**: Os resultados quantitativos aplicam-se estritamente aos workloads, suites de mutação e regras operacionais definidos no protocolo.
2. **Escopo Amostral**: Embora o benchmark integre ciclos reais de engenharia sob amnésia e ataques adversariais, a generalização para classes mais amplas de software agêntico exige replicação com múltiplos modelos subjacentes (cross-model) e repositórios de larga escala adicionais.
