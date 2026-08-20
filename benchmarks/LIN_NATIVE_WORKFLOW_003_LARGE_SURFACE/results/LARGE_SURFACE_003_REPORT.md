# LIN_NATIVE_WORKFLOW_003: Real Large Surface Benchmark Report

## 1. Resumo Executivo
O benchmark avaliou a compilação, a fidelidade de conversão para Unified IR, a preservação de invariantes e o isolamento de hash hierárquico da superfície pública **`@LIN:L2w:1.0`** sobre um **corpus de 1.240 módulos** distribuídos em 10 domínios representativos, submetidos a **1.000 mutações contínuas**.

## 2. Métricas de Escala no Corpus (1.240 Módulos)
- **Taxa de Compilação de Superfície -> IR**: **100% (1.240 / 1.240)**
- **Total de Nós IR de Workflow Construídos**: 4.960 nós
- **Total de Arestas de Dependência Construídas**: 3.720 arestas
- **Densidade Média Observada**: **~132 tokens / módulo** neste corpus e protocolo (incluindo contratos, tipos, corpo e workflow completo).
- **Desempenho do Parser no Ambiente de Teste**: **0,09 ms por módulo** (~111 ms no corpus total de 1.240 módulos).

## 3. Dinâmica de Invalidação em 1.000 Mutações
- **Mutações Puramente Semânticas ($N = 750$)**:
  - **100% (750/750)** alteraram o hash do nó (`H_node`) e o hash do workflow.
  - **100% (750/750)** preservaram a invariância total do hash de arestas (`H_edges`), resultando em **0 casos de over-invalidation**.
- **Mutações Topológicas ($N = 250$)**:
  - **100% (250/250)** elevaram a mutação para o hash de arestas (`H_edges`), com **0 casos de under-invalidation**.
- **Regressões de Invariantes**: **0 regressões observadas**.

## 4. Conclusão Científica
Nos protocolos avaliados, a superfície pública **`@LIN:L2w:1.0`** permitiu expressar lógica, contratos, efeitos e topologia em uma única representação, mantendo a distinção entre mudanças semânticas e topológicas e viabilizando compilação e invalidação incremental em escala no corpus testado.
