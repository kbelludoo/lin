# AGENT_ENGINEERING_003: Real-Repository Multi-Module Software Evolution Benchmark

## 1. Objetivo Científico
Avaliar se a separação entre representação semântica (LIN) e orquestração operacional (AINL) mantém suas propriedades de baixo custo de manutenção, invariantes estáticos e resiliência à amnésia em um **repositório real multi-módulo** (dezenas de arquivos, dependências internas, suíte de testes de regressão e tarefas incrementais sob morte de contexto).

## 2. Fixture de Repositório Real
- Módulos de domínio: Autenticação/RBAC, Motor de Tarifação/Precificação, Análise de Risco/Fraude, Reconciliação Contábil, Notificações e Webhooks, Faturamento e Auditoria.
- Mais de 25 arquivos de código interconectados com dependências circulares controladas, persistência em banco/memória e integrações de rede.

## 3. Quatro Pilhas Arquiteturais
- **S1 (Python)**: Base de código Python tradicional com tipos opcionais (MyPy) e scripts imperativos.
- **S2 (AINL Puro)**: Workflow modelado integralmente no grafo AINL (DAG detalhado em todos os níveis).
- **S3 (LIN Puro)**: Módulos de lógica e tipos implementados em LIN compilados para os targets nativos.
- **S4 (LIN + AINL)**: Nós de lógica/regras de negócio encapsulados em módulos LIN com contratos de efeito e tipos refinados + Workflow de orquestração controlado via DAG AINL.

## 4. Tarefas Incrementais de Engenharia Real sob Context Death
- **T1 (Feature Complexa)**: Implementar precificação em camadas por volumetria com cálculo de taxa dinâmico e teto por cliente VIP.
- **T2 (Refatoração de Segurança & Invariante)**: Migrar autenticação para Bearer Tokens e garantir estaticamente que nenhuma rota financeira execute sem autorização prévia.
- **T3 (Context Death + Diagnóstico de Regressão)**: Reset total do histórico do agente. Uma regressão contábil silenciosa é introduzida; o novo agente deve diagnosticar e corrigir apenas lendo os arquivos persistidos.
- **T4 (Evolução de Workflow & Resiliência)**: Adicionar política de retry exponencial com jitter no gateway de pagamento e envio de webhook assíncrono.
- **T5 (Auditoria Adversarial)**: Tentar forçar saldo negativo ou burlar a reconciliação; o oráculo avalia contenção estática vs quebra em runtime.

## 5. Painel de Métricas Brutas Primárias (Sem Índices Ponderados a Priori)
- `build_success_rate` (% de builds limpas de primeira passagem)
- `first_pass_correctness` (% de aprovação na suíte de testes de primeira)
- `repair_rounds` (total de turnos de correção)
- `tokens_consumed` (tokens totais de input/output)
- `reconstruction_tokens` (tokens para reconstruir modelo mental pós-amnésia)
- `invariant_violations` (quebras de invariantes de segurança)
- `regression_rate` (testes anteriormente verdes que quebraram)
- `dag_churn` (nós de workflow modificados desnecessariamente)
- `changed_files_count` (arquivos tocados pelo agente)
- `invalidated_units_count` (unidades funcionais invalidadas)
- `wall_clock_time_ms` (tempo total de execução e validação)
- `engineering_efficiency` (Tarefas corretas / [Tokens/1k + Reparos + Regressões + Churn])
