# Ameaças à Validade & Limites Metodológicos (Threats to Validity)

Para manter a transparência científica e evitar extrapolações indevidas dos resultados empíricos apresentados, documentamos os limites formais dos experimentos:

---

## 1. Validade de Construto
* **Oráculos de Equivalência:** Os testes de paridade comportamental (100%) foram avaliados estritamente contra os vetores de teste, asserções de tipos e propriedades oraculares definidos nas suítes executadas. Isso não constitui prova formal irrestrita para qualquer programa arbitrário fora do escopo coberto.
* **Métrica de Continuidade (Context Death):** A poda de 70% foi simulada através da remoção controlada de turnos e histórico conversacional. Em cenários reais, a perda de contexto pode envolver interrupções temporais mais longas ou agentes com prompts de sistema distintos.

---

## 2. Validade Interna
* **Mutações Sintéticas vs. Mudanças Humanas:** A campanha de 1.000 mutações foi gerada com base em classes de evolução formalmente tipadas (refatorações locais, adições de parâmetros opcionais, re-roteamentos estruturais de DAG). Mudanças humanas caóticas com código sintaticamente inválido ou semântica ambígua exigem mais etapas de auto-reparo.
* **Enforcement de Compiler Gate:** A rejeição de 100% dos ataques adversariais reflete a atuação de verificações estritas do compilador (.linmeta). Ataques baseados em brechas de lógica de negócio permitidas pelas regras de tipos não são interceptados apenas por restrições sintáticas/efeitos.

---

## 3. Validade Externa (Generalização)
* **Corpus de Repositórios Reais:** A validação em código real abrangeu três projetos JavaScript conhecidos (`dayjs`, `underscore`, `chalk`) e uma base empresarial de 112.4k LOC. Embora representem complexidade e grafos heterogêneos, não cobrem a totalidade dos paradigmas de software (ex: drivers de hardware de baixo nível ou sistemas distribuídos com consistência eventual complexa).
* **Latência Sub-20ms:** Os tempos de rebuild incremental (~18.7 ms) foram medidos no ambiente do benchmark. Variações de hardware, I/O de disco sob contenção ou árvores de dependência com milhares de pacotes externos podem apresentar tempos absolutos distintos, embora a complexidade assintótica local permaneça contida.
