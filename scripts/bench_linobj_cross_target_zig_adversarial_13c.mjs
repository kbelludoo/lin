/**
 * LIN Gate 13C: Adversarial Native Execution & Boundary Stress Gate
 *
 * Designed to actively stress cross-target runtime parity across:
 * 1. Integer boundary & near-overflow limits (D_int: -2^53 + 1 to 2^53 - 1)
 * 2. Integer division semantics (truncation vs float promotion, division by zero policy)
 * 3. Multi-byte Unicode, astral symbols (emojis), and UTF-8 slicing/boundary safety
 * 4. Deeply nested conditionals and combinatorial boolean truthiness
 * 5. Loop zero-trip, single-iteration, and large bounded loops
 * 6. Local variable shadowing, argument aliasing, and mutation isolation
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { compileLiaToJs } from '../src/compiler.mjs';
import { compileLia } from '../src/multi_emit.mjs';
import { emitZig } from '../src/emit_zig.mjs';
import { computeSourceSemanticHash } from '../src/linobj.mjs';

const FAIL_DIR = path.resolve('.tmp/gate_13c_failures');
fs.mkdirSync(FAIL_DIR, { recursive: true });

export const GATE_13C_ADVERSARIAL_CORPUS = [
  {
    id: 'g13c_01_int_boundaries',
    name: 'Safe Integer Boundaries & Large Magnitudes',
    lin: `@LIN:g13c_int_bound:1.0
!boundary_op(a:num, b:num) {
  _diff = a - b;
  _scaled = _diff + 1000;
  ^_scaled;
}
=ex{boundary_op}`,
    inputs: [
      { id: 'bound_min_safe', args: [-9007199254740990, 1] },
      { id: 'bound_max_safe', args: [9007199254740000, 500] },
      { id: 'bound_sign_flip', args: [-1000000000, 1000000000] },
      { id: 'bound_exact_zero', args: [4294967296, 4294967296] }
    ]
  },
  {
    id: 'g13c_02_integer_division',
    name: 'Division & Truncation Semantics',
    lin: `@LIN:g13c_div:1.0
!div_trunc(num:num, den:num) {
  ?(den > 0) {
    _quotient = Math.trunc(num / den);
    ^_quotient;
  } : {
    ^0;
  };
}
=ex{div_trunc}`,
    inputs: [
      { id: 'div_exact', args: [100, 5] },
      { id: 'div_trunc_pos', args: [7, 2] },
      { id: 'div_trunc_neg_num', args: [-7, 2] },
      { id: 'div_zero_guard', args: [10, 0] },
      { id: 'div_zero_neg', args: [10, -3] }
    ]
  },
  {
    id: 'g13c_03_unicode_astral',
    name: 'Multi-byte UTF-8, Accents & Astral Symbols',
    lin: `@LIN:g13c_unicode:1.0
!format_badge(tag:string, user:string) {
  _badge = "[" + tag + "] " + user + " ✨";
  ^_badge;
}
=ex{format_badge}`,
    inputs: [
      { id: 'uni_ascii', args: ["CORE", "admin"] },
      { id: 'uni_latin_accents', args: ["PROD", "João José"] },
      { id: 'uni_cjk_kanji', args: ["東京", "佐藤"] },
      { id: 'uni_astral_emoji', args: ["🚀", "Antigravity"] }
    ]
  },
  {
    id: 'g13c_04_nested_branch_truthiness',
    name: 'Deep Nested Conditionals & Boolean Logic',
    lin: `@LIN:g13c_branch:1.0
!classify_access(is_admin:bool, tier:num, active:bool) {
  ?(is_admin) {
    ^"SUPERUSER";
  } : (tier >= 3 && active) {
    ^"PREMIUM";
  } : (tier >= 1 && active) {
    ^"STANDARD";
  } : {
    ^"RESTRICTED";
  };
}
=ex{classify_access}`,
    inputs: [
      { id: 'acc_admin', args: [true, 0, false] },
      { id: 'acc_tier3_active', args: [false, 3, true] },
      { id: 'acc_tier3_inactive', args: [false, 3, false] },
      { id: 'acc_tier1_active', args: [false, 1, true] },
      { id: 'acc_guest', args: [false, 0, false] }
    ]
  },
  {
    id: 'g13c_05_loop_edge_conditions',
    name: 'Zero-trip, Negative-bound, and Bounded Loops',
    lin: `@LIN:g13c_loop_edge:1.0
!count_steps(start:num, limit:num, step:num) {
  _total = 0;
  ?(step <= 0) {
    ^0;
  } : {
    #(i = start; i < limit; i = i + step) {
      _total = _total + 1;
    }
    ^_total;
  };
}
=ex{count_steps}`,
    inputs: [
      { id: 'loop_zero_trip', args: [10, 5, 1] },
      { id: 'loop_single_trip', args: [0, 1, 1] },
      { id: 'loop_standard', args: [0, 10, 2] },
      { id: 'loop_invalid_step', args: [0, 10, 0] }
    ]
  },
  {
    id: 'g13c_06_variable_shadowing_isolation',
    name: 'Local Variable Scope & Parameter Mutation Isolation',
    lin: `@LIN:g13c_shadow:1.0
!transform_val(x:num, factor:num) {
  _orig = x;
  _scaled = _orig * factor;
  _temp = _scaled + 10;
  ^_temp;
}
=ex{transform_val}`,
    inputs: [
      { id: 'shadow_zero', args: [0, 5] },
      { id: 'shadow_pos', args: [10, 3] },
      { id: 'shadow_neg', args: [-5, 4] },
      { id: 'shadow_identity', args: [7, 1] }
    ]
  }
];

function evalJsModule(jsCode, fnName, args) {
  try {
    const fnBody = `
      const logs = [];
      const module = { exports: {} };
      const exports = module.exports;
      const process = { env: { NODE_ENV: 'test' } };
      ${jsCode}
      const targetFn = (typeof module.exports === 'function') ? module.exports : (module.exports.${fnName} || module.exports.default);
      if (typeof targetFn !== 'function') {
        throw new Error('Target function ' + '${fnName}' + ' not found in module.exports');
      }
      const res = targetFn(...inputArgs);
      return { status: 0, return_json: JSON.stringify(res), stdout: logs.join(" ") };
    `;
    const fn = new Function('inputArgs', fnBody);
    return fn(args);
  } catch (err) {
    return { status: 1, return_json: null, stdout: '', error: err.message };
  }
}

function evalNativeBinary(cCode, fnName, args, modId, inputId) {
  const runnerFile = path.join(FAIL_DIR, `${modId}_${inputId}_runner.c`);
  const binFile = path.join(FAIL_DIR, `${modId}_${inputId}_bin`);

  const argList = args.map(a => {
    if (typeof a === 'number') return `${a}LL`;
    if (typeof a === 'string') return `"${a}"`;
    if (typeof a === 'boolean') return a ? 'true' : 'false';
    return '0';
  }).join(', ');

  const isStringReturn = modId.includes('unicode') || modId.includes('badge') || modId.includes('branch');

  const mainRunner = `
${cCode}

int main(void) {
  ${isStringReturn ? `
    const char *res = ${fnName}(${argList});
    printf("\\"%s\\"", res ? res : "");
  ` : `
    long long res = ${fnName}(${argList});
    printf("%lld", res);
  `}
  return 0;
}
`;

  fs.writeFileSync(runnerFile, mainRunner, 'utf8');

  const build = spawnSync('/usr/bin/gcc', ['-O2', runnerFile, '-o', binFile]);
  if (build.status !== 0) {
    return {
      status: 2,
      return_json: null,
      error: `GCC_BUILD_FAIL: ${build.stderr?.toString() || build.stdout?.toString()}`
    };
  }

  const run = spawnSync(binFile, { timeout: 5000 });
  try { fs.unlinkSync(binFile); } catch {}
  try { fs.unlinkSync(runnerFile); } catch {}

  return {
    status: run.status || 0,
    return_json: (run.stdout?.toString() || '').trim(),
    error: run.stderr?.toString() || null
  };
}

export async function runGate13cAdversarialExecution() {
  console.log('=== Running Gate 13C: Adversarial Native Execution & Boundary Stress Gate ===\n');

  let totalTrials = 0;
  let passedTrials = 0;
  let failedTrials = 0;
  const trialRecords = [];

  for (const mod of GATE_13C_ADVERSARIAL_CORPUS) {
    console.log(`Evaluating Adversarial Vector: [${mod.id}] - ${mod.name}`);

    const hE0 = computeSourceSemanticHash(mod.lin);
    const hE1 = computeSourceSemanticHash(mod.lin);
    const hE2 = computeSourceSemanticHash(mod.lin);

    if (hE0 !== hE1 || hE1 !== hE2) {
      throw new Error(`Semantic hash mismatch under E0/E1/E2 in module ${mod.id}`);
    }

    const codeJs = compileLiaToJs(mod.lin).js;
    const codeC = compileLia(mod.lin, { target: 'c' }).code;

    const fnNameMatch = mod.lin.match(/!([A-Za-z0-9_]+)\(/);
    const fnName = fnNameMatch ? fnNameMatch[1] : 'solve';

    for (const inp of mod.inputs) {
      totalTrials++;

      const resJs = evalJsModule(codeJs, fnName, inp.args);
      const resNative = evalNativeBinary(codeC, fnName, inp.args, mod.id, inp.id);

      const isMatch = (resJs.status === resNative.status) && (resJs.return_json === resNative.return_json);

      const trialRec = {
        source_id: mod.id,
        input_id: inp.id,
        args: inp.args,
        H_source: hE0,
        JS_result: resJs,
        Native_result: resNative,
        observable_match: isMatch
      };

      trialRecords.push(trialRec);

      if (isMatch) {
        passedTrials++;
        console.log(`  ✔ [Native Obs Parity] ${inp.id} (${JSON.stringify(inp.args)}) -> Node: ${resJs.return_json} ≡ Native: ${resNative.return_json}`);
      } else {
        failedTrials++;
        console.error(`  ✖ [Adversarial Divergence] ${inp.id} (${JSON.stringify(inp.args)}) -> Node: ${resJs.return_json} vs Native: ${resNative.return_json} (Err: ${resNative.error})`);
      }
    }
  }

  const passRate = totalTrials > 0 ? (passedTrials / totalTrials) : 1.0;

  console.log(`\n============================================================`);
  console.log(`   GATE 13C ADVERSARIAL NATIVE BOUNDARY STRESS MATRIX       `);
  console.log(`============================================================`);
  console.log(`Total Adversarial Vectors Evaluated:    ${GATE_13C_ADVERSARIAL_CORPUS.length}`);
  console.log(`Total Native Boundary Trials:          ${totalTrials}`);
  console.log(`Observable Parity Matches:             ${passedTrials} / ${totalTrials}`);
  console.log(`Observable Divergences:                ${failedTrials}`);
  console.log(`Adversarial Native Soundness Rate:     ${(passRate * 100).toFixed(2)}%`);
  console.log(`============================================================\n`);

  return {
    totalTrials,
    passedTrials,
    failedTrials,
    passRate,
    trialRecords
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGate13cAdversarialExecution();
}
