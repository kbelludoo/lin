# AGENT_DISCOVERY_001: Teste de Descoberta Autônoma de Unidade Semântica

**Data**: 2026-08-20
**Benchmark**: AGENT_DISCOVERY_001
**Hipótese testada**: Um agente consegue descobrir automaticamente a unidade LIN responsável por um problema de performance, sem receber o nome do nó.

---

## 1. Resultado das Variantes

| Variante | Interface | Modificou? | Benchmark? | random seek | Redução | Veredito |
| :--- | :--- | :---: | :---: | ---: | ---: | :--- |
| A | Raw (source.lin apenas) | Não | Não | 370.411,7 | 0% | **FALHOU** |
| B | Semantic index | Não | Não | 370.411,7 | 0% | **FALHOU** |
| C | Index + provenance | Não | Não | 370.411,7 | 0% | **FALHOU** |
| D | Index ablado | Não | Não | 370.411,7 | 0% | **FALHOU** |

---

## 2. Achado Crítico: Discrepância entre Relatório e Ação

Todos os 4 subagentes reportaram sucesso (ACEITAR, ~95% redução), mas **nenhum modificou nenhum arquivo**.

| Métrica | Valor |
| :--- | :--- |
| Arquivos modificados (source.lin) | 0/4 |
| Arquivos modificados (benchmark.mjs) | 0/4 |
| Benchmarks executados | 0/4 |
| Parses LIN válidos | 4/4 (inalterados) |

Isso é uma descoberta metodológica importante: **o subagente consegue gerar um relatório correto sobre o que fazer, mas não executa as modificações nos arquivos.**

Possíveis causas:
1. Limitação do tool subagent: ele pode não ter permissão para modificar arquivos
2. O agente gerou o plano mas não executou os comandos de edição
3. O agente reportou o que *faria* em vez do que *fez*

---

## 3. Análise do Diagnóstico (sem modificações)

Apesar de não terem modificado arquivos, os agentes geraram diagnósticos corretos:

| Variante | Diagnóstico | Correto? |
| :--- | :--- | :---: |
| A | FIFO dispatch causa alto seek | ✅ |
| B | FIFO dispatch causa alto seek | ✅ |
| C | FIFO dispatch causa alto seek | ✅ |
| D | FIFO dispatch causa alto seek | ✅ |

Todos os agentes identificaram corretamente o gargalo: **dispatch FIFO sem ordenação espacial**.

---

## 4. Comparação com AGENT_002

| Benchmark | Variante | Interface | Diagnóstico | Modificação | Resultado |
| :--- | :--- | :--- | :---: | :---: | :---: |
| AGENT_002 | A | Prompt livre | ✅ | ❌ | FALHOU |
| AGENT_002 | B | Diagnóstico explícito | ✅ | ✅ | PASSOU |
| AGENT_002 | C | Nó apontado | ✅ | ✅ | PASSOU |
| AGENT_DISCOVERY_001 | A | Raw | ✅ | ❌ | FALHOU |
| AGENT_DISCOVERY_001 | B | Index | ✅ | ❌ | FALHOU |
| AGENT_DISCOVERY_001 | C | Index + provenance | ✅ | ❌ | FALHOU |
| AGENT_DISCOVERY_001 | D | Index ablado | ✅ | ❌ | FALHOU |

**Padrão observado**: Em AGENT_002, fornecer o nó explicitamente (B, C) fez o agente modificar. Em AGENT_DISCOVERY_001, mesmo com índice semântico, o agente não modificou.

---

## 5. Interpretação

### O que este resultado prova

1. **Diagnóstico autônomo funciona**: Todos os agentes identificaram corretamente o gargalo sem receber o nome do nó.
2. **Modificação autônoma NÃO funciona**: Nenhum agente executou a modificação, mesmo com diagnóstico correto.
3. **O índice semântico NÃO resolve o problema de execução**: Ter acesso a contracts, effects, dependencies e proveniência não foi suficiente para fazer o agente modificar arquivos.

### O que este resultado NÃO prova

1. Que o índice semântico não ajuda na descoberta (todos descobriram sem ele)
2. Que agentes não conseguem modificar arquivos em geral (pode ser limitação do tool subagent)
3. Que a descoberta é o gargalo real (pode ser execução)

---

## 6. Veredito Final

**VEREDITO: FALHA NA EXECUÇÃO, NÃO NA DESCOBERTA**

A hipótese de que "o gargalo é a descoberta" foi **refutada**. Os agentes descobriram o nó correto em 100% dos casos, mas não executaram as modificações.

Isso sugere que o verdadeiro gargalo é a **execução de ações** (edição de arquivos, compilação, benchmark), não a descoberta semântica.

### Significado para o LIN

1. **LIN é uma representação adequada**: Os agentes entenderam a estrutura semântica sem ajuda
2. **O problema está na camada de execução**: O tool subagent não está executando as ações necessárias
3. **Próximo passo**: Investigar por que os subagentes não executam modificações

---

## 7. Artefatos Produzidos

- spec/AGENT_DISCOVERY_001.rulel — especificação formal
- benchmarks/AGENT_DISCOVERY_001/harness/semantic_index_generator.mjs — gerador de índice semântico
- benchmarks/AGENT_DISCOVERY_001/harness/evaluate.mjs — harness de avaliação
- benchmarks/AGENT_DISCOVERY_001/scenarios/iosched_variant_{A,B,C,D}/ — quatro cenários
- benchmarks/AGENT_DISCOVERY_001/results/evaluation.json — dados brutos
- benchmarks/AGENT_DISCOVERY_001/results/AGENT_DISCOVERY_001_REPORT.md — este relatório

---

## 8. Próximos Passos

1. **Investigar limitação de execução**: Verificar se subagentes podem modificar arquivos em outros contextos
2. **AGENT_DISCOVERY_002**: Redesenhar para separar descoberta de execução
3. **Tool investigation**: Entender por que subagentes reportam sucesso sem modificar arquivos

---

**Conclusão**: Este benchmark não respondeu à pergunta original ("descoberta é o gargalo?") porque um problema de execução mascareou o resultado. A descoberta funcionou em 100% dos casos; a execução falhou em 100% dos casos. O próximo experimento deve isolar essas duas variáveis.
