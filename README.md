# AIL — AI-Native compact code language

Língua densa para código e agentes. Menos tokens que JS/Dicel verboso; compilável de volta para JS com equivalência semântica.

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
@AIL:L1c:0.2
~G{?=if #=for ^=ret :else}
!safeCompare(a,b){A=String(a);B=String(b);n=A.length;r=0;?(n!=B.length){B=A;r=1}#(i=0;i<n;i++){r|=(A.charCodeAt(i)^B.charCodeAt(i))}^r==0}
=ex{safeCompare}
```

## CLI

```bash
npm test
node bin/ail.mjs emit path/to/file.js -o out.ail
node bin/ail.mjs compile examples/safe-compare.ail -o out.js
node bin/ail.mjs check examples/safe-compare.ail
```

## Layout

```
spec/          # AIL.dicel, semantics, compiler specs
src/           # emitter.mjs, compiler.mjs
bin/ail.mjs    # CLI
examples/      # safe-compare.ail, bytes.ail
tests/         # roundtrip
```

## Origem

Extraída do lab `dicel-unified` (perfil AIL_V2 / DICEL-L1c). Aqui AIL é a língua principal do repositório.

## Licença

MIT
