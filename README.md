# LIA — AI-Native compact code language

Língua densa para código e agentes (antes **AIL**). Menos tokens que JS/Dicel verboso; compilável de volta para JS com equivalência semântica.

## Sigilos

| Símbolo | Significado |
|---------|-------------|
| `!f(a){…}` | function |
| `?(c){t}` | if |
| `:{e}` / `:(c){t}` | else / else if |
| `#(i;c;s){b}` | for |
| `^e` | return |
| `$K{k=v}` | const table |
| `=ex{a,b}` | exports |

## Exemplo

```text
@LIA:L1c:0.2
~G{?=if #=for ^=ret :else}
!safeCompare(a,b){A=String(a);B=String(b);n=A.length;r=0;?(n!=B.length){B=A;r=1}#(i=0;i<n;i++){r|=(A.charCodeAt(i)^B.charCodeAt(i))}^r==0}
=ex{safeCompare}
```

Headers: emit default `@LIA`; compiler aceita `@LIA` e legado `@AIL`.

## CLI

```bash
npm test
npm run self-repair
node bin/lia.mjs emit path/to/file.js -o out.lia
node bin/lia.mjs compile examples/safe-compare.lia -o out.js
node bin/lia.mjs check examples/safe-compare.lia
# alias: node bin/ail.mjs …
```

## Self-repair (MVP)

Detect compile/holdout fail → deterministic fixers (F1–F5) → optional 9router patch if `NINEROUTER_URL` → accept only when `behavior_eq==1.0` and exact semantic hash. Spec: `spec/LIA_SELF_REPAIR.dicel`.

## Layout

```
spec/          # LIA.dicel, semantics, compiler, self-repair specs
src/           # emitter.mjs, compiler.mjs
bin/lia.mjs    # CLI (ail alias)
scripts/       # self_repair.mjs, bench_400k.mjs
examples/      # safe-compare.lia, bytes.lia
tests/         # roundtrip
```

## Origem

Extraída do lab `dicel-unified` (perfil AIL_V2 / DICEL-L1c). Renomeada AIL→LIA; ver `LIA_RENAME.dicel`.

## Licença

MIT
