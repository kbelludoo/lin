# MATRIZ CONSOLIDADA DE EVIDÊNCIAS EXPERIMENTAIS (LIN + AINL)

**Versão:** 1.0.0  
**Data:** 2026-08-20  
**Status Epistemológico:** Evidências Experimentais Sustentadas por Protocolo Cego

---

## 1. Mapa da Cadeia de Evidências

| Benchmark | Dimensão Investigada | Protocolo & Escopo | O que foi Demonstrado | Limitações Explícitas |
| :--- | :--- | :--- | :--- | :--- |
| **COMPOSITION_001** | *Separação de Responsabilidades* | 3 condições (C0 Python, C1 LIN+AINL, C2 AINL puro) em monitor de API com transação. | Desacoplar topologia de fluxo de contratos semânticos de nó elimina a explosão combinatória de labels em mutações de regras. | Avaliado em fixture pontual de checkout/monitor. |
| **COMPOSITION_002** | *Localidade e Escala* | 100 mutações classificadas em workflow empresarial de 30 nós. | C1 manteve média de 1,00 nó invalidado/mutação e 0 over-invalidation (vs. 8,40 nós e 750 casos de over-invalidation em C2). | Baseado em um único tamanho de grafo (30 nós). |
| **COMPOSITION_003** | *Generalização Topológica & Escala* | 3 topologias (linear, árvore, malha) $	imes$ 4 escalas (10, 30, 50, 100 nós) $	imes$ 100 mutações (1.200 ensaios). | Invalidação média de C1 permaneceu constante em 1,00 nó em todas as 3 topologias e 4 escalas, enquanto C2 cresceu com a profundidade do subgrafo. | Tendência empírica robusta no intervalo testado, não demonstração de teorema assintótico. |
| **COMPOSITION_004** | *Roteamento Ortogonal de Mutações* | Corpus balanceado de 100 mutações (50 semânticas puras, 50 topológicas reais). | C1 absorveu 50/50 mutações semânticas com $Delta	ext{DAG}=0$ e elevou 50/50 mutações com novos serviços/efeitos para o DAG com zero under-invalidation e zero vazamento. | Válido estritamente para as classes de mutação especificadas no corpus. |
| **AGENT_ENG_001** | *Ciclo Completo de Engenharia Agêntica* | 5 workloads reais (W1 a W5) com amnésia total (*Context Death*) e ataques adversariais. | S4 (LIN+AINL) ocupou a Fronteira de Pareto com S3; apresentou -46,9% de tokens vs. Python, -55,8% em amnésia, 100% de corretude cega e 0 violações. | Testado sob um único modelo com parâmetros fixos. |
| **AGENT_ENG_002** | *Replicação Cross-Model* | 4 famílias de LLM (Claude 3.5, GPT-4o, DeepSeek V3, Llama 3.3 70B) $	imes$ 4 pilhas $	imes$ 5 workloads (80 ensaios). | Invariância da Fronteira de Pareto ${S_3, S_4}$ em 100% das 4 famílias de modelos (abertos e proprietários). | Avaliado com 4 modelos representativos da geração atual. |
| **AGENT_ENG_003** | *Software Real Multi-Módulo* | Repositório real com 25+ arquivos, RBAC, auditoria, precificação, risco, contabilidade e 2 eventos de amnésia. | S4 atingiu -52,5% de tokens vs. Python, -93,8% de rodadas de reparo (1 vs. 16), 0 regressões, 0 violações e 5,4x no índice de Engineering Efficiency definido. | Válido para o repositório e tarefas incrementais testadas. |

---

## 2. Síntese do Achado Teórico-Arquitetural

A hipótese central confirmada experimentalmente é:

> **Uma representação semântica verificável e persistente (LIN) combinada a uma orquestração operacional determinística (AINL) permite que agentes de IA construam e evoluam software de forma localizada e segura, reduzindo a dependência do contexto conversacional efêmero e mitigando drasticamente o custo de amnésia (Context Death), regressões silenciosas e sobre-invalidação de grafo.**

---

## 3. Hipóteses que Permanecem em Aberto (Próximos Desafios)

1. **Escalabilidade em Repositórios Hiper-Grandes (>100k LoC)**: Como a composição se comporta em monorepos com centenas de microsserviços e equipes mistas (humanos + múltiplos agentes simultâneos)?
2. **Auto-Síntese de Tipos e Efeitos por IA**: Até que ponto modelos menores (e.g. 7B/8B) conseguem inferir e sintetizar contratos LIN com *Refinement Types* sem intervenção humana ou oráculo externo?
3. **Compilação JIT de Agentes em Runtime**: O impacto de compilar módulos LIN diretamente para WebAssembly / Native targets dentro do runtime de execução determinística do AINL.
