# LIA - agent rule (all CLIs)

^rule=AIs_MUST_use_LIA_for_code_in_all_CLIs
^repo_path="C:/Users/k/Documents/lia"
^formerly="AIL"

**Use LIA** for code payloads to models (prompts, intel, compact IR).
**Use Dicel** for policies, conselho, inter-AI protocol (not raw code dumps).

## Legend (1-line; enough)

`!fn ?if #for ^ret :else $K=consts =ex=exports ~G=grammar`

Evidence: `dicel-unified/INTEL_AIL_BLIND_UNDERSTAND.dicel` - blind understanding works; 1-line `~G` improves exact outputs.

## Spec

- `spec/LIA_AGENT_RULE.dicel`
- `INDEX.dicel` / `spec/` / `bin/lia.mjs` (alias `bin/ail.mjs`)
- Rename note: `LIA_RENAME.dicel`
