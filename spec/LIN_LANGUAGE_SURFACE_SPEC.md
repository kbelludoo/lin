# LIN LANGUAGE SURFACE SPECIFICATION — WORKFLOW EXTENSION (v1.0.0)

## 1. Gramática de Superfície (~workflow)
A sintaxe de superfície foi desenhada para ser ultra-compacta, livre de ambiguidades e de baixíssima entropia para geração por LLMs.

```lin
@LIN:L1c:1.0
^schema_once ^ops=checkout_flow
~G{?=if #=for ^=ret :else}
~effects{pure,io,async}

// 1. Unidades Semânticas Locais
!auth_token(token: str): bool {
  ^(token != "")
}

!calc_total(amount: num{>0}): num {
  ^amount * 1.02
}

// 2. Bloco Canônico de Workflow
~workflow {
  step auth   -> auth_token(token)
  step price  -> calc_total(amount)
  step charge -> retry(3, exp) http_post("https://gateway.bank/charge", price)
  step notify -> ?(charge.status == "OK") -> http_post("https://notify.internal", "Paid") : -> abort
}

=ex{auth_token,calc_total}
```

## 3. Parser de Superfície (LIN Surface -> Unified IR)
O parser lê a declaração `~workflow { ... }` e constrói deterministicamente a estrutura `WorkflowDAG` compatível com o `LinWorkflowEngine`.
