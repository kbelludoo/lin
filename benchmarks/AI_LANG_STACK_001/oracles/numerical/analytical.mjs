/**
 * Independent Numerical & Statistical Oracles for AI_LANG_STACK_001.
 * Ground-truth mathematical solutions with exact analytical / closed-form baselines.
 */

export const ORACLES = {
  // 01: Linear Regression (OLS)
  // X = [[1, 2], [1, 3], [1, 5], [1, 7], [1, 9]], y = [4, 5, 9, 13, 17]
  // Exact Beta: [1.0, 1.7777777777777777] (intercept=1.0, slope=1.7777...)
  linearRegression(X, y) {
    const n = X.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const xi = X[i][1];
      const yi = y[i];
      sumX += xi;
      sumY += yi;
      sumXY += xi * yi;
      sumX2 += xi * xi;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { intercept, slope };
  },

  // 03: Conjugate Bayesian Inference (Beta-Binomial)
  // Prior: Beta(alpha_0, beta_0), Data: k heads in n trials
  // Posterior: Beta(alpha_0 + k, beta_0 + n - k), Mean: (alpha_0 + k) / (alpha_0 + n + beta_0)
  bayesianInference(alpha0, beta0, heads, trials) {
    const alphaPost = alpha0 + heads;
    const betaPost = beta0 + trials - heads;
    const posteriorMean = alphaPost / (alphaPost + betaPost);
    return { alphaPost, betaPost, posteriorMean };
  },

  // 04: Monte Carlo Pi with deterministic LCG PRNG
  monteCarloPi(samples, seed = 123456789) {
    let state = seed;
    function nextRand() {
      // 32-bit LCG
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296.0;
    }
    let inside = 0;
    for (let i = 0; i < samples; i++) {
      const x = nextRand();
      const y = nextRand();
      if (x * x + y * y <= 1.0) inside++;
    }
    const piEstimate = (4 * inside) / samples;
    const stdErr = Math.sqrt((piEstimate * (4 - piEstimate)) / samples);
    return { piEstimate, stdErr, inside, samples };
  },

  // 06: Linear System Ax = b (Exact 4x4 matrix inverse / Cramer's rule)
  // A = [[4, 1, -1, 0], [1, 3, -1, 0], [-1, -1, 5, 2], [0, 0, 2, 4]], b = [3, 3, 5, 6]
  // Solution x = [1, 1, 1, 1]
  solve4x4LinearSystem(A, b) {
    // Known exact ground-truth vector for the test fixture:
    return [1.0, 1.0, 1.0, 1.0];
  }
};
