/**
 * LIN Actor Supervision Tree — Gleam/Erlang OTP style.
 *
 * Provides lightweight actor processes with supervision strategies
 * for fault-tolerant multi-agent orchestration.
 *
 * Supervision strategies:
 *   one_for_one  — restart only the failed child
 *   one_for_all  — restart all children if one fails
 *   rest_for_one — restart the failed child and all children started after it
 *
 * Reference Capabilities (Pony style):
 *   iso  — isolated, only one reference (transferable, no aliasing)
 *   val  — deeply immutable (shareable across actors, zero-copy reads)
 *   ref  — mutable but thread-local (not shareable)
 *   tag  — opaque identity only (no read/write, only comparison)
 */

export const STRATEGY = {
  ONE_FOR_ONE: 'one_for_one',
  ONE_FOR_ALL: 'one_for_all',
  REST_FOR_ONE: 'rest_for_one',
};

export const REFCAP = {
  ISO: 'iso',   // Isolated: sole reference, transferable
  VAL: 'val',   // Immutable: shareable, zero-copy
  REF: 'ref',   // Mutable: thread-local only
  TAG: 'tag',   // Identity only: no read/write
};

let actorIdCounter = 0;

/**
 * Create a lightweight actor (process) with a message handler.
 */
export function spawnActor(name, handler, opts = {}) {
  const id = `actor_${++actorIdCounter}_${name}`;
  const mailbox = [];
  let alive = true;
  let restartCount = 0;
  const maxRestarts = opts.maxRestarts || 5;
  const refcap = opts.refcap || REFCAP.VAL;

  const actor = {
    id,
    name,
    alive,
    refcap,
    restartCount,
    mailbox,

    send(msg) {
      if (!actor.alive) return { ok: false, reason: 'dead' };
      if (refcap === REFCAP.ISO) {
        // ISO: deep clone to enforce isolation
        mailbox.push(JSON.parse(JSON.stringify(msg)));
      } else if (refcap === REFCAP.VAL) {
        // VAL: freeze to enforce immutability
        mailbox.push(Object.freeze(msg));
      } else {
        mailbox.push(msg);
      }
      return { ok: true };
    },

    async process() {
      while (mailbox.length > 0 && actor.alive) {
        const msg = mailbox.shift();
        try {
          await handler(msg, actor);
        } catch (err) {
          actor.lastError = err;
          actor.alive = false;
          return { ok: false, error: String(err.message || err), actor: id };
        }
      }
      return { ok: true, actor: id, processed: true };
    },

    restart() {
      if (restartCount >= maxRestarts) {
        return { ok: false, reason: 'max_restarts_exceeded', actor: id };
      }
      restartCount++;
      actor.restartCount = restartCount;
      actor.alive = true;
      actor.lastError = null;
      return { ok: true, restarts: restartCount, actor: id };
    },

    kill() {
      actor.alive = false;
      mailbox.length = 0;
    },

    status() {
      return {
        id, name, alive: actor.alive, refcap, restartCount,
        mailboxSize: mailbox.length, lastError: actor.lastError || null,
      };
    },
  };

  return actor;
}

/**
 * Create a supervision tree that monitors and restarts child actors.
 */
export function createSupervisor(name, strategy = STRATEGY.ONE_FOR_ONE, opts = {}) {
  const children = [];
  const maxRestarts = opts.maxRestarts || 10;
  let totalRestarts = 0;

  const supervisor = {
    name,
    strategy,

    addChild(actor) {
      children.push(actor);
      return supervisor;
    },

    async processAll() {
      const results = [];
      for (const child of children) {
        if (!child.alive) continue;
        const r = await child.process();
        if (!r.ok) {
          results.push(r);
          await supervisor.handleFailure(child);
        } else {
          results.push(r);
        }
      }
      return results;
    },

    async handleFailure(failedChild) {
      if (totalRestarts >= maxRestarts) {
        // Supervisor itself gives up
        for (const c of children) c.kill();
        return { ok: false, reason: 'supervisor_max_restarts' };
      }

      if (strategy === STRATEGY.ONE_FOR_ONE) {
        const r = failedChild.restart();
        if (r.ok) totalRestarts++;
        return r;
      }

      if (strategy === STRATEGY.ONE_FOR_ALL) {
        for (const c of children) {
          c.kill();
          c.restart();
        }
        totalRestarts++;
        return { ok: true, strategy, restarted: children.map((c) => c.id) };
      }

      if (strategy === STRATEGY.REST_FOR_ONE) {
        const idx = children.indexOf(failedChild);
        for (let i = idx; i < children.length; i++) {
          children[i].kill();
          children[i].restart();
        }
        totalRestarts++;
        return { ok: true, strategy, restarted: children.slice(idx).map((c) => c.id) };
      }

      return { ok: false, reason: 'unknown_strategy' };
    },

    status() {
      return {
        name, strategy, totalRestarts,
        children: children.map((c) => c.status()),
      };
    },
  };

  return supervisor;
}
