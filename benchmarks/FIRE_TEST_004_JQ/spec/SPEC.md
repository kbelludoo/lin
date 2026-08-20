# FIRE_TEST_004_JQ: Original C jq v1.7.1 vs LIN-jq Product Benchmark

## 1. Objective & Target Product Scope
* **Target Product:** `jq` (Command-line JSON processor, Original C implementation v1.7.1).
* **Research Question:** When a complete, real-world CLI tool with its own DSL, parser, AST evaluator, and streaming engine is re-implemented in **`@LIN:L2w:1.0`** and compiled to native binaries (Rust, Zig, C), does the end-user receive a measurably superior software product in terms of:
  1. Cold start / CLI invocation latency;
  2. Streaming throughput across multi-GB JSON streams;
  3. Peak memory footprint (RSS);
  4. Binary distribution compactness;
  5. Autonomous maintenance by AI agents (tokens, rebuild locality)?

---

## 2. LIN-jq Architecture (`@LIN:L2w:1.0`)

```lin
@LIN:L2w:1.0
~pipeline JqQueryEngine(stdin_stream: ByteStream, query: string) -> ByteStream {
  $effects = [stdio_read, stdio_write]
  $invariants = [
    requires is_valid_jq_query(query),
    ensures is_valid_json_stream(result)
  ]

  !node QueryParser(q: string) -> CompiledFilterAST {
    $effect = pure
    =port in: string
    =port out: CompiledFilterAST
    ^ret parse_jq_dsl(in)
  }

  !node StreamJsonScanner(stream: ByteStream) -> JsonEventStream {
    $effect = stdio_read
    =port in: ByteStream
    =port out: JsonEventStream
    // Zero-alloc SIMD-accelerated JSON token scanning
    ^ret simd_json_stream_scan(in)
  }

  !node FilterEvaluator(events: JsonEventStream, ast: CompiledFilterAST) -> JsonEventStream {
    $effect = pure
    =port in_events: JsonEventStream
    =port in_ast: CompiledFilterAST
    =port out: JsonEventStream
    ^ret evaluate_filter_pipeline(in_events, in_ast)
  }

  !node JsonFormatter(out_events: JsonEventStream, compact: bool) -> ByteStream {
    $effect = stdio_write
    =port in: JsonEventStream
    =port out: ByteStream
    ^ret serialize_json_stream(in, compact)
  }

  >step QueryParser(query) -> compiled_ast
  >step StreamJsonScanner(stdin_stream) -> raw_events
  >step FilterEvaluator(raw_events, compiled_ast) -> filtered_events
  >step JsonFormatter(filtered_events, true) -> final_output
  ^emit final_output
}
```

---

## 3. The Four Evaluated Workloads
1. **W1 (Cold Start):** 10,000 rapid CLI invocations processing micro JSON payloads (`echo '{"id":1}' | jq .id`).
2. **W2 (5GB Stream):** Continuous processing of a 5.0 GB multi-line JSON log stream (`jq 'select(.status >= 500) | .url'`).
3. **W3 (Deep Nested Aggregation):** Complex queries (`group_by(.user) | map({user: .[0].user, count: length})`) on deep GitHub/Twitter API payloads.
4. **W4 (Agent Maintenance):** 50 consecutive evolution PRs modifying filters, adding date functions, and refactoring AST nodes.
