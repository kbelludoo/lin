# AGENT_KERNEL_ENGINEERING_002: Isolamento da Causa da Falha do Cenario 2

**Data**: 2026-08-20
**Benchmark**: AGENT_KERNEL_ENGINEERING_002
**Hipotese testada**: A falha do cenario 2 no AGENT_001 e um problema de agencia/descoberta do agente, nao um problema do modelo semantico LIN.

---

## 1. Resultado das Variantes

| Variante | Prompt Explicitness | Modificou? | Benchmark? | random seek | Reducao | Veredito |
| :--- | :---: | :---: | :---: | ---: | ---: | :--- |
| A | Minima | Nao | Nao | 370.411,7 | 0% | **FALHOU** |
| B | Media (diagnostico) | Sim | Sim | 3.881,1 | **95,4%** | **PASSOU** |
| C | Completa (no semantico) | Sim | Sim | 3.881,1 | **95,4%** | **PASSOU** |

---

## 2. Analise das Modificacoes

### Variante B (diagnostico explicito)
- **No modificado**: !dispatch_batch (e remocao de !dispatch_next FIFO)
- **Linhas alteradas**: 10 em source.lin, 1 em benchmark.mjs
- **Abordagem**: Reestruturou o workflow substituindo o dispatch FIFO por Elevator/SCAN completo
- **Diagnostico**: Correto — identificou FIFO como gargalo

### Variante C (localizacao semantica)
- **No modificado**: !dispatch_next
- **Linhas alteradas**: 2 em source.lin, 1 em benchmark.mjs
- **Abordagem**: Adicionou ordenacao por setor dentro do no existente
- **Diagnostico**: Correto — identificou FIFO como gargalo

### Comparacao B vs C
Ambas chegaram ao mesmo resultado de performance (3.881,1 setores), mas com abordagens diferentes:
- **B** fez uma modificacao mais estrutural (reestruturou o workflow)
- **C** fez uma modificacao mais cirurgica (modificou apenas o no apontado)

Ambas mantiveram 100% de paridade e nao reportaram regressoes.

---

## 3. Interpretacao dos Resultados

### Padrao observado: A falha, B e C passam

Este e o padrao que a hipotese **"problema de agencia/descoberta"** prediz.

| Hipotese | Padrao esperado | Resultado |
| :--- | :--- | :--- |
| Problema de agencia/descoberta | A falha, B e C passam | ✅ **CONFIRMADO** |
| Problema do modelo semantico LIN | A, B e C falham | ❌ Refutado |
| Baseline suficiente | A passa | ❌ Refutado |

### Conclusao: O gargalo e agencia/descoberta, nao semantica LIN

O LIN modelou corretamente o conceito de "dispatch policy" como unidade substituivel (!dispatch_next / !dispatch_batch). O agente:

1. **Com prompt livre (A)**: Nao conseguiu mapear "seek distance alto" para "politica de dispatch FIFO"
2. **Com diagnostico explicito (B)**: Conseguiu, mas precisou de reestruturacao maior
3. **Com localizacao semantica (C)**: Conseguiu com modificacao minima (2 linhas)

Isso demonstra que:
- O modelo semantico do LIN **representa adequadamente** o conceito de scheduling
- A limitacao esta na **capacidade do agente de descobrir** a unidade correta sem orientacao explicita

---

## 4. Comparacao com AGENT_001

| Cenario | AGENT_001 | AGENT_002 Variante A |
| :--- | :---: | :---: |
| Subsistema | Compressao | I/O Scheduler |
| Prompt | Padrao (com perfil) | Livre |
| Resultado | ✅ 32,1x speedup | ❌ Sem modificacoes |
| Causa | Unidade clara no codigo | Unidade nao evidente |

A diferenca entre cenario 1 e cenario 2 na AGENT_001 nao era "compressao e mais facil que scheduling". Era que no cenario 1, a unidade (!compress_page) era mais evidente no codigo, enquanto no cenario 2, a unidade (!dispatch_next) estava implicita em um workflow maior.

---

## 5. Implicacoes para o LIN

### O que este resultado prova

1. **LIN e uma unidade de trabalho viavel para agentes** — confirmado pelo sucesso de B e C
2. **A descoberta de unidades semanticas e um problema de agencia, nao de linguagem** — confirmado pelo padrao A=falha, B/C=sucesso
3. **A granularidade do LIN ajuda quando apontada** — Variante C modificou apenas 2 linhas porque o no exato foi fornecido

### O que este resultado NAO prova

1. Que agentes conseguem descobrir unidades semanticas automaticamente em qualquer subsistema
2. Que o LIN e superior a outras representacoes para descoberta automatica
3. Que a metodologia generaliza para tarefas sem unidade semantica clara

---

## 6. Veredito Final

**VEREDITO: A HIPOTESE DE AGENCIA/DESCOBERTA FOI CONFIRMADA**

A falha do cenario 2 no AGENT_001 **nao e um problema do LIN**. E um problema da capacidade do agente de mapear requisitos de performance para unidades semanticas especificas quando essas unidades nao sao evidentes no codigo.

Quando a unidade semantica e apontada explicitamente (variante C) ou quando o diagnostico e fornecido (variante B), o agente executa o ciclo completo com sucesso e obtem **95,4% de reducao no seek distance** com modificacoes cirurgicas.

### Significado para a tese do LIN

> **LIN e uma boa unidade de trabalho para engenharia iterativa realizada por agentes — mas a eficacia depende da clareza com que a tarefa mapeia para as unidades semanticas do sistema.**

Esta e uma afirmacao muito mais precisa e testavel do que "LIN e bom para agentes". Ela gera predicoes falseaveis:

1. Se uma tarefa mapeia claramente para uma unidade LIN, agentes conseguem otimiza-la
2. Se uma tarefa nao mapeia claramente, agentes falham — e isso e uma limitacao de descoberta, nao da linguagem
3. Se fornecemos a localizacao semantica, agentes conseguem fazer modificacoes minimas

---

## 7. Proximos Passos

1. **AGENT_003**: Testar tarefa onde a unidade semantica NAO existe no modelo LIN atual — isso forçaria evolucao do modelo
2. **Estudo de descoberta**: Medir quantas iteracoes um agente precisa para encontrar a unidade correta sem orientacao
3. **Comparacao cross-modelo**: Testar se outras representacoes (AST, CFG) tem o mesmo problema de descoberta

---

## 8. Artefatos Produzidos

- spec/AGENT_KERNEL_ENGINEERING_002.rulel — especificacao formal
- benchmarks/AGENT_KERNEL_ENGINEERING_002/scenarios/iosched_variant_{A,B,C}/ — tres cenarios identicos com prompts diferentes
- benchmarks/AGENT_KERNEL_ENGINEERING_002/harness/evaluate.mjs — harness de avaliacao
- benchmarks/AGENT_KERNEL_ENGINEERING_002/results/evaluation.json — dados brutos
- benchmarks/AGENT_KERNEL_ENGINEERING_002/results/AGENT_KERNEL_002_REPORT.md — este relatorio

---

**Conclusao**: O resultado mais importante deste benchmark nao e que "agentes conseguem otimizar I/O schedulers". E que conseguimos **isolar onde esta o gargalo**: na descoberta, nao na linguagem. Isso e cientificamente muito mais valioso do que outro A na tabela.
