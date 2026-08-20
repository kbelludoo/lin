# AMEAÇAS À VALIDADE (THREATS TO VALIDITY)

## 1. Ameaças à Validade Interna
- **Viés de Design de Benchmarks**: Workloads desenhados com suposições de tarefas corporativas típicas (fintech/e-commerce). Domínios não estruturados (ex: escrita criativa, NLP livre) podem não exibir a mesma separação de fases.
- **Risco de Vazamento de Estado**: Mitigado pelo módulo `context_death.mjs`, que apaga 100% do histórico e memória volátil, forçando leitura estrita do disco.

## 2. Ameaças à Validade Externa
- **Generalização para Monorepos Massivos**: O maior fixture avaliado possui 25+ módulos. Sistemas com >10.000 arquivos podem exigir estratégias adicionais de indexação de grafo e particionamento de espaço de nomes.
- **Evolução de Modelos de IA**: Embora testado em 4 famílias distintas (`AGENT_ENG_002`), futuros modelos com arquiteturas não-transformer podem interagir de maneira diferente com representações compactas.

## 3. Ameaças à Validade de Constructo
- **Métrica de Engineering Efficiency**: Definida como razão entre tarefas completas e custos operacionais; é um indicador de comparação relativa, não uma constante física universal.
