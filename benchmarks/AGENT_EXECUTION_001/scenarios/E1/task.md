# Tarefa: Edição do I/O Scheduler (E1)

## Contexto

Você está trabalhando em um subsistema de I/O scheduler de kernel-space implementado em LIN.

## Tarefa

Substitua FIFO por Elevator no nó `!dispatch_next`.

**Instrução específica**: Adicione `queue.sort((a, b) => a.sector - b.sector)` antes de `$req = queue[0]` no nó `!dispatch_next`.

## Capacidade

Você PODE editar arquivos (`source.lin` e `benchmark.mjs`), mas NÃO pode executar comandos. Apenas faça as modificações solicitadas.

## Restrições

- Leia `constraints.md` para ver o que NÃO pode ser alterado.
- Não procure ou leia arquivos em outros benchmarks.
- Apenas edite os arquivos. Não execute `node`, `make`, ou qualquer comando.

## Relatório Final Obrigatório

DIAGNOSIS: [descrição]
NODE_CHANGED: [!dispatch_next]
LINES_CHANGED_SOURCE: [2]
LINES_CHANGED_BENCH: [1]
RECOMPILED: [não aplicável — não executou comandos]
BENCHMARK_RUN: [não aplicável — não executou comandos]
PARITY: [não aplicável — não executou comandos]
GAIN: [não aplicável — não executou comandos]
REGRESSIONS: [não aplicável — não executou comandos]
VERDICT: [ACEITAR se editou corretamente, REJEITAR se não editou]