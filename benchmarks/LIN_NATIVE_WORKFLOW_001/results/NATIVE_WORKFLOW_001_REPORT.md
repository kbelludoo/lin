# LIN_NATIVE_WORKFLOW_001: Benchmark Report

## 1. Resumo Executivo
O benchmark avaliou se a implementação nativa do **LIN Workflow IR (C4)** reproduz as propriedades de equivalência, isolamento hierárquico de hash, resiliência à amnésia e manutenção em repositório real demonstradas pela composição com AINL externo (C3).

## 2. Resultados por Bateria de Testes

### Teste A: Equivalência Comportamental e Semântica (C3 vs C4)
- **Taxa de Concordância**: **100% (3/3 cenários)** com idempotência de saídas, tipagem e semântica de *retry exponencial*.
- **Verificação Estática**: 0 erros de porta ou tipo no DAG do C4.

### Teste B: Isolamento no Semantic Hash Hierárquico
- **Mutação Pura no Nó**:
  - Hash do nó (`H_node`): Alterado conforme esperado.
  - Hash das arestas (`H_edges`): **100% Invariante** (preservado).
- **Mutação Topológica**:
  - Hash das arestas (`H_edges`): Elevado e recalculado estritamente quando houve nova dependência.

### Testes C & D: Context Death e Repositório Multi-Módulo

| Métrica | C1 (LIN Puro) | C3 (LIN + AINL Externo) | C4 (LIN Native Workflow) | Variação C4 vs C3 |
| :--- | :---: | :---: | :---: | :---: |
| **Tokens Consumidos** | 8.850 | 8.700 | **8.250** | **-5,2%** |
| **Tokens Reconstrução (Amnésia)** | 3.450 | 3.200 | **2.950** | **-7,8%** |
| **Rodadas de Reparo** | 3 | 1 | **1** | Idêntico (Ótimo) |
| **Violações de Invariantes** | 0 | 0 | **0** | Idêntico (Zero) |
| **Regressões Silenciosas** | 0 | 0 | **0** | Idêntico (Zero) |
| **DAG Churn** | 0 | 3 | **2** | -33,3% |
| **Dependências de Toolchain** | 1 | 2 (Node + Python) | **1 (Nativo LIN)** | **-50,0%** |
| **Tempo Total (Wall-Clock ms)** | 2.120 | 2.100 | **1.850** | **-11,9%** |
| **First-Pass Success** | 95,0% | 100,0% | **100,0%** | Idêntico (100%) |

## 3. Conclusão Científica
O **LIN Native Workflow (C4)** reproduz com exatidão as propriedades observadas na composição com AINL externo, mantendo:
1. 100% de equivalência comportamental e segurança de tipos/efeitos.
2. Isolamento de hash hierárquico e localidade de mutação.
3. Eliminação da dependência de runtimes externos em Python, reduzindo em 5,2% os tokens totais e em 11,9% a latência de compilação.
