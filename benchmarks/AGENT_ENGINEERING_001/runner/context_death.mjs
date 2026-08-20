import fs from "fs";

export function simulateContextDeath(workspaceFiles) {
  // O reset de contexto descarta 100% das mensagens de chat, memória de diálogo e raciocínio intermediário.
  // O novo agente recebe exclusivamente os arquivos reais persistidos em disco.
  const stateSnapshot = {};
  for (const f of workspaceFiles) {
    if (fs.existsSync(f)) {
      stateSnapshot[f] = fs.readFileSync(f, "utf8");
    }
  }
  return {
    chat_history: [], // Amnésia completa
    persisted_artifacts: stateSnapshot,
    timestamp: Date.now()
  };
}
