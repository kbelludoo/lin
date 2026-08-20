# Cenario 2: Otimizacao de I/O Scheduler Kernel-Space

## Artefato
Voce recebeu um I/O scheduler (iosched) autorado em LIN @L2w:1.0, projetado para dispatch de requisicoes de block I/O em kernel-space.

## Problema Observado
O perfil de performance mostra que o seek distance medio no workload random e extremamente alto: 370.412 setores por dispatch.

## Sua Tarefa
Reduza o seek distance medio no workload random mantendo:
1. Todas as requisicoes devem ser dispatchadas (paridade)
2. O formato de requisicao (sector, size, prio, id) inalterado
3. A funcao de enqueue inalterada

## Arquivos
- source.lin -- o codigo-fonte LIN @L2w:1.0 do scheduler
- benchmark.mjs -- o runner de benchmark com a implementacao JS correspondente
- profile.json -- o perfil de performance mostrando o problema
- constraints.md -- o que NAO pode ser alterado

## Workflow Esperado
1. Leia todos os arquivos
2. Diagnostico: identifique qual unidade/no do algoritmo e o gargalo
3. Modifique APENAS a unidade necessaria em source.lin
4. Modifique a implementacao JS correspondente em benchmark.mjs
5. Recompile: verifique que source.lin ainda parseia corretamente
6. Execute o benchmark: node benchmark.mjs
7. Compare os resultados com o perfil original
8. Reporte ganhos E regressoes honestamente
9. Aceite ou rejeite a alteracao

## Relatorio Final
Forneça um relatorio estruturado com:
- DIAGNOSIS: qual era o gargalo
- NODE_CHANGED: qual no/unidade foi modificada
- LINES_CHANGED: linhas alteradas em source.lin
- RECOMPILED: verificou que source.lin parseia? (sim/nao)
- BENCHMARK_RUN: executou o benchmark? (sim/nao)
- PARITY: paridade OK? (sim/nao)
- GAIN: metrica e melhoria obtida
- REGRESSIONS: lista de regressoes (se houver)
- VERDICT: aceitar ou rejeitar