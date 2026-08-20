#!/usr/bin/env node
/**
 * LIN CLI — lingua ia nativa (canonical). Aliases: lia, ail.
 * Usage: lin compile file.lin|.lia --target ts|js|py|go|rust|c|java [-o out]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitAil, emitAilFile, estTokens, LIN_HEADER } from '../src/emitter.mjs';
import { parseLia } from '../src/compiler.mjs';
import { compileLiaToTargetFile, REAL_TARGETS, DEFAULT_EMIT_TARGET } from '../src/multi_emit.mjs';
import { compileLiaFile } from '../src/compiler.mjs';
import { defaultEmitTarget } from '../scripts/clone_lin_full_repo_gate.mjs';
import { parseRulel, validateComms } from '../src/rulel_parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`lin <command> [args]   (aliases: lia, ail)

Commands:
  emit <file.js|PROJECT.dicel> [-o out.lin]     JS/legacy L0 → LIN
  compile <file.lin|file.lia|file.ail> [--target <t>] [-o out]
       targets: ${REAL_TARGETS.join('|')} (default ${DEFAULT_EMIT_TARGET})
  check <file.lin|file.lia|file.ail>            parse + list fns
  clone-lin [--cycles N] [--stop-file path]     clone→rewrite→improve→publish
  clone-lia ...                                 alias → clone-lin
  improve                                       auto-improve (self-repair → ledger)
  evolve                                        auto-evolve epoch (candidates_only)
  autonomy [--cycles N]                         FULL pipeline until clone-lin 100%
       --clone-cycles N  cap clone retries (default 0=until queue_complete)
       --skip-clone      improve+evolve only
  autonomy-status                               memory + gates snapshot
  agent-ir <file.json>                          JSON Agent IR → LIN validate (no sigils)
  ingest-ir <file.json>                         alias → agent-ir
  ain-lb-clr                                    CLR-001 LIN-only harness (ACCEPT/DENIED)
  rulel-check <file.rulel>                      parse + validate RULEL/COMMS file
  task create <title> [priority]                 create new task (blocker|high|medium|low)
  task claim <id> [agent]                        agent claims task
  task implement <id>                            start implementation
  task verify <id> [hash] [targets_ok]           run verification gates
  task review <id>                               human/agent review
  task finish <id>                               attempt to certify
  task fail <id> [error]                         mark as failed
  task from-bug <bugId> <layer> <cat> <input> <err>  auto-create from fuzzer
  task status                                    show board summary
  version

Policy: WRITE=LIN; on_error=FIX_COMPILER_OUTSIDE_NUCLEUS; LIN_ge_Dicel; RULEL=rules
Stop clone loop: Ctrl+C | --cycles N | --stop-file path
Header emit: ${LIN_HEADER} (dual-read @LIN|@LIA|@AIL)
`);
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) usage();

function takeFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) {
    return { value: argv[i + 1], args: argv.filter((_, j) => j !== i && j !== i + 1) };
  }
  return { value: null, args: argv };
}

function takeOut(argv) {
  return takeFlag(argv, '-o');
}

if (cmd === 'version') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (cmd === 'emit') {
  const { value: out, args } = takeOut(rest);
  const file = args[0];
  if (!file) usage();
  const r = emitAilFile(file, out);
  console.log(JSON.stringify({ out: r.outPath, chars: r.chars, tokens_est: r.tokens_est }, null, 2));
  process.exit(0);
}

if (cmd === 'compile') {
  let argv = rest;
  const outT = takeOut(argv);
  argv = outT.args;
  const tgt = takeFlag(argv, '--target');
  argv = tgt.args;
  let target = tgt.value || defaultEmitTarget() || DEFAULT_EMIT_TARGET;
  argv = argv.filter((a) => {
    if (a.startsWith('--target=')) {
      target = a.slice('--target='.length);
      return false;
    }
    return true;
  });
  const file = argv[0];
  if (!file) usage();
  target = String(target).toLowerCase();
  if (!REAL_TARGETS.includes(target)) {
    console.error(`unsupported target ${target}; want ${REAL_TARGETS.join('|')} (default ${DEFAULT_EMIT_TARGET})`);
    process.exit(2);
  }
  if (target === 'js' && !outT.value) {
    const r = compileLiaFile(file, null);
    console.log(JSON.stringify({ out: r.outPath, target, fns: r.program.fns.map((f) => f.name) }, null, 2));
  } else {
    const r = compileLiaToTargetFile(file, outT.value, { target, stubRuntime: false, withMain: false });
    console.log(
      JSON.stringify({ out: r.outPath, target, fns: r.program.fns.map((f) => f.name) }, null, 2),
    );
  }
  process.exit(0);
}

if (cmd === 'check') {
  const file = rest[0];
  if (!file) usage();
  const text = fs.readFileSync(file, 'utf8');
  const prog = parseLia(text);
  console.log(
    JSON.stringify(
      {
        header: prog.header,
        fns: prog.fns.map((f) => f.name),
        exports: prog.exports,
        consts: prog.consts ? Object.keys(prog.consts) : [],
        tokens_est: estTokens(text),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (cmd === 'autonomy') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'autonomy_run.mjs'), ...rest], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

if (cmd === 'improve' || cmd === 'evolve' || cmd === 'autonomy-status' || cmd === 'status') {
  const { spawnSync } = await import('node:child_process');
  const sub = cmd === 'status' ? 'status' : cmd === 'autonomy-status' ? 'status' : cmd;
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'evolve_loop.mjs'), sub], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

if (cmd === 'clone-lin' || cmd === 'clone_lin' || cmd === 'clone-lia' || cmd === 'clone_lia') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'clone_lin_loop.mjs'), ...rest], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

if (cmd === 'agent-ir' || cmd === 'ingest-ir') {
  const file = rest[0];
  if (!file) usage();
  const { ingestFile } = await import('../src/lin_agent_ir_ingest_load.mjs');
  const result = ingestFile(file);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === 'ain-lb-clr' || cmd === 'ain_lb_clr') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tests', 'ain_lb', 'runner.mjs'), ...rest], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

if (cmd === 'build-meta' || cmd === 'build_meta') {
  const { buildLinmeta } = await import('../scripts/build_linmeta.mjs');
  const targetDir = path.resolve(rest[0] || '.');
  buildLinmeta(targetDir);
  process.exit(0);
}

if (cmd === 'rulel-check') {
  const file = rest[0];
  if (!file) usage();
  const text = fs.readFileSync(file, 'utf8');
  const parsed = parseRulel(text);
  const validation = validateComms(parsed);
  console.log(JSON.stringify({ parsed, validation }, null, 2));
  process.exit(validation.ok ? 0 : 1);
}

if (cmd === 'task') {
  const { mkTaskBoard, mkTask, addTask, getTask, nextId, claim, implement, verify: vrf, review, certify, fail: tFail, createFollowup, tasksByStage, tasksByAgent, boardSummary, fromBug, toJsonTask } = await import('../src/lin_task_engine_load.mjs');
  const sub = rest[0];
  const TASK_FILE = path.join(process.cwd(), '.lin', 'tasks.json');

  function loadBoard() {
    try { return JSON.parse(fs.readFileSync(TASK_FILE, 'utf8')); }
    catch { return mkTaskBoard(); }
  }
  function saveBoard(board) {
    const dir = path.dirname(TASK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASK_FILE, JSON.stringify(board, null, 2));
  }

  if (sub === 'create') {
    const board = loadBoard();
    const id = nextId(board);
    const title = rest[1] || 'unnamed task';
    const priority = rest[2] || 'medium';
    const task = mkTask(id, title, priority);
    addTask(board, task);
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(task), null, 2));
    process.exit(0);
  } else if (sub === 'claim') {
    const board = loadBoard();
    const id = rest[1]; const agent = rest[2] || 'opencode';
    const result = claim(board, id, agent);
    if (result.ok === false) { console.error(result.error); process.exit(1); }
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'implement') {
    const board = loadBoard();
    const result = implement(board, rest[1]);
    if (result.ok === false) { console.error(result.error); process.exit(1); }
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'verify') {
    const board = loadBoard();
    const id = rest[1]; const hash = rest[2] || ''; const targetsOk = rest[3] === '1' ? 1 : 0;
    const result = vrf(board, id, hash, targetsOk);
    if (result.ok === false) { console.error(result.error); process.exit(1); }
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'review') {
    const board = loadBoard();
    const result = review(board, rest[1]);
    if (result.ok === false) { console.error(result.error); process.exit(1); }
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'finish') {
    const board = loadBoard();
    const r1 = certify(board, rest[1]);
    if (r1.ok === false) { console.error(r1.error); process.exit(1); }
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(r1), null, 2));
    process.exit(0);
  } else if (sub === 'fail') {
    const board = loadBoard();
    const result = tFail(board, rest[1], rest[2] || 'unknown error');
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'from-bug') {
    const board = loadBoard();
    const bugId = rest[1] || 'FUZZ_0'; const layer = parseInt(rest[2]) || 1;
    const category = rest[3] || 'unknown'; const input = rest[4] || '';
    const error = rest[5] || '';
    const result = fromBug(board, bugId, layer, category, input, error);
    saveBoard(board);
    console.log(JSON.stringify(toJsonTask(result), null, 2));
    process.exit(0);
  } else if (sub === 'status') {
    const board = loadBoard();
    const summary = boardSummary(board);
    console.log('=== LIN Task Board ===');
    console.log('Total:', summary.total);
    for (const stage of ['TODO','CLAIMED','IMPLEMENTING','VERIFIED','MULTI_TARGET_OK','REVIEW','CERTIFIED','FAILED']) {
      if (summary[stage] > 0) console.log('  ' + stage + ':', summary[stage]);
    }
    // Show active tasks
    for (const stage of ['TODO','CLAIMED','IMPLEMENTING','FAILED']) {
      const tasks = tasksByStage(board, stage);
      for (const t of tasks) {
        console.log('  [' + t.id + '] ' + t.title + ' (' + t.priority + ')');
      }
    }
    process.exit(0);
  } else {
    console.error('Usage: lin task <create|claim|implement|verify|review|finish|fail|from-bug|status> [args]');
    process.exit(1);
  }
}

usage();
