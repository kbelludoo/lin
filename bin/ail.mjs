#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitAil, emitAilFile, estTokens } from '../src/emitter.mjs';
import { compileAilToJs, compileAilFile, parseAil } from '../src/compiler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`ail <command> [args]

Commands:
  emit <file.js|PROJECT.dicel> [-o out.ail]   JS/DicelL0 → AIL
  compile <file.ail> [-o out.js]              AIL → JS
  check <file.ail>                            parse + list fns
  version
`);
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) usage();

function takeOut(argv) {
  const i = argv.indexOf('-o');
  if (i >= 0 && argv[i + 1]) return { out: argv[i + 1], args: argv.filter((_, j) => j !== i && j !== i + 1) };
  return { out: null, args: argv };
}

if (cmd === 'version') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (cmd === 'emit') {
  const { out, args } = takeOut(rest);
  const file = args[0];
  if (!file) usage();
  const r = emitAilFile(file, out);
  console.log(JSON.stringify({ out: r.outPath, chars: r.chars, tokens_est: r.tokens_est }, null, 2));
  process.exit(0);
}

if (cmd === 'compile') {
  const { out, args } = takeOut(rest);
  const file = args[0];
  if (!file) usage();
  const r = compileAilFile(file, out);
  console.log(JSON.stringify({ out: r.outPath, fns: r.program.fns.map((f) => f.name) }, null, 2));
  process.exit(0);
}

if (cmd === 'check') {
  const file = rest[0];
  if (!file) usage();
  const text = fs.readFileSync(file, 'utf8');
  const prog = parseAil(text);
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

usage();
