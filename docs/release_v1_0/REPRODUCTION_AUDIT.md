# LIN v1.0 Reproduction & Audit Verification

Este documento fornece o roteiro formal para auditoria externa e reprodução independente de 100% dos resultados experimentais do **LIN v1.0**.

---

## 1. Rastreabilidade de Claims & Manifestos

| Claim Experimental | Benchmark Associado | Manifesto Congelado | Relatório de Resultados |
| :--- | :--- | :--- | :--- |
| **Densidade de Tokens & Velocidade** | `AI_LANG_STACK_001` | `benchmarks/AI_LANG_STACK_001/manifest.json` | `benchmarks/AI_LANG_STACK_001/results/RUN_001/final_report.json` |
| **Continuidade sob Context Death (70%)** | `AI_LANG_STACK_002` | `benchmarks/AI_LANG_STACK_002/manifest.json` | `benchmarks/AI_LANG_STACK_002/results/RUN_001/final_continuity_report.json` |
| **Defesa Adversarial & Integridade** | `AI_LANG_STACK_002_RUN_002` | `benchmarks/AI_LANG_STACK_002/run_002/manifest.json` | `benchmarks/AI_LANG_STACK_002/results/RUN_002/final_adversarial_report.json` |
| **Curva de Manutenção em Escala** | `AINL_LIN_COMPOSITION_002_SCALE` | `benchmarks/AINL_LIN_COMPOSITION_002_SCALE/manifest.json` | `benchmarks/AINL_LIN_COMPOSITION_002_SCALE/results/RUN_001/final_scale_report.json` |
| **Generalização Topológica (Linear/Fan/Mesh)** | `AINL_LIN_COMPOSITION_003` | `benchmarks/AINL_LIN_COMPOSITION_003_TOPOLOGIES/manifest.json` | `benchmarks/AINL_LIN_COMPOSITION_003_TOPOLOGIES/results/RUN_001/final_topologies_report.json` |
| **Localidade Seletiva (Tiers 1–4)** | `SELECTIVE_LOCALITY_001` | `benchmarks/AINL_LIN_SELECTIVE_LOCALITY_001/manifest.json` | `benchmarks/AINL_LIN_SELECTIVE_LOCALITY_001/results/RUN_001/final_selectivity_report.json` |
| **Ciclo de Vida de Engenharia Autônoma** | `AGENT_ENGINEERING_001` | `benchmarks/AGENT_ENGINEERING_001/manifest.json` | `benchmarks/AGENT_ENGINEERING_001/results/RUN_001/final_lifecycle_report.json` |
| **Invariância em 4 Famílias de LLMs** | `CROSS_MODEL_REPLICATION_001` | `benchmarks/CROSS_MODEL_REPLICATION_001/manifest.json` | `benchmarks/CROSS_MODEL_REPLICATION_001/results/RUN_001/final_cross_model_report.json` |
| **Repositórios OSS (Day.js, Underscore, Chalk)** | `AGENT_ENGINEERING_003_REAL_REPO` | `benchmarks/AGENT_ENGINEERING_003_REAL_REPO/manifest.json` | `benchmarks/AGENT_ENGINEERING_003_REAL_REPO/results/RUN_001/final_real_repo_report.json` |
| **Paridade em 112k LOC / 1.000 Mutações** | `AINL_TO_LIN_PARITY_MIGRATION_002` | `benchmarks/AINL_TO_LIN_PARITY_MIGRATION_002_REAL_LARGE/manifest.json` | `benchmarks/AINL_TO_LIN_PARITY_MIGRATION_002_REAL_LARGE/results/RUN_001/final_large_parity_report.json` |
| **Superfície Pública @LIN:L2w:1.0** | `LIN_NATIVE_WORKFLOW_003_REAL_LARGE` | `benchmarks/LIN_NATIVE_WORKFLOW_003_REAL_LARGE/manifest.json` | `benchmarks/LIN_NATIVE_WORKFLOW_003_REAL_LARGE/results/RUN_001/final_surface_large_report.json` |
| **Reimplementação node-semver** | `FIRE_TEST_003_NODE_SEMVER` | `benchmarks/FIRE_TEST_003_NODE_SEMVER/manifest.json` | `benchmarks/FIRE_TEST_003_NODE_SEMVER/results/RUN_001/final_semver_fire_test_report.json` |
| **Reimplementação de Produto Real CLI (jq)** | `FIRE_TEST_004_JQ` | `benchmarks/FIRE_TEST_004_JQ/manifest.json` | `benchmarks/FIRE_TEST_004_JQ/results/RUN_001/final_jq_product_report.json` |

---

## 2. Instruções de Reprodução em Checkout Limpo

Para reproduzir os resultados de qualquer benchmark em um ambiente isolado:

```bash
# 1. Clone o repositório
git clone https://github.com/kbelludoo/lin.git
cd lin

# 2. Instale dependências mínimas
npm install

# 3. Execute qualquer suíte de validação e benchmark, por exemplo:
node benchmarks/FIRE_TEST_004_JQ/runner/run_jq_experiment.mjs
node benchmarks/FIRE_TEST_004_JQ/analyzer/analyze.mjs

# 4. Verifique o digest SHA-256 do arquivo gerado contra o manifest.sha256
sha256sum benchmarks/FIRE_TEST_004_JQ/results/RUN_001/raw.json
cat benchmarks/FIRE_TEST_004_JQ/results/RUN_001/manifest.sha256
```

---

## 3. Conformidade com Threats to Validity
Todos os relatórios e documentos deste release foram auditados para garantir que nenhum claim exceda as condições testadas, mantendo explicitadas as limitações de construto, oráculos e generalização externa.
