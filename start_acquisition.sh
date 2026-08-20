#!/bin/bash
# ═══════════════════════════════════════════════════
#  Language Acquisition Autopilot — INFINITO
#  Roda ate voce fechar (Ctrl+C)
# ═══════════════════════════════════════════════════

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Autopilot INFINITO                          ║"
echo "║  20+ linguas + Ollama sugere novas           ║"
echo "║  Ctrl+C para parar                           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check Ollama
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "[setup] Ollama não rodando. Iniciando..."
  ollama serve &
  sleep 3
fi

# Check model
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"
if ! curl -s http://localhost:11434/api/tags | grep -q "$MODEL"; then
  echo "[setup] Puxando modelo $MODEL..."
  ollama pull "$MODEL"
fi

echo "[run] Iniciando loop infinito..."
echo ""

node scripts/run_autopilot.mjs --cycles 2
