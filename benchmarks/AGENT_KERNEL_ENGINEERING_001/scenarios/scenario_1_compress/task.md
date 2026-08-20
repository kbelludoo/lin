# Cenario 1: Otimizacao de Compressao Kernel-Space

## Artefato
Voce recebeu um compressor LZ-style (lin_lz) autorado em LIN @L2w:1.0, projetado para compressao de paginas de 4096 bytes em kernel-space.

## Problema Observado
O perfil de performance mostra que a compressao da pagina mixed_structured esta extremamente lenta: 923.889 ns (924 us) por pagina.

## Sua Tarefa
Reduza o tempo de compressao na pagina mixed_structured mantendo:
1. Paridade de roundtrip (decompress(compress(data)) == data)
2. O formato de saida (tokens, RLE, uncompressed marker)
3. A funcao de descompressao inalterada

## Arquivos
- source.lin -- o codigo-fonte LIN @L2w:1.0 do compressor
- benchmark.mjs -- o runner de benchmark com a implementacao JS correspondente
- profile.json -- o perfil de performance mostrando o problema
- constraints.md -- o que NAO pode ser alterado

## Workflow Esperado
1. Leia todos os arquivos
2. Diagnostico: identifique qual unidade/no do algoritmo e o gargalo
3. Modifique APENAS a unidade necessaria em source.lin
4. Modifique a implementacao JS correspondente em benchmark.mjs (isto representa o output compilado)
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