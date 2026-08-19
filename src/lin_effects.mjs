/**
 * LIN Algebraic Effects — Koka/Eff style.
 *
 * Every function in LIN can declare its effects:
 *   !fn(x) ~effects{io, state, async} { ... }
 *
 * Pure functions (no effects) are guaranteed deterministic and cacheable.
 * Effects can be intercepted, mocked, and audited by handlers.
 *
 * Built-in effect types:
 *   pure    — no side effects (default)
 *   io      — file system, network, stdout
 *   state   — mutable state
 *   async   — asynchronous / concurrent
 *   fail    — can throw/panic
 *   random  — non-deterministic
 *   time    — reads system clock
 *   agent   — inter-agent communication
 */

export const EFFECT_TYPES = [
  'pure', 'io', 'state', 'async', 'fail', 'random', 'time', 'agent',
];

/**
 * Infer effects from a function body by static analysis.
 */
export function inferEffects(body, params) {
  const effects = new Set();
  const s = String(body || '');

  // IO detection
  if (/\b(fs|path|http|https|net|fetch|console|process\.stdout|process\.stderr|readFile|writeFile|Bun\.file|Deno\.read)\b/.test(s)) {
    effects.add('io');
  }
  if (/\bprint\b|\bconsole\.\b/.test(s)) effects.add('io');

  // State mutation detection
  if (/\bthis\.\b/.test(s)) effects.add('state');
  if (/\bglobal\b|\bwindow\b|\bglobalThis\b/.test(s)) effects.add('state');

  // Async detection
  if (/\bawait\b|\basync\b|\bPromise\b|\bsetTimeout\b|\bsetInterval\b/.test(s)) effects.add('async');

  // Fail detection
  if (/\bthrow\b|\bpanic\b|\braise\b|\berror\b/.test(s)) effects.add('fail');

  // Random detection
  if (/\bMath\.random\b|\bcrypto\.random\b|\brand\b|\brandom\b/.test(s)) effects.add('random');

  // Time detection
  if (/\bDate\.now\b|\bnew Date\b|\bperformance\.now\b|\bprocess\.hrtime\b/.test(s)) effects.add('time');

  // Agent communication detection
  if (/\bpostMessage\b|\bworker\b|\bspawn\b|\bsend\b|\breceive\b/.test(s)) effects.add('agent');

  if (effects.size === 0) effects.add('pure');

  return [...effects];
}

/**
 * Validate that declared effects match inferred effects.
 * Returns violations (inferred but not declared).
 */
export function validateEffects(declared, inferred) {
  const declSet = new Set(declared || []);
  if (declSet.has('pure') && declSet.size === 1) {
    // Declared pure — any non-pure inferred effect is a violation
    return inferred.filter((e) => e !== 'pure');
  }
  // Check for undeclared effects
  return inferred.filter((e) => e !== 'pure' && !declSet.has(e));
}

/**
 * Create an effect handler that intercepts specific effects.
 * Used for sandboxing, mocking, and auditing agent behavior.
 */
export function createEffectHandler(effectType, handler) {
  return {
    effect: effectType,
    handle: handler,
    intercept: true,
    log: [],
    wrap(fn) {
      const self = this;
      return function (...args) {
        self.log.push({ effect: effectType, args, ts: Date.now() });
        if (self.intercept && self.handle) {
          return self.handle(fn, args);
        }
        return fn(...args);
      };
    },
  };
}

/**
 * Emit effect annotations as comments/metadata in target code.
 */
export function emitEffectAnnotation(effects, target) {
  const effs = (effects || ['pure']).join(', ');
  if (target === 'js' || target === 'ts') return `/* @effects: ${effs} */`;
  if (target === 'py') return `# @effects: ${effs}`;
  if (target === 'go') return `// @effects: ${effs}`;
  if (target === 'rust') return `// @effects: ${effs}`;
  if (target === 'java') return `/** @effects: ${effs} */`;
  if (target === 'haskell') return `{- @effects: ${effs} -}`;
  return `// @effects: ${effs}`;
}
