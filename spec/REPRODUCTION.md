# PROTOCOLO DE REPRODUTIBILIDADE (REPRODUCTION GUIDE)

## 1. Ambiente e Dependências
- **Node.js**: v20+ ou v24+
- **Python**: 3.10+ (com pacotes `ainativelang>=1.8.1`, `httpx`, `requests`, `PyYAML`)
- **Compilador LIN**: `bin/lin.mjs` (CLI canônica local)
- **Compilador AINL**: `ainl` (CLI canônica)

## 2. Estrutura de Artefatos
- Especificações e Regras: `spec/`
- Benchmarks e Dados Brutos: `benchmarks/`
- Oráculos de Validação: `benchmarks/*/oracles/`

## 3. Comandos de Reprodução Direta
```bash
# 1. Validar oráculos com testes de falsificação explícitos
node benchmarks/AGENT_ENGINEERING_001/runner/execute.mjs

# 2. Executar replicação cross-model (80 ensaios)
node benchmarks/AGENT_ENGINEERING_002_CROSS_MODEL/runner/run_cross_model.mjs

# 3. Executar engenharia em repositório real sob amnésia (Context Death)
node benchmarks/AGENT_ENGINEERING_003_REAL_REPO/runner/run_real_repo.mjs
```

## 4. Oráculos de Avaliação
- `HARNESS_VALIDATION_004`: Audita falsificações de bugs (`INCORRECT`), quebras de invariantes (`UNSAFE`), churn falso (`EXCESSIVE_CHURN`) e perda de arquivos (`INCOMPLETE`).
