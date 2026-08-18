/**
 * TOKEN TELEMETRY COLLECTOR & PROVIDER ACCOUNTING GATEWAY
 * ========================================================
 * STRICT RULE ZERO: NO ESTIMATES, NO GUESSED TOKENS, STRICT PROVIDER_USAGE VALIDATION.
 */

import { createHash, randomUUID } from "node:crypto";

export function sha256(content) {
  return createHash("sha256").update(content || "").digest("hex");
}

/**
 * Validates that an API response contains exact provider usage telemetry
 */
export function validateAndExtractProviderUsage(rawApiResponse) {
  if (!rawApiResponse || !rawApiResponse.usage) {
    throw new Error("TELEMETRY_INVALID: Response missing 'usage' object from provider.");
  }

  const usage = rawApiResponse.usage;
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens;
  const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);
  const cachedTokens = usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;

  if (typeof promptTokens !== "number" || typeof completionTokens !== "number") {
    throw new Error("TELEMETRY_INVALID: prompt_tokens or completion_tokens is not a valid integer.");
  }

  return {
    source: "provider_usage",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cached_tokens: cachedTokens,
    total_tokens: totalTokens,
    mathematical_integrity_valid: (totalTokens === promptTokens + completionTokens || totalTokens === promptTokens + completionTokens - cachedTokens)
  };
}

/**
 * Creates an audited cycle accounting record
 */
export function createAuditedCycleRecord({
  model_id,
  provider,
  request_id,
  seed,
  repo_id,
  mutation_id,
  tier,
  cycle_number,
  arm,
  latency_ms,
  token_accounting,
  accumulated_tokens,
  prompt_text,
  diagnostic_text,
  response_text,
  patch_text,
  oracle_result,
  failure_signature
}) {
  if (token_accounting.source !== "provider_usage") {
    throw new Error("TELEMETRY_INVALID: Refusing to create record without verified provider_usage.");
  }

  return {
    cycle_metadata: {
      model_id,
      provider,
      request_id: request_id || randomUUID(),
      seed,
      repo_id,
      mutation_id,
      tier,
      cycle_number,
      arm,
      timestamp_utc: new Date().toISOString(),
      latency_ms
    },
    token_accounting,
    accumulated_tokens,
    cryptographic_hashes: {
      prompt_sha256: sha256(prompt_text),
      diagnostic_sha256: sha256(diagnostic_text),
      response_sha256: sha256(response_text),
      patch_sha256: sha256(patch_text),
      failure_signature: failure_signature || sha256("CLEAN")
    },
    oracle: {
      result: oracle_result,
      t_old_pass: oracle_result === "PASS"
    }
  };
}
