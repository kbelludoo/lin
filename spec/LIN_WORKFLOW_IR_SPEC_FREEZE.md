# LIN NATIVE WORKFLOW IR — FORMAL SPECIFICATION FREEZE (v1.0.0)

**Data:** 2026-08-20  
**Status:** FROZEN CORE SPECIFICATION  
**Compatibilidade:** LIN L1c / L2  

---

## 1. Modelo Abstrato e Ontologia
O **LIN Unified IR** é composto por dois planos ortogonais e formalmente desacoplados:
1. **Plano Semântico Local (Node Contract & Body)**: Define funções, tipos refinados (`Refinement Types`), contratos de efeitos (`~effects`) e corpo executável.
2. **Plano de Topologia Operacional (Workflow DAG)**: Define a ordem canônica de dependências, arestas tipadas, primitivas de controle e políticas de resiliência.

---

## 2. Gramática e Primitivas Canônicas de Controle do Workflow

### 2.1 Primitivas Suportadas no Núcleo do IR
| Primitiva | Semântica Formal | Efeito no DAG |
| :--- | :--- | :--- |
| **`step <id>: <Type> = <expr>`** | Instanciação de um nó de execução tipado. | Cria nó e aresta de dependência a montante. |
| **`dependency <from_port> -> <to_port>`** | Canal unidirecional com verificação de invariante de tipo estático. | Aresta orientada com checagem de tipos. |
| **`if (<pred>) -> <then_step> : -> <else_step>`** | Roteamento condicional determinístico no fluxo de controle. | Bifurcação de arestas de controle com guarda booleana. |
| **`parallel [<step_1>, ..., <step_n>]`** | Execução concorrente assíncrona (fork-join) de passos ortogonais. | Nós irmãos sem dependência mútua, convergindo em join. |
| **`retry(<retries>, <backoff>) <expr>`** | Política de resiliência e repetição com contenção de exceção. | Nó decorado com laço de contenção sem alteração topológica. |
| **`await <future>`** | Ponto de sincronização assíncrona determinística. | Barreira de sincronização de estado. |
| **`return <var>`** | Ponto terminal do DAG com empacotamento da saída. | Aresta terminal conectada ao sumidouro (sink) do workflow. |
| **`~effects{<e1>, ...}`** | Declaração e sandboxing de efeitos colaterais (`pure`, `io`, `async`, `state`). | Propagação e contenção estática de efeitos nas arestas. |

---

## 3. Álgebra do Semantic Hash Hierárquico

O hash do sistema é calculado em três camadas determinísticas:

$$mathcal{H}_{	ext{node}}(N_i) = 	ext{SHA256}(	ext{id}, 	ext{unit}, 	ext{inputs}, 	ext{outputs}, 	ext{sorted}(	ext{effects}), 	ext{body_ast})$$

$$mathcal{H}_{	ext{edges}}(mathcal{E}) = 	ext{SHA256}(	ext{sorted}({ (u.p_{	ext{out}} 	o v.p_{	ext{in}}) }))$$

$$mathcal{H}_{	ext{workflow}}(mathcal{W}) = 	ext{SHA256}(	ext{id}, 	ext{entry}, { N_i mapsto mathcal{H}_{	ext{node}}(N_i) }, mathcal{H}_{	ext{edges}}(mathcal{E}))$$

### Regra de Invariância Local:
$$Delta(	ext{body_ast}(N_i)) implies Delta(mathcal{H}_{	ext{node}}(N_i)) land Delta(mathcal{H}_{	ext{workflow}}) quad	ext{mas}quad Delta(mathcal{H}_{	ext{edges}}) = 0$$

---

## 4. Regras Estáticas de Invalidação e Verificação de Tipos
1. **Regra de Tipo de Aresta**: Para toda aresta $e: (u, p_{	ext{out}}) 	o (v, p_{	ext{in}})$, o compilador impõe $T(p_{	ext{out}}) subseteq T(p_{	ext{in}})$.
2. **Regra de Contenção de Efeitos**: Se um nó $N$ possui $sim	ext{effects}{	ext{pure}}$, nenhuma aresta de entrada pode induzir efeitos colaterais mutáveis ou I/O não sandboxado.
3. **Regra de Invalidação Seletiva**: Invalidações de cache ocorrem estritamente no nó alterado e em seus nós dependentes imediatos a jusante no subgrafo conexo, preservando 100% dos nós irmãos e arestas não relacionadas.

---

## 5. Emissão Determinística para Alvos Nativos
O **LIN Workflow Engine** implementa rebaixamento determinístico para:
- **TypeScript**: `export async function run_<id>(ctx) { ... }` com promises, contexto estruturado e retries assíncronos.
- **Rust**: `pub async fn run_<id>(ctx: &str) -> Result<..., String>` com tipos estritos e `tokio` / runtime nativo.
