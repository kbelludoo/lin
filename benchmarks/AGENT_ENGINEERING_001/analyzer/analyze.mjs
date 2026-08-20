import fs from "fs";

export function analyzeEngineeringResults(rawResults) {
  const stacks = ["S1_python", "S2_ainl", "S3_lin", "S4_hybrid"];
  
  const metricsByStack = {};
  for (const s of stacks) {
    const runs = rawResults.filter(r => r.stack === s);
    metricsByStack[s] = {
      total_tokens: runs.reduce((a, b) => a + b.tokens_consumed, 0),
      total_repairs: runs.reduce((a, b) => a + b.repair_rounds, 0),
      total_violations: runs.reduce((a, b) => a + b.invariant_violations, 0),
      total_dag_churn: runs.reduce((a, b) => a + b.dag_churn, 0),
      total_reconstruction_tokens: runs.reduce((a, b) => a + b.reconstruction_tokens, 0),
      correctness_rate: runs.reduce((a, b) => a + b.correctness_rate, 0) / runs.length
    };
  }

  const paretoFrontier = [];
  for (const s1 of stacks) {
    let dominated = false;
    for (const s2 of stacks) {
      if (s1 === s2) continue;
      const m1 = metricsByStack[s1];
      const m2 = metricsByStack[s2];
      const isWorseOrEqualInAll = (
        m1.total_tokens >= m2.total_tokens &&
        m1.total_repairs >= m2.total_repairs &&
        m1.total_violations >= m2.total_violations &&
        m1.total_dag_churn >= m2.total_dag_churn &&
        m1.total_reconstruction_tokens >= m2.total_reconstruction_tokens
      );
      const isStrictlyWorseInOne = (
        m1.total_tokens > m2.total_tokens ||
        m1.total_repairs > m2.total_repairs ||
        m1.total_violations > m2.total_violations ||
        m1.total_dag_churn > m2.total_dag_churn ||
        m1.total_reconstruction_tokens > m2.total_reconstruction_tokens
      );
      if (isWorseOrEqualInAll && isStrictlyWorseInOne) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      paretoFrontier.push(s1);
    }
  }

  return { metricsByStack, paretoFrontier };
}
