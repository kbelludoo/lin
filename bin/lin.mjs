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

usage();
