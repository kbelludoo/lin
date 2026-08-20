# LIN_KERNEL_COMPRESS_001: Benchmark de Compressao Kernel-Space

## 1. Resumo Executivo

O benchmark **LIN_KERNEL_COMPRESS_001** compara o compressor **lin_lz** (autorado em LIN @L2w:1.0, emitido para C) contra compressores nativos do kernel (**LZ4** e **Deflate/zlib** como proxy de Zstd) em **paginas identicas de 4096 bytes**, usando um framework no estilo **scomp**.

**Veredito: B -- lin_lz SOBREVIVEU PARCIALMENTE**

Paridade de roundtrip 100% em todas as paginas. Razao de compressao nao e competitiva com LZ4 em dados estruturados/repetitivos, mas lin_lz demonstra vantagens especificas em paginas de zeros (RLE) e alta entropia (fast-path de descompressao).

## 2. Resultados Detalhados por Tipo de Pagina

### Pagina: zero_filled (4096 bytes)

| Compressor | Comp ns/page | Decomp ns/page | Razao | Throughput | Paridade |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **lin_lz** | 7.940 | 2.484 | **1365,33x** | 0,516 GB/s | OK |
| LZ4 (native) | 4.036 | 3.310 | 157,54x | 1,015 GB/s | OK |
| Deflate (zlib) | 31.683 | 13.975 | 204,80x | 0,129 GB/s | OK |

**lin_lz vence em razao** (1365x vs 157x) devido ao RLE dedicado para paginas de zeros -- comum em kernel-space.

### Pagina: text_repetitive (4096 bytes)

| Compressor | Comp ns/page | Decomp ns/page | Razao | Throughput | Paridade |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **lin_lz** | 101.252 | 24.665 | 17,00x | 0,040 GB/s | OK |
| LZ4 (native) | 2.047 | 1.669 | 57,69x | 2,001 GB/s | OK |
| Deflate (zlib) | 28.545 | 10.751 | 56,89x | 0,143 GB/s | OK |

**LZ4 domina** em dados repetitivos: janela maior, hash tables para match-finding O(1). lin_lz usa busca O(N*W) sem hash.

### Pagina: random_data (4096 bytes)

| Compressor | Comp ns/page | Decomp ns/page | Razao | Throughput | Paridade |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **lin_lz** | 30.938 | **531** | 1,00x | 0,132 GB/s | OK |
| LZ4 (native) | 5.704 | 3.400 | 1,00x | 0,718 GB/s | OK |
| Deflate (zlib) | 91.588 | 8.586 | 1,00x | 0,045 GB/s | OK |

**lin_lz vence em descompressao** (531 ns vs 3400 ns) -- o early-exit detecta alta entropia e armazena sem compressao, tornando a descompressao um memcpy.

### Pagina: mixed_structured (4096 bytes)

| Compressor | Comp ns/page | Decomp ns/page | Razao | Throughput | Paridade |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **lin_lz** | 929.041 | 22.511 | 2,86x | 0,004 GB/s | OK |
| LZ4 (native) | 2.796 | 2.859 | 3,12x | 1,465 GB/s | OK |
| Deflate (zlib) | 74.031 | 11.095 | 2,99x | 0,055 GB/s | OK |

**Pior caso do lin_lz**: a busca O(N*W) e 332x mais lenta que LZ4. Razao proxima (2,86x vs 3,12x).

### Pagina: high_entropy (4096 bytes)

| Compressor | Comp ns/page | Decomp ns/page | Razao | Throughput | Paridade |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **lin_lz** | 16.731 | **81** | 1,00x | 0,245 GB/s | OK |
| LZ4 (native) | 2.752 | 1.326 | 1,00x | 1,489 GB/s | OK |
| Deflate (zlib) | 65.716 | 15.295 | 1,00x | 0,062 GB/s | OK |

**lin_lz vence em descompressao** (81 ns vs 1326 ns -- 16x mais rapido) -- high-entropy fast-path.

## 3. Tabela Resumo (Media Aritmetica)

| Compressor | Comp ns/page | Decomp ns/page | Razao media | Paridade |
| :--- | ---: | ---: | ---: | :---: |
| **lin_lz (LIN -> C)** | 217.180 | 10.054 | 277,44x | OK |
| LZ4 (native) | 3.467 | 2.513 | 44,07x | OK |
| Deflate (zlib) | 58.313 | 11.940 | 53,34x | OK |

## 4. Analise Honesta dos Resultados

### Onde lin_lz VENCE os compressores nativos
1. **Razao em paginas de zeros**: 1365x vs 157x (LZ4) -- o RLE dedicado e superior para o padrao mais comum em kernel-space (paginas vazias/anuladas)
2. **Descompressao em alta entropia**: 81 ns vs 1326 ns (LZ4) -- 16x mais rapido, porque o early-exit evita descompressao desnecessaria
3. **Descompressao em dados aleatorios**: 531 ns vs 3400 ns (LZ4) -- 6,4x mais rapido

### Onde lin_lz PERDE para compressores nativos
1. **Velocidade de compressao em dados estruturados**: 929K ns vs 2,8K ns (LZ4) -- 332x mais lento. Causa: busca O(N*W) sem hash tables
2. **Razao em texto repetitivo**: 17x vs 57,7x (LZ4) -- janela menor (256 vs 65535) e ausencia de parsing otimo
3. **Velocidade de compressao em texto repetitivo**: 101K ns vs 2K ns (LZ4) -- mesma causa de busca sem hash

### Causa raiz das limitacoes
O lin_lz atual usa **busca linear O(N*W)** para match-finding, enquanto LZ4 usa **hash tables O(1)**. Esta e uma limitacao do **algoritmo**, nao da **linguagem LIN** -- o LIN emite corretamente o codigo C equivalente, mas o algoritmo escolhido nao tem a mesma otimizacao que LZ4.

## 5. Emissao Multi-Target

| Target | Status |
| :--- | :---: |
| TypeScript | PASS (11 linhas) |
| Rust | PASS (16 linhas) |
| C | PARIDADE ESTRUTURAL (kernel-space ready) |
| Zig | PARIDADE ESTRUTURAL (kernel-space ready) |

## 6. Veredito Formal

**VEREDITO: B -- lin_lz SOBREVIVEU PARCIALMENTE**

- **Paridade de roundtrip**: 100% em todas as 5 paginas testadas
- **Razao de compressao**: nao competitiva com LZ4 em dados estruturados (limitacao algoritmica, nao linguistica)
- **Vantagens especificas**: superior em paginas de zeros (RLE) e alta entropia (fast-path)
- **Emissao**: deterministica para C (kernel-space), Rust, TS, Zig

### Proximo passo para alcancar Veredito A
Adicionar **hash tables** ao match-finder do lin_lz para alcancar complexidade O(1) por posicao, reduzindo o tempo de compressao de O(N*W) para O(N). Isso e uma melhoria algoritmica, nao uma mudanca na linguagem LIN.