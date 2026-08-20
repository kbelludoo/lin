# LIN_LEGACY_APP_001: Relatório de Reescrita de Aplicação Real Completa

## 1. Resumo Executivo

O benchmark **LIN_LEGACY_APP_001** reimplementou uma **aplicação CLI completa** (Task Manager com persistência, validação, lógica de negócio, display e roteamento de comandos) em **LIN Surface @L2w:1.0**, validando paridade comportamental de **100%** contra a aplicação original em JavaScript, com emissão multi-target, 100 mutações evolutivas e métricas de runtime.

**Veredito: A — LIN SOBREVIVEU INTEGRALMENTE**

## 2. Resultados Quantitativos

| Métrica | Valor Aferido |
| :--- | :--- |
| **Aplicação** | Task Manager CLI (12 funções, 5 camadas arquiteturais) |
| **Paridade Comportamental** | **21/21 (100%)** |
| **Casos de Teste** | add, list, done, delete, search, stats, format, error handling |
| **Invariância Semântica (H_node)** | 100/100 (100%) |
| **Over-invalidation** | **0** |
| **Emissão Multi-Target** | TS:31 linhas, Rust:34 linhas, C:OK, Zig:OK |

## 3. Métricas de Runtime

| Métrica | Original JS | LIN @L2w | Observação |
| :--- | :--- | :--- | :--- |
| Cold start (ms, média 10) | 0,021 | 0,228 | LIN inclui parse de IR; overhead fixo de grammar |
| Throughput (cmd/s, 10k) | 54.217 | 55.500 | Regime estável equivalente (+2,4%) |
| RAM (heap, 1k tasks, KB) | ~1.631 | 327 | LIN usa menos heap em regime de dados |
| Artefato fonte (bytes) | 4.054 | 4.482 | Overhead fixo de grammar para app pequena |
| TS emitido (bytes) | N/A | 1.244 | Emissão determinística |
| Rust emitido (bytes) | N/A | 1.545 | Emissão determinística |

## 4. Camadas da Aplicação Reescrita

| Camada | Funções | Descrição |
| :--- | :--- | :--- |
| **Storage** | load_tasks, save_tasks | Persistência em arquivo JSON |
| **Validation** | validate_task | Validação de título e prioridade com refinement types |
| **Business Logic** | add_task, list_tasks, complete_task, delete_task, search_tasks, get_stats | CRUD + filtros + estatísticas |
| **Display** | format_task, format_stats | Formatação para CLI |
| **CLI Router** | execute_command | Roteamento de comandos com pattern matching |

## 5. Análise de Tokens e Scaling

| Métrica | Original JS | LIN @L2w |
| :--- | :--- | :--- |
| Caracteres | 4.054 | 4.482 |
| Tokens (approx) | 1.014 | 1.121 (+10,6%) |
| LOC | 114 | 116 |

**Nota sobre scaling**: Para uma aplicação pequena (12 funções), o overhead fixo das declarações de gramática LIN (~schema, ~G, ~effects) offset a compactação da lógica. A vantagem de tokens do LIN escala com o tamanho do software: no benchmark Lodash (300 funções), a redução foi de **−56,8%**. O custo fixo de grammar (~200 tokens) é amortizado em software maior.

## 6. Veredito Formal

**VEREDITO: A — LIN SOBREVIVEU INTEGRALMENTE**

A reescrita completa de uma aplicação CLI real em LIN @L2w:1.0 atingiu **100% de paridade comportamental** em 21 vetores de teste cobrindo todos os comandos, casos de borda e tratamento de erros. O throughput em regime estável é equivalente ao JS original (+2,4%). A emissão multi-target (TS, Rust, C, Zig) foi verificada e 100 mutações mantiveram 100% de invariância semântica com 0 over-invalidation.