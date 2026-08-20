# Restricoes -- Cenario 1 (Compressao)

## Variaveis Congeladas (NAO alterar)

1. Formato de saida: O formato de tokens deve permanecer identico:
   - 0xFF + len_hi + len_lo = RLE zero page
   - 0xFE + len_hi + len_lo + raw = uncompressed page
   - ctrl & 0x80 = match token (len = (ctrl & 0x3F) + 4, dist = 2 bytes)
   - !ctrl & 0x80 = literal run (count = (ctrl & 0x7F) + 1, then raw bytes)

2. Funcao de descompressao: A funcao lin_lz_decompress nao pode ser alterada.

3. Tamanho da pagina: 4096 bytes.

4. Tamanho da janela: Pode ser alterado (nao esta congelado).

5. Match minimo: Pode ser alterado (nao esta congelado).

## O Que Pode Ser Alterado

- O algoritmo de match-finding (como matches sao encontrados)
- Estruturas de dados auxiliares (hash tables, etc.)
- A heuristica de early-exit para alta entropia

## Criterio de Aceitacao

- Paridade de roundtrip: 100% em todas as paginas de teste
- Melhoria no tempo de compressao da pagina mixed_structured
- Regressoes reportadas explicitamente