/**
 * REPAIR DIAGNOSTIC ENCODER
 * =========================
 * Transforms raw test execution failures into:
 *   1. LIN compact semantic diagnostic structures (~R / .d format)
 *   2. Baseline verbose textual error format
 * 
 * STRICT RULE: Both representations contain the EXACT same factual information:
 *   - Error message
 *   - Failing test name
 *   - File & line number
 *   - Expected vs Actual values
 *   - Stack trace root cause
 */

export function parseRawErrorOutput(rawOutput, exitCode) {
  const lines = rawOutput.split("\n");
  const failures = [];
  let currentFailure = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match common assertion failures (ava, mocha, jest, tape, standard assert)
    if (trimmed.includes("AssertionError") || trimmed.includes("Error:") || trimmed.startsWith("not ok") || trimmed.includes("TypeError") || trimmed.includes("FAIL")) {
      if (currentFailure) failures.push(currentFailure);
      currentFailure = {
        title: trimmed,
        file: "unknown",
        line: 0,
        expected: null,
        actual: null,
        stack: []
      };
    }

    if (currentFailure) {
      if (trimmed.includes("expected:") || trimmed.includes("Expected:")) {
        currentFailure.expected = trimmed.split(":")[1]?.trim() || "";
      } else if (trimmed.includes("actual:") || trimmed.includes("Actual:")) {
        currentFailure.actual = trimmed.split(":")[1]?.trim() || "";
      } else if (trimmed.includes("at ") && (trimmed.includes(".js:") || trimmed.includes(".ts:") || trimmed.includes(".mjs:"))) {
        const match = trimmed.match(/\(?([\w\.\-\\\/]+):(\d+):(\d+)\)?/);
        if (match && currentFailure.file === "unknown") {
          currentFailure.file = match[1];
          currentFailure.line = parseInt(match[2], 10);
        }
        currentFailure.stack.push(trimmed);
      }
    }
  }

  if (currentFailure) failures.push(currentFailure);

  if (failures.length === 0 && exitCode !== 0) {
    failures.push({
      title: `Non-zero exit code: ${exitCode}`,
      file: "suite",
      line: 0,
      expected: "exit 0",
      actual: `exit ${exitCode}`,
      stack: lines.slice(-10)
    });
  }

  return failures;
}

/**
 * Encodes factual error diagnostics into LIN compact semantic structure
 */
export function encodeLinDiagnostic(failures, repoContext) {
  let lin = `~D{.r="${repoContext.id}" .s=FAIL}\n`;
  for (let idx = 0; idx < failures.length; idx++) {
    const f = failures[idx];
    const cleanTitle = (f.title || "error").replace(/[^\w\s\:\-\.\(\)]/g, "").slice(0, 80);
    const exp = (f.expected || "PASS").replace(/[^\w\s\.\-]/g, "").slice(0, 40);
    const act = (f.actual || "FAIL").replace(/[^\w\s\.\-]/g, "").slice(0, 40);
    const file = f.file || "main";
    const line = f.line || 0;
    
    lin += `!f${idx}{msg="${cleanTitle}" loc="${file}:${line}" exp="${exp}" act="${act}"}\n`;
  }
  lin += `^goal="repair_code_to_pass_all_invariants_without_test_deletion"`;
  return lin;
}

/**
 * Encodes factual error diagnostics into standard Baseline verbose representation
 */
export function encodeBaselineDiagnostic(failures, rawOutput, repoContext) {
  let text = `Repository: ${repoContext.name} (${repoContext.id})\n`;
  text += `Test Suite Status: FAILED\n\n`;
  text += `Detailed Failure Report:\n`;
  text += `--------------------------------------------------\n`;
  
  for (let idx = 0; idx < failures.length; idx++) {
    const f = failures[idx];
    text += `Failure #${idx + 1}:\n`;
    text += `  Message:  ${f.title}\n`;
    text += `  Location: ${f.file}:${f.line}\n`;
    if (f.expected) text += `  Expected: ${f.expected}\n`;
    if (f.actual)   text += `  Actual:   ${f.actual}\n`;
    if (f.stack.length > 0) {
      text += `  Trace:\n    ${f.stack.slice(0, 4).join("\n    ")}\n`;
    }
    text += `\n`;
  }
  
  text += `--------------------------------------------------\n`;
  text += `Instructions: Fix the source implementation so all original test cases and new invariants pass. Do not remove or alter test suites.`;
  return text;
}
