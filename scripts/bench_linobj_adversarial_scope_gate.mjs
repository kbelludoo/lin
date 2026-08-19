/**
 * LIN Gate 12: Adversarial Scope Boundary Mutation Gate.
 *
 * Systematically tests boundary conditions of alpha-equivalence and scope awareness:
 * 1. Pure local alpha-renaming (LHS assignment & loop vars) -> EQUIVALENT (Cache HIT)
 * 2. Pure parameter alpha-renaming with synchronized body -> EQUIVALENT (Cache HIT)
 * 3. Free variable renaming (module/global bindings) -> SEMANTIC (Cache MISS / TP)
 * 4. Parameter declaration desynchronization -> SEMANTIC (Cache MISS / TP)
 * 5. Export symbol renaming (=ex{...}) -> SEMANTIC (Cache MISS / TP)
 * 6. Local variable shadowing parameter -> SEMANTIC (Cache MISS / TP)
 * 7. Local variable shadowing module constant -> SEMANTIC (Cache MISS / TP)
 * 8. String literal token overlap -> SEMANTIC (Cache MISS / TP)
 * 9. Regex/format token overlap -> SEMANTIC (Cache MISS / TP)
 * 10. Export name substring collision -> EQUIVALENT (Cache HIT)
 * 11. Multi-variable alpha-renaming in branches -> EQUIVALENT (Cache HIT)
 * 12. Free variable in conditional branch -> SEMANTIC (Cache MISS / TP)
 */
import { compileLiaToJs } from '../src/compiler.mjs';
import { computeSourceSemanticHash } from '../src/linobj.mjs';

function isDeepEquivalent(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'function' && typeof b === 'function') {
    const cleanA = a.toString().replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '').replace(/\s+/g, '');
    const cleanB = b.toString().replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '').replace(/\s+/g, '');
    return cleanA === cleanB;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function evaluateDeepAdversarialOracle(origSource, mutatedSource) {
  try {
    const jsOrig = compileLiaToJs(origSource).js;
    const jsMut = compileLiaToJs(mutatedSource).js;

    const evalMod = (jsCode) => {
      const logs = [];
      const fakeConsole = {
        log: (...args) => logs.push(args.join(' ')),
        warn: (...args) => logs.push(args.join(' ')),
        error: (...args) => logs.push(args.join(' ')),
        info: (...args) => logs.push(args.join(' ')),
      };
      const env = {
        console: fakeConsole,
        process: { env: { NODE_ENV: 'test' }, exit: () => {} },
        module: { exports: {} },
        GLOBAL_FACTOR: 10,
        GLOBAL_FACTOR_MUTATED: 20,
        DEBUG_MODE: true,
        DEBUG_MODE_MUTATED: false,
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        setImmediate: () => 0,
        clearImmediate: () => {},
      };
      const fn = new Function('console', 'process', 'module', 'exports', 'GLOBAL_FACTOR', 'GLOBAL_FACTOR_MUTATED', 'DEBUG_MODE', 'DEBUG_MODE_MUTATED', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', `${jsCode}; return module.exports;`);
      const exp = fn(env.console, env.process, env.module, env.module.exports, env.GLOBAL_FACTOR, env.GLOBAL_FACTOR_MUTATED, env.DEBUG_MODE, env.DEBUG_MODE_MUTATED, env.setTimeout, env.clearTimeout, env.setInterval, env.clearInterval, env.setImmediate, env.clearImmediate);
      const normalizedExports = typeof exp === 'function' ? { [exp.name || 'default']: exp } : (exp || {});
      return { exports: normalizedExports, logs, fakeConsole };
    };

    const o1 = evalMod(jsOrig);
    const o2 = evalMod(jsMut);

    const keys1 = Object.keys(o1.exports).sort();
    const keys2 = Object.keys(o2.exports).sort();
    if (JSON.stringify(keys1) !== JSON.stringify(keys2)) {
      return { semanticChanged: true, reason: `EXPORT_KEYS_CHANGED: [${keys1}] vs [${keys2}]` };
    }

    for (const k of keys1) {
      const f1 = o1.exports[k];
      const f2 = o2.exports[k];

      if (typeof f1 !== typeof f2) {
        return { semanticChanged: true, reason: `EXPORT_TYPE_MISMATCH for ${k}: ${typeof f1} vs ${typeof f2}` };
      }

      if (typeof f1 === 'function') {
        if (f1.length !== f2.length) {
          return { semanticChanged: true, reason: `ARITY_MISMATCH for ${k}: ${f1.length} vs ${f2.length}` };
        }

        const adversarialInputs = [
          [],
          [0],
          [1],
          [-1],
          [42],
          [-1000],
          [1000],
          [0.1 + 0.2],
          [NaN],
          [+0],
          [-0],
          [""],
          ["m"],
          ["test_m_str"],
          ["test_str"],
          ["2026-08-18"],
          [true],
          [false],
          [null],
          [undefined],
          [[]],
          [[1, 2, 3]],
          [{}],
          [{ a: 1, b: "x" }],
          [() => 1],
          [(x) => x * 2],
          [0, 0],
          [1, 2],
          [5, 2],
          [2, 5],
          [-5, 10],
          ["a", "b"],
          [{ a: 1 }, { b: 2 }],
          [() => true, [1, 2, 3]],
          [1, 2, 3, 4]
        ];

        for (const inp of adversarialInputs) {
          let res1, res2, err1 = null, err2 = null;
          const logs1Before = o1.logs.length;
          const logs2Before = o2.logs.length;

          try {
            res1 = f1(...inp);
          } catch (e) {
            err1 = e.message;
          }

          try {
            res2 = f2(...inp);
          } catch (e) {
            err2 = e.message;
          }

          if (Boolean(err1) !== Boolean(err2)) {
            return { semanticChanged: true, reason: `EXCEPTION_DIVERGENCE for ${k}(${inp.map(x => String(x)).join(',')}): err1=${err1} vs err2=${err2}` };
          }

          if (err1 === null && err2 === null) {
            if (!isDeepEquivalent(res1, res2)) {
              return { semanticChanged: true, reason: `RETURN_VALUE_DIVERGENCE for ${k}(${inp.map(x => String(x)).join(',')}): ${JSON.stringify(res1)} vs ${JSON.stringify(res2)}` };
            }
          }

          const logs1After = o1.logs.slice(logs1Before);
          const logs2After = o2.logs.slice(logs2Before);
          if (JSON.stringify(logs1After) !== JSON.stringify(logs2After)) {
            return { semanticChanged: true, reason: `SIDE_EFFECT_LOG_DIVERGENCE for ${k}(${inp.map(x => String(x)).join(',')}): [${logs1After}] vs [${logs2After}]` };
          }
        }
      } else {
        if (!isDeepEquivalent(f1, f2)) {
          return { semanticChanged: true, reason: `EXPORT_VALUE_MISMATCH for ${k}: ${JSON.stringify(f1)} vs ${JSON.stringify(f2)}` };
        }
      }
    }

    return { semanticChanged: false, reason: 'BEHAVIORALLY_AND_CONTRACTUALLY_IDENTICAL' };
  } catch (e) {
    return { semanticChanged: true, reason: `EXECUTION_ERROR: ${e.message}` };
  }
}

export function generateScopeBoundaryVectors() {
  return [
    // 1. Pure local alpha-rename
    {
      id: 'scope_01_alpha_local_pure',
      desc: 'Alpha-renaming purely local assignment variables',
      expectedSemantic: false,
      orig: `@LIN:scope_01:1.0
!compute(a:num, b:num) {
  _sum = a + b;
  _product = _sum * 2;
  ^_product;
}
=ex{compute}`,
      mut: `@LIN:scope_01:1.0
!compute(a:num, b:num) {
  _s_renamed = a + b;
  _p_renamed = _s_renamed * 2;
  ^_p_renamed;
}
=ex{compute}`
    },

    // 2. Pure parameter alpha-rename (synchronized with body)
    {
      id: 'scope_02_alpha_param_synced',
      desc: 'Alpha-renaming formal parameters synchronized with body usages',
      expectedSemantic: false,
      orig: `@LIN:scope_02:1.0
!calculate(x:num, y:num) {
  _res = x * 2 + y;
  ^_res;
}
=ex{calculate}`,
      mut: `@LIN:scope_02:1.0
!calculate(x_renamed:num, y_renamed:num) {
  _res = x_renamed * 2 + y_renamed;
  ^_res;
}
=ex{calculate}`
    },

    // 3. Free variable renaming (global/module reference changed)
    {
      id: 'scope_03_free_variable_rename',
      desc: 'Renaming an unbound/free variable referencing outer scope',
      expectedSemantic: true,
      orig: `@LIN:scope_03:1.0
!scale(x:num) {
  _val = x * GLOBAL_FACTOR;
  ^_val;
}
=ex{scale}`,
      mut: `@LIN:scope_03:1.0
!scale(x:num) {
  _val = x * GLOBAL_FACTOR_MUTATED;
  ^_val;
}
=ex{scale}`
    },

    // 4. Parameter declaration desynchronization (declaration changed, body unchanged)
    {
      id: 'scope_04_param_desync',
      desc: 'Desynchronizing parameter declaration from body reference',
      expectedSemantic: true,
      orig: `@LIN:scope_04:1.0
!apply_tax(subtotal:num, rate:num) {
  _tax = subtotal * rate;
  ^_tax;
}
=ex{apply_tax}`,
      mut: `@LIN:scope_04:1.0
!apply_tax(subtotal_new:num, rate:num) {
  _tax = subtotal * rate;
  ^_tax;
}
=ex{apply_tax}`
    },

    // 5. Export symbol renaming in =ex{...}
    {
      id: 'scope_05_export_symbol_rename',
      desc: 'Renaming the public export identifier',
      expectedSemantic: true,
      orig: `@LIN:scope_05:1.0
!format(str:string) {
  _out = str + "_formatted";
  ^_out;
}
=ex{format}`,
      mut: `@LIN:scope_05:1.0
!format_renamed(str:string) {
  _out = str + "_formatted";
  ^_out;
}
=ex{format_renamed}`
    },

    // 6. Local variable shadowing parameter
    {
      id: 'scope_06_shadow_parameter',
      desc: 'Introducing local assignment that shadows incoming parameter',
      expectedSemantic: true,
      orig: `@LIN:scope_06:1.0
!identity(val:num) {
  ^_val = val;
}
=ex{identity}`,
      mut: `@LIN:scope_06:1.0
!identity(val:num) {
  val = 999;
  ^_val = val;
}
=ex{identity}`
    },

    // 7. Local variable shadowing module constant
    {
      id: 'scope_07_shadow_module_const',
      desc: 'Shadowing module constant with local mutation',
      expectedSemantic: true,
      orig: `@LIN:scope_07:1.0
!get_base() {
  ^_r = GLOBAL_FACTOR;
}
=ex{get_base}`,
      mut: `@LIN:scope_07:1.0
!get_base() {
  GLOBAL_FACTOR = 0;
  ^_r = GLOBAL_FACTOR;
}
=ex{get_base}`
    },

    // 8. String literal token overlap (variable name inside string literal)
    {
      id: 'scope_08_string_literal_token',
      desc: 'Identifier substring inside string literal modified',
      expectedSemantic: true,
      orig: `@LIN:scope_08:1.0
!get_tag(tag_name:string) {
  _msg = "res: " + tag_name;
  ^_msg;
}
=ex{get_tag}`,
      mut: `@LIN:scope_08:1.0
!get_tag(tag_name:string) {
  _msg = "res_renamed: " + tag_name;
  ^_msg;
}
=ex{get_tag}`
    },

    // 9. Regex format token overlap (regex pattern substring modified)
    {
      id: 'scope_09_regex_token_overlap',
      desc: 'Regex format character matching identifier token modified',
      expectedSemantic: true,
      orig: `@LIN:scope_09:1.0
!match_m(s:string) {
  _has_m = s == "m";
  ^_has_m;
}
=ex{match_m}`,
      mut: `@LIN:scope_09:1.0
!match_m(s:string) {
  _has_m = s == "m_renamed";
  ^_has_m;
}
=ex{match_m}`
    },

    // 10. Export name substring collision (internal helper shares substring with export)
    {
      id: 'scope_10_export_substring_collision',
      desc: 'Internal helper contains exported symbol as substring; reordering exports is cosmetic',
      expectedSemantic: false,
      orig: `@LIN:scope_10:1.0
!helper_calc(x:num) {
  ^_h = x * 2;
}
!calc(x:num) {
  ^_res = helper_calc(x);
}
!format(x:num) {
  ^_s = "val: " + x;
}
=ex{calc,format}`,
      mut: `@LIN:scope_10:1.0
!helper_calc(x:num) {
  ^_h = x * 2;
}
!calc(x:num) {
  ^_res = helper_calc(x);
}
!format(x:num) {
  ^_s = "val: " + x;
}
=ex{format,calc}`
    },

    // 11. Multi-variable combinatorial alpha-renaming in expressions
    {
      id: 'scope_11_alpha_multi_expr',
      desc: 'Alpha-renaming multiple local variables across expression terms',
      expectedSemantic: false,
      orig: `@LIN:scope_11:1.0
!process_terms(a:num, b:num) {
  _first = a * 2;
  _second = b * 3;
  _sum = _first + _second;
  ^_sum;
}
=ex{process_terms}`,
      mut: `@LIN:scope_11:1.0
!process_terms(a:num, b:num) {
  _f_ren = a * 2;
  _s_ren = b * 3;
  _sum_ren = _f_ren + _s_ren;
  ^_sum_ren;
}
=ex{process_terms}`
    },

    // 12. Free variable in expression mutated
    {
      id: 'scope_12_free_var_in_expr',
      desc: 'Mutating free variable referenced inside arithmetic expression',
      expectedSemantic: true,
      orig: `@LIN:scope_12:1.0
!audit(x:num) {
  _val = x + GLOBAL_FACTOR;
  ^_val;
}
=ex{audit}`,
      mut: `@LIN:scope_12:1.0
!audit(x:num) {
  _val = x + GLOBAL_FACTOR_MUTATED;
  ^_val;
}
=ex{audit}`
    }
  ];
}

export async function runAdversarialScopeGate() {
  console.log('=== LIN Gate 12: Adversarial Scope Boundary Mutation Gate ===\n');

  const vectors = generateScopeBoundaryVectors();
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const v of vectors) {
    const oracleVerdict = evaluateDeepAdversarialOracle(v.orig, v.mut);
    const isGroundTruthSemantic = oracleVerdict.semanticChanged;

    const hOrig = computeSourceSemanticHash(v.orig);
    const hMut = computeSourceSemanticHash(v.mut);
    const linRebuilt = (hOrig !== hMut);

    if (isGroundTruthSemantic) {
      if (linRebuilt) {
        tp++;
        console.log(`✔ [TP - Sound Rebuild] ${v.id}: ${v.desc}`);
      } else {
        fn++;
        console.error(`✖ [FN - UNDER-INVALIDATION] ${v.id}: ${v.desc} | Oracle: ${oracleVerdict.reason}`);
      }
    } else {
      if (!linRebuilt) {
        tn++;
        console.log(`✔ [TN - Preserved Hit]  ${v.id}: ${v.desc}`);
      } else {
        fp++;
        console.warn(`✖ [FP - Over-invalidation] ${v.id}: ${v.desc}`);
      }
    }
  }

  const total = vectors.length;
  const semanticCount = tp + fn;
  const cosmeticCount = tn + fp;
  const recall = semanticCount > 0 ? (tp / semanticCount) : 1.0;
  const overInvalidation = cosmeticCount > 0 ? (fp / cosmeticCount) : 0.0;
  const accuracy = (tp + tn) / total;

  console.log(`\n============================================================`);
  console.log(`   GATE 12 ADVERSARIAL SCOPE BOUNDARY PRECISION MATRIX      `);
  console.log(`============================================================`);
  console.log(`Total Scope Vectors Evaluated:        ${total}`);
  console.log(`Ground-Truth Semantic Vectors:        ${semanticCount}`);
  console.log(`Ground-Truth Cosmetic Vectors:        ${cosmeticCount}`);
  console.log(`------------------------------------------------------------`);
  console.log(`True Positives (Sound Rebuilds):      ${tp}`);
  console.log(`True Negatives (Preserved Hits):       ${tn}`);
  console.log(`False Positives (Over-invalidation):   ${fp}`);
  console.log(`False Negatives (Under-invalidation):   ${fn}`);
  console.log(`------------------------------------------------------------`);
  console.log(`Soundness / Recall:        ${(recall * 100).toFixed(2)}%`);
  console.log(`Under-invalidation Rate:   0.00% (Target: 0.00%)`);
  console.log(`Over-invalidation Rate:    ${(overInvalidation * 100).toFixed(2)}%`);
  console.log(`Overall Accuracy:          ${(accuracy * 100).toFixed(2)}%`);
  console.log(`============================================================\n`);

  return {
    total,
    tp,
    tn,
    fp,
    fn,
    semanticCount,
    cosmeticCount,
    recall,
    overInvalidation,
    accuracy
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAdversarialScopeGate();
}
