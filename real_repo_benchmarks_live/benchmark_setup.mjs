/**
 * BENCHMARK RUNNER & REAL EMPIRICAL REPOSITORY EXECUTOR
 * ====================================================
 * STRICT RULE ZERO: ZERO SIMULATION, ZERO SYNTHETIC METRICS, ZERO FAKE DATA.
 *
 * For each repository in the pre-registered manifest:
 *   1. Clones actual repository from git remote if not present
 *   2. Checks out frozen commit SHA
 *   3. Installs dependencies & runs clean build
 *   4. Runs baseline test suite (T_old)
 *   5. Runs real physical benchmark for 30 runs using hrtime.bigint() -> emits CSV
 *   6. Executes real mutation / patch candidates
 *   7. Runs T_old and hidden T_new suites
 *   8. Emits real physical logs, CSVs, and diffs to disk
 *   9. Records INFRASTRUCTURE_FAILURE if a build fails or network/toolchain fails
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const ROOT_DIR = resolve("c:/Users/kbell/OneDrive/Documents/lia");
const BENCH_DIR = join(ROOT_DIR, "real_repo_benchmarks_live");

// Ensure structure
const DIRS = ["repos", "executions", "hidden_suites", "raw_measurements", "diffs", "logs", "provenance", "statistical_analysis"];
for (const d of DIRS) {
  const p = join(BENCH_DIR, d);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// Write environment manifest
const envInfo = {
  os: process.platform,
  arch: process.arch,
  node: process.version,
  cwd: ROOT_DIR,
  timestamp_start: new Date().toISOString()
};
writeFileSync(join(BENCH_DIR, "environment.json"), JSON.stringify(envInfo, null, 2), "utf8");

export const MANIFEST_10_REPOS = [
  {
    id: "repo_01_ms",
    name: "vercel/ms",
    git_url: "https://github.com/vercel/ms.git",
    frozen_commit: "v2.1.3",
    ecosystem: "JAVASCRIPT",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_02_p_map",
    name: "sindresorhus/p-map",
    git_url: "https://github.com/sindresorhus/p-map.git",
    frozen_commit: "v7.0.3",
    ecosystem: "JAVASCRIPT",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_03_execa",
    name: "sindresorhus/execa",
    git_url: "https://github.com/sindresorhus/execa.git",
    frozen_commit: "v9.5.2",
    ecosystem: "JAVASCRIPT",
    primary_metric: "P95_LATENCY_MS",
    metric_direction: "lower_is_better"
  },
  {
    id: "repo_04_got",
    name: "sindresorhus/got",
    git_url: "https://github.com/sindresorhus/got.git",
    frozen_commit: "v14.4.5",
    ecosystem: "TYPESCRIPT",
    primary_metric: "PEAK_MEMORY_BYTES",
    metric_direction: "lower_is_better"
  },
  {
    id: "repo_05_nanoid",
    name: "ai/nanoid",
    git_url: "https://github.com/ai/nanoid.git",
    frozen_commit: "5.0.9",
    ecosystem: "JAVASCRIPT",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_06_axios",
    name: "axios/axios",
    git_url: "https://github.com/axios/axios.git",
    frozen_commit: "v1.7.9",
    ecosystem: "JAVASCRIPT",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_07_fastify",
    name: "fastify/fastify",
    git_url: "https://github.com/fastify/fastify.git",
    frozen_commit: "v5.2.1",
    ecosystem: "JAVASCRIPT",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_08_express",
    name: "expressjs/express",
    git_url: "https://github.com/expressjs/express.git",
    frozen_commit: "4.21.2",
    ecosystem: "JAVASCRIPT",
    primary_metric: "P95_LATENCY_MS",
    metric_direction: "lower_is_better"
  },
  {
    id: "repo_09_bytecount",
    name: "BurntSushi/bytecount",
    git_url: "https://github.com/BurntSushi/bytecount.git",
    frozen_commit: "0.6.8",
    ecosystem: "RUST",
    primary_metric: "THROUGHPUT_OPS_SEC",
    metric_direction: "higher_is_better"
  },
  {
    id: "repo_10_requests",
    name: "psf/requests",
    git_url: "https://github.com/psf/requests.git",
    frozen_commit: "v2.32.3",
    ecosystem: "PYTHON",
    primary_metric: "P95_LATENCY_MS",
    metric_direction: "lower_is_better"
  }
];

writeFileSync(join(BENCH_DIR, "manifest.json"), JSON.stringify(MANIFEST_10_REPOS, null, 2), "utf8");

export function runShell(cmd, cwd, logFilePrefix) {
  const startTime = Date.now();
  try {
    const stdout = execSync(`cmd.exe /c "${cmd}"`, {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180000 // 3 min timeout
    });
    if (logFilePrefix) {
      writeFileSync(`${logFilePrefix}.stdout.log`, stdout, "utf8");
    }
    return { success: true, stdout, stderr: "", exitCode: 0, durationMs: Date.now() - startTime };
  } catch (err) {
    if (logFilePrefix) {
      writeFileSync(`${logFilePrefix}.stdout.log`, err.stdout || "", "utf8");
      writeFileSync(`${logFilePrefix}.stderr.log`, err.stderr || err.message, "utf8");
    }
    return {
      success: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
      durationMs: Date.now() - startTime
    };
  }
}
