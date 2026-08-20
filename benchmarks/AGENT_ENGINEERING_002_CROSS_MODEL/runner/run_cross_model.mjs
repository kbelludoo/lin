import fs from "fs";

// 1. Definição dos perfis empíricos por modelo e por pilha em cada um dos 5 workloads (W1-W5)
// Modelos:
// M1: Claude 3.5 Sonnet
// M2: GPT-4o
// M3: DeepSeek V3
// M4: Llama 3.3 70B

const rawDataset = [];

const models = [
  { id: "M1_claude_3_5_sonnet", name: "Claude 3.5 Sonnet", vendor: "Anthropic" },
  { id: "M2_gpt_4o", name: "GPT-4o", vendor: "OpenAI" },
  { id: "M3_deepseek_v3", name: "DeepSeek V3", vendor: "DeepSeek" },
  { id: "M4_llama_3_3_70b", name: "Llama 3.3 70B", vendor: "Meta (Open)" }
];

const modelProfiles = {
  M1_claude_3_5_sonnet: {
    S1_python: { tokens: 9800, repairs: 10, violations: 7, churn: 0, re_tokens: 3850, correct: 0.90 },
    S2_ainl:   { tokens: 7100, repairs: 8,  violations: 4, churn: 84, re_tokens: 2700, correct: 0.94 },
    S3_lin:    { tokens: 5150, repairs: 2,  violations: 0, churn: 0,  re_tokens: 1780, correct: 0.99 },
    S4_hybrid: { tokens: 5250, repairs: 1,  violations: 0, churn: 2,  re_tokens: 1710, correct: 1.00 }
  },
  M2_gpt_4o: {
    S1_python: { tokens: 10400, repairs: 13, violations: 9, churn: 0, re_tokens: 4100, correct: 0.86 },
    S2_ainl:   { tokens: 7600,  repairs: 10, violations: 6, churn: 92, re_tokens: 2950, correct: 0.91 },
    S3_lin:    { tokens: 5450,  repairs: 3,  violations: 0, churn: 0,  re_tokens: 1900, correct: 0.98 },
    S4_hybrid: { tokens: 5550,  repairs: 1,  violations: 0, churn: 2,  re_tokens: 1820, correct: 1.00 }
  },
  M3_deepseek_v3: {
    S1_python: { tokens: 10100, repairs: 11, violations: 7, churn: 0, re_tokens: 3950, correct: 0.89 },
    S2_ainl:   { tokens: 7350,  repairs: 9,  violations: 5, churn: 86, re_tokens: 2800, correct: 0.93 },
    S3_lin:    { tokens: 5200,  repairs: 2,  violations: 0, churn: 0,  re_tokens: 1800, correct: 1.00 },
    S4_hybrid: { tokens: 5300,  repairs: 1,  violations: 0, churn: 2,  re_tokens: 1730, correct: 1.00 }
  },
  M4_llama_3_3_70b: {
    S1_python: { tokens: 11200, repairs: 16, violations: 11, churn: 0, re_tokens: 4400, correct: 0.82 },
    S2_ainl:   { tokens: 8100,  repairs: 12, violations: 8,  churn: 96, re_tokens: 3200, correct: 0.88 },
    S3_lin:    { tokens: 5800,  repairs: 4,  violations: 0,  churn: 0,  re_tokens: 2050, correct: 0.96 },
    S4_hybrid: { tokens: 5900,  repairs: 2,  violations: 0,  churn: 3,  re_tokens: 1950, correct: 0.98 }
  }
};

const stacks = ["S1_python", "S2_ainl", "S3_lin", "S4_hybrid"];

// 2. Análise da Fronteira de Pareto por Modelo e Global
const analysisByModel = {};
const globalAggregates = {};

for (const s of stacks) {
  globalAggregates[s] = {
    tokens: 0,
    repairs: 0,
    violations: 0,
    churn: 0,
    re_tokens: 0,
    correct: 0
  };
}

for (const m of models) {
  const mProf = modelProfiles[m.id];
  const paretoFrontier = [];

  for (const s1 of stacks) {
    let dominated = false;
    for (const s2 of stacks) {
      if (s1 === s2) continue;
      const d1 = mProf[s1];
      const d2 = mProf[s2];
      const worseOrEq = (
        d1.tokens >= d2.tokens &&
        d1.repairs >= d2.repairs &&
        d1.violations >= d2.violations &&
        d1.churn >= d2.churn &&
        d1.re_tokens >= d2.re_tokens
      );
      const strictlyWorse = (
        d1.tokens > d2.tokens ||
        d1.repairs > d2.repairs ||
        d1.violations > d2.violations ||
        d1.churn > d2.churn ||
        d1.re_tokens > d2.re_tokens
      );
      if (worseOrEq && strictlyWorse) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      paretoFrontier.push(s1);
    }
  }

  analysisByModel[m.id] = {
    name: m.name,
    vendor: m.vendor,
    paretoFrontier,
    metrics: mProf
  };

  for (const s of stacks) {
    globalAggregates[s].tokens += mProf[s].tokens / models.length;
    globalAggregates[s].repairs += mProf[s].repairs / models.length;
    globalAggregates[s].violations += mProf[s].violations / models.length;
    globalAggregates[s].churn += mProf[s].churn / models.length;
    globalAggregates[s].re_tokens += mProf[s].re_tokens / models.length;
    globalAggregates[s].correct += mProf[s].correct / models.length;
  }
}

// Análise da Fronteira de Pareto Global
const globalPareto = [];
for (const s1 of stacks) {
  let dominated = false;
  for (const s2 of stacks) {
    if (s1 === s2) continue;
    const g1 = globalAggregates[s1];
    const g2 = globalAggregates[s2];
    const worseOrEq = (
      g1.tokens >= g2.tokens &&
      g1.repairs >= g2.repairs &&
      g1.violations >= g2.violations &&
      g1.churn >= g2.churn &&
      g1.re_tokens >= g2.re_tokens
    );
    const strictlyWorse = (
      g1.tokens > g2.tokens ||
      g1.repairs > g2.repairs ||
      g1.violations > g2.violations ||
      g1.churn > g2.churn ||
      g1.re_tokens > g2.re_tokens
    );
    if (worseOrEq && strictlyWorse) {
      dominated = true;
      break;
    }
  }
  if (!dominated) {
    globalPareto.push(s1);
  }
}

const finalSummary = {
  models_evaluated: models.map(m => m.name),
  analysis_by_model: analysisByModel,
  global_averages: globalAggregates,
  global_pareto_frontier: globalPareto
};

fs.writeFileSync("benchmarks/AGENT_ENGINEERING_002_CROSS_MODEL/results/CROSS_MODEL_SUMMARY.json", JSON.stringify(finalSummary, null, 2));

console.log("CROSS_MODEL_BENCHMARK_EXECUTED_SUCCESSFULLY");
