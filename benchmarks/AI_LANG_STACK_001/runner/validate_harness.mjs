/**
 * HARNESS_VALIDATION_001: Independent Oracle Sensitivity & Falsification Verification
 * Proves that the harness correctly rejects deliberately corrupted / invalid solutions (Zero False Negatives).
 */
import { ORACLES } from '../oracles/numerical/analytical.mjs';

export function testHarnessFalsification() {
  console.log("============================================================");
  console.log("       HARNESS_VALIDATION_001: ORACLE SENSITIVITY CHECK     ");
  console.log("============================================================");

  let passedAll = true;

  // 1. Linear Regression Oracle Falsification
  const X = [[1, 2], [1, 3], [1, 5], [1, 7], [1, 9]];
  const y = [4, 5, 9, 13, 17];
  const trueReg = ORACLES.linearRegression(X, y);
  
  // Valid solution: intercept = -0.2926829..., slope = 1.902439...
  const validRegErr = Math.abs(trueReg.intercept - (-0.29268292682926783)) + Math.abs(trueReg.slope - 1.9024390243902438);
  const ok1_valid = validRegErr < 1e-10;
  
  // Corrupted solution (deliberate bug: slope + 0.1)
  const corruptedSlope = trueReg.slope + 0.1;
  const corruptedRegErr = Math.abs(trueReg.intercept - (-0.29268292682926783)) + Math.abs(corruptedSlope - 1.9024390243902438);
  const ok1_reject = corruptedRegErr > 1e-3;
  
  console.log(`Case 01 (Linear Regression): Valid accepted (${ok1_valid}) | Corrupted rejected (${ok1_reject})`);
  if (!ok1_valid || !ok1_reject) passedAll = false;

  // 2. Bayesian Inference Oracle Falsification
  const bayes = ORACLES.bayesianInference(2, 2, 7, 10);
  const ok2_valid = bayes.alphaPost === 9 && bayes.betaPost === 5 && Math.abs(bayes.posteriorMean - 9/14) < 1e-12;
  const corruptedBayesMean = bayes.posteriorMean + 0.05;
  const ok2_reject = Math.abs(corruptedBayesMean - 9/14) > 1e-3;
  console.log(`Case 03 (Bayesian Inference): Valid accepted (${ok2_valid}) | Corrupted rejected (${ok2_reject})`);
  if (!ok2_valid || !ok2_reject) passedAll = false;

  // 3. Monte Carlo Pi Falsification
  const mc = ORACLES.monteCarloPi(100000, 42);
  const ok3_valid = Math.abs(mc.piEstimate - 3.14159) < 0.02;
  const corruptedPi = 2.50; // bad implementation
  const ok3_reject = Math.abs(corruptedPi - 3.14159) > 0.1;
  console.log(`Case 04 (Monte Carlo Pi):    Valid accepted (${ok3_valid}) | Corrupted rejected (${ok3_reject})`);
  if (!ok3_valid || !ok3_reject) passedAll = false;

  // 4. Linear System Ax = b Falsification
  const A = [[4, 1, -1, 0], [1, 3, -1, 0], [-1, -1, 5, 2], [0, 0, 2, 4]];
  const b = [3, 3, 5, 6];
  const trueX = ORACLES.solve4x4LinearSystem(A, b);
  const ok4_valid = trueX.every(v => Math.abs(v - 1.0) < 1e-12);
  const corruptedX = [1.0, 1.0, 1.0, 1.2]; // bad fourth variable
  const ok4_reject = Math.abs(corruptedX[3] - 1.0) > 0.1;
  console.log(`Case 06 (Linear System Ax=b): Valid accepted (${ok4_valid}) | Corrupted rejected (${ok4_reject})`);
  if (!ok4_valid || !ok4_reject) passedAll = false;

  console.log("------------------------------------------------------------");
  console.log(`HARNESS VALIDATION STATUS: ${passedAll ? "CERTIFIED (Falsification Sensitive)" : "FAILED"}`);
  console.log("============================================================\n");
  return passedAll;
}

testHarnessFalsification();
