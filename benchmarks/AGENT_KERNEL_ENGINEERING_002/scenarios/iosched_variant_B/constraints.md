# Restricoes -- Cenario 2 (I/O Scheduler)

## Variaveis Congeladas (NAO alterar)

1. Formato de requisicao: {sector, size, prio, id} -- nao pode ser alterado

2. Funcao de enqueue: A funcao iosched_v1_enqueue nao pode ser alterada.

3. Funcao de verificacao: verifyAllDispatched nao pode ser alterada.

4. Workloads: Os dados de teste (gerados com seed=12345) nao podem ser alterados.

## O Que Pode Ser Alterado

- O algoritmo de dispatch (como requisicoes sao selecionadas da fila)
- Estruturas de dados auxiliares (estado do scheduler, etc.)
- A ordem de dispatch (desde que todas as requisicoes sejam dispatchadas)

## Criterio de Aceitacao

- Paridade: todas as requisicoes devem ser dispatchadas (100%)
- Melhoria no seek distance medio no workload random
- Regressoes reportadas explicitamente