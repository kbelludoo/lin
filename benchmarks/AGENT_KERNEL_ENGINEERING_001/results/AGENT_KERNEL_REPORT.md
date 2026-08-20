# AGENT_KERNEL_ENGINEERING_001: Teste de Engenharia Iterativa por Agente

## 1. Resumo Executivo

O benchmark **AGENT_KERNEL_ENGINEERING_001** testa se um agente de IA consegue realizar o ciclo completo de **engenharia iterativa verificável** em artefatos LIN de kernel-space: receber um problema de performance, diagnosticar o gargalo, modificar apenas a unidade semântica correspondente, recompilar, executar benchmark, comparar ganhos e regressões, e aceitar ou rejeitar a alteração.

**Resultado: 1/2 cenários executados com sucesso**

| Cenário | Subsistema | Diagnóstico | Modificou | Ganho | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Compressão | Correto (match-finder O(N*W)) | Sim | 32.1x speedup | **ACEITAR** |
| 2 | I/O Scheduler | — | Não | — | **INCONCLUSIVO** |

## 2. Design Experimental

### Entrada do agente (cenário 1 — Compressão)
- `source.lin`: compressor lin_lz V1 (busca linear O(N*W))
- `benchmark.mjs`: runner com implementação JS correspondente
- `profile.json`: perfil mostrando mixed_structured = 923.889 ns
- `constraints.md`: formato congelado, decompress inalterada
- `task.md`: 'Reduza o tempo de compressão na página mixed_structured'

### Entrada do agente (cenário 2 — I/O Scheduler)
- `source.lin`: iosched V1 (FIFO dispatch)
- `benchmark.mjs`: runner com implementação JS correspondente
- `profile.json`: perfil mostrando random seek = 370.412 setores
- `constraints.md`: formato de request congelado, enqueue inalterada
- `task.md`: 'Reduza o seek distance no workload random'

### Métricas de avaliação
| Métrica | Descrição |
| :--- | :--- |
| diagnosis_correct | O agente identificou o gargalo correto? |
| surgical_precision | Modificou apenas a unidade necessária? |
| recompiled | Verificou que source.lin parseia após modificação? |
| benchmark_run | Executou o benchmark? |
| parity_ok | Paridade de roundtrip mantida? |
| gain_obtained | Melhoria obtida na métrica alvo |
| regressions_reported | Regressões reportadas explicitamente? |
| verdict | ACEITAR ou REJEITAR |

## 3. Resultado do Cenário 1 — Compressão (mixed_structured)

### Diagnóstico do agente

> O compressor utilizava um algoritmo ingênuo de busca linear O(W) (W=256) para cada byte do buffer durante o match-finding. Em páginas semi-estruturadas como mixed_structured, que possuem dados repetitivos suficientes para passar na verificação rápida inicial de entropia mas contêm dados variados ao longo dos 4096 bytes, o algoritmo realizava varreduras lineares completas na janela a cada posição, degradando para complexidade O(N × W). A substituição do match-finder linear por indexação direta via tabela hash para prefixos de 4 bytes reduziu o custo de busca para O(1).

### Modificações realizadas

| Arquivo | Linhas alteradas | Descrição |
| :--- | ---: | :--- |
| source.lin | ~13 | Substituiu busca linear por hash-table + chain no nó !compress_page |
| benchmark.mjs | ~18 | Implementou hash-table O(1)-amortizado correspondente |

### Resultados do benchmark

| Página | Original (ns) | Otimizado (ns) | Speedup | Paridade |
| :--- | ---: | ---: | ---: | :--- |
| zero_filled | 10.260 | 10.260 | 1.0x | OK |
| text_repetitive | 120.087 | 36.499 | **3.3x** | OK |
| random_data | 34.616 | 34.616 | 1.0x | OK |
| mixed_structured | 923.889 | 28.778 | **32.1x** | OK |
| high_entropy | 17.785 | 17.785 | 1.0x | OK |

### Avaliação do cenário 1

| Critério | Resultado |
| :--- | :--- |
| Diagnóstico correto | SIM — identificou o match-finder linear como gargalo |
| Precisão cirúrgica | SIM — modificou apenas !compress_page |
| Recompilou | SIM — LIN parse VALID |
| Executou benchmark | SIM — 5/5 páginas testadas |
| Paridade mantida | SIM — 100% roundtrip |
| Ganho obtido | SIM — 32.1x em mixed_structured, 3.3x em text_repetitive |
| Regressões reportadas | SIM — nenhuma reportada (correto, não houve) |
| **VEREDITO** | **ACEITAR** |

## 4. Resultado do Cenário 2 — I/O Scheduler (random)

### Status

O agente **não modificou nenhum arquivo**. Os arquivos `source.lin` e `benchmark.mjs` permaneceram idênticos aos snapshots originais (delta = 0). O `result.json` não foi atualizado com novos dados de benchmark.

### Avaliação do cenário 2

| Critério | Resultado |
| :--- | :--- |
| Diagnóstico correto | NÃO AVALIADO — sem modificações |
| Precisão cirúrgica | NÃO AVALIADO — sem modificações |
| Recompilou | NÃO — sem modificações |
| Executou benchmark | NÃO — sem modificações |
| Paridade mantida | NÃO AVALIADO |
| Ganho obtido | NÃO — sem modificações |
| Regressões reportadas | NÃO AVALIADO |
| **VEREDITO** | **INCONCLUSIVO** |

## 5. Análise dos Resultados

### O que o cenário 1 demonstra

O agente conseguiu executar o ciclo completo:

```
problema (923.889 ns em mixed_structured)
  ↓
diagnóstico (match-finder linear O(N*W))
  ↓
modificação localizada (!compress_page + hash-table)
  ↓
recompilação (LIN VALID)
  ↓
benchmark (32.1x speedup, paridade OK)
  ↓
aceitação (sem regressões)
```

Isso conecta diretamente a tese central: LIN é uma unidade de trabalho viavel para engenharia iterativa realizada por agentes. O agente não reescreveu o sistema inteiro — modificou a unidade semântica correspondente ao gargalo e mediu a consequência.

### O que o cenário 2 revela

A ausência de modificações no cenário 2 é um resultado legítimo e informativo. Possíveis explicações:

1. **Complexidade da tarefa**: O cenário 2 requer modificar uma função que recebe `queue` como parâmetro e usa `shift()` internamente, mantendo `enqueue` inalterada. A restrição 'não alterar enqueue' mas 'alterar dispatch' pode ter sido ambígua para o agente.
2. **Falta de clareza no diagnóstico**: O agente pode não ter conectado 'seek distance alto' com 'algoritmo de dispatch' de forma suficientemente concreta para produzir uma modificação.
3. **Inércia/aversão a mudança**: O agente pode ter analisado o problema mas decidido não arriscar uma modificação sem maior confiança.

Independentemente da causa, o resultado é informativo: o benchmark mede não apenas performance, mas também a capacidade do agente de navegar e modificar artefatos LIN sob restrições. O cenário 2 expõe uma limitação atual que deve ser endereçada em iterações futuras.

## 6. Comparação com Benchmark Humano (KERNEL_COMPRESS_002)

| Métrica | Agente (Cenário 1) | Humano (COMPRESS_002 V2) |
| :--- | ---: | ---: |
| Diagnóstico | Correto | Correto |
| Nó modificado | !compress_page | !compress_page |
| Algoritmo | hash-table + chain | hash-table + chain |
| Speedup (mixed_structured) | 32.1x | 23.2x |
| Speedup (text_repetitive) | 3.3x | 4.7x |
| Paridade | 100% | 100% |
| Regressões | Nenhuma | random_data/high_entropy piores |

**Observação**: O agente obteve speedup MAIOR (32.1x vs 23.2x) com regressões ZERO, enquanto a implementação humana do V2 teve regressões em alta entropia. Isso sugere que o agente implementou uma versão mais conservadora do hash-table (sem early entropy check otimizado), que evitou as regressões mas também não explorou todo o potencial de speedup em outras páginas.

## 7. Veredito Final

**VEREDITO: PARCIALMENTE BEM-SUCEDIDO**

- **Cenário 1 (Compressão)**: Agente executou o ciclo completo com sucesso. Diagnóstico correto, modificação cirúrgica, recompilação, benchmark, ganho de 32.1x, paridade 100%, sem regressões. **ACEITAR**.
- **Cenário 2 (I/O Scheduler)**: Agente não modificou nenhum arquivo. O benchmark não foi executado. **INCONCLUSIVO**.

### Significado para a tese do LIN

O cenário 1 demonstra que LIN é uma unidade de trabalho viavel para engenharia iterativa realizada por agentes. O agente recebeu apenas o artefato LIN + perfil + restrições, e conseguiu modificar a unidade semântica correta sem reescrever o sistema inteiro.

O cenário 2 expõe uma limitação atual: o agente falhou em completar o ciclo para um subsistema estruturalmente diferente. Isso não invalida a tese — indica que a metodologia precisa de refinamento nas instruções/critérios para cenários com restrições de interface mais complexas.

### Próximo passo

Refinar o cenário 2 com instruções mais explícitas sobre como modificar o dispatch sem alterar enqueue, e re-executar. Alternativamente, adicionar um terceiro cenário com um subsistema diferente (parser, scheduler de processos, networking) para testar a generalização da metodologia.