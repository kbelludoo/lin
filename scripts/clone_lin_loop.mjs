#!/usr/bin/env node
/**
 * LIN clone→rewrite→IMPROVE_LIN_FROM_CLONE→publish continuous loop.
 * Spec: spec/LIN_CLONE_LIN_LOOP.dicel
 * Stop: Ctrl+C | --cycles N | --stop-file path
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFromFile, oracleFromFn, verifyFnAgainstOracle, walkJs,
} from './clone_lin_oracle.mjs';
import {
  appendStorage, buildPublishDir, improveLinFromClone, learnFromFails,
  publishGh, runCmd, writeIntel,
} from './clone_lin_improve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE = path.join(ROOT, 'storage');
const CAND = path.join(ROOT, 'candidates');

const FAMOUS_QUEUE = [
  { name: 'dayjs', source: 'https://github.com/iamkun/dayjs.git', prefer: 'src/utils.js' },
  { name: 'ms', source: 'https://github.com/vercel/ms.git', prefer: null },
  { name: 'underscore', source: 'https://github.com/jashkenas/underscore.git', prefer: 'modules/' },
  { name: 'left-pad', source: 'https://github.com/left-pad/left-pad.git', prefer: null },
];

function parseArgs(argv) {
  const o = {
    source: null, name: null, maxFns: 24, dryPublish: false, shallow: true,
    prefer: null, cycles: 99, stopFile: null, queueIndex: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') o.source = argv[++i];
    else if (a === '--name') o.name = argv[++i];
    else if (a === '--max-fns') o.maxFns = Number(argv[++i]) || 24;
    else if (a === '--dry-publish') o.dryPublish = true;
    else if (a === '--prefer') o.prefer = argv[++i];
    else if (a === '--no-shallow') o.shallow = false;
    else if (a === '--cycles') o.cycles = Number(argv[++i]) || 99;
    else if (a === '--stop-file') o.stopFile = argv[++i];
    else if (a === '--queue-index') o.queueIndex = Number(argv[++i]) || 0;
  }
  return o;
}

function shouldStop(args, cycle) {
  if (cycle >= args.cycles) return 'cycles_exhausted';
  if (args.stopFile && fs.existsSync(path.resolve(ROOT, args.stopFile))) return 'stop_file';
  return null;
}

function slugFromSource(source, name) {
  if (name) return String(name).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const base = path.basename(String(source).replace(/\.git$/, ''));
  return base.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'repo';
}

function cloneSource(source, dest, shallow) {
  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
    fs.cpSync(source, dest, { recursive: true });
    return { ok: true, mode: 'copy_local', dest };
  }
  const args = ['clone'];
  if (shallow) args.push('--depth', '1');
  args.push(source, dest);
  const r = runCmd('git', args, { cwd: ROOT });
  if (r.status !== 0) return { ok: false, error: r.out.slice(0, 400), dest };
  return { ok: true, mode: 'git_clone', dest };
}

function preferFilter(files, prefer) {
  if (!prefer) return files;
  const pref = prefer.replace(/\\/g, '/').toLowerCase();
  const hit = files.filter((f) => f.replace(/\\/g, '/').toLowerCase().includes(pref));
  return hit.length ? hit : files;
}

function runOneCycle(args, target) {
  const slug = slugFromSource(target.source, target.name);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lin_clone_${slug}_`));
  const report = {
    slug, source: target.source, status: 'FAIL', pass: 0, fail: 0, skip: 0,
    pass_names: [], fail_names: [], temp_cleaned: false, note_pt: '',
  };

  try {
    const cloned = cloneSource(target.source, path.join(tempRoot, 'src'), args.shallow);
    if (!cloned.ok) throw new Error(`clone_failed:${cloned.error}`);
    const files = preferFilter(walkJs(cloned.dest), target.prefer || args.prefer);
    const results = [];
    let seen = 0;
    for (const f of files) {
      if (seen >= args.maxFns) break;
      const { fns } = extractFromFile(f);
      for (const fn of fns) {
        if (seen >= args.maxFns) break;
        seen++;
        const oracle = oracleFromFn(fn);
        if (oracle.status !== 'ok') {
          report.skip++;
          results.push({ status: 'skip', name: fn.name, reason: oracle.reason });
          continue;
        }
        const v = verifyFnAgainstOracle(oracle);
        results.push(v);
        if (v.status === 'pass') {
          report.pass++;
          report.pass_names.push(v.name);
        } else if (v.status === 'fail') {
          report.fail++;
          report.fail_names.push(v.name);
        } else report.skip++;
      }
    }

    const fails = results.filter((r) => r.status === 'fail');
    if (fails.length) report.learn = learnFromFails(STORAGE, fails, slug).hypothesis;

    // S5 IMPROVE_LIN_FROM_CLONE (mandatory)
    report.improve_lin = improveLinFromClone(ROOT, STORAGE, CAND, results, slug).summary;

    const pubDir = buildPublishDir(ROOT, slug, results, {
      source: target.source, pass: report.pass, fail: report.fail, skip: report.skip,
      improve_lin: report.improve_lin,
    });

    if (report.pass > 0) {
      const pub = publishGh(ROOT, pubDir, slug, args.dryPublish);
      report.clone_lin_local = pub.local;
      report.clone_lin_url = pub.url || '';
      report.status = report.fail === 0 && report.skip === 0
        ? 'PASS'
        : report.fail === 0
          ? 'PARTIAL_PASS'
          : 'PARTIAL_PASS_WITH_FAILS';
      if (!pub.ok && !args.dryPublish) {
        report.status = `${report.status}_LOCAL`;
        report.note_pt = `Publish gh falhou: ${(pub.error || '').slice(0, 120)}. Local=${pub.local}`;
      }
    } else {
      report.status = 'FAIL_LEARN';
      report.clone_lin_local = pubDir;
      report.note_pt = 'Nenhum fn passou hash exacto; learn+improve gravados; publish skip.';
    }

    if (!report.note_pt) {
      report.note_pt = `clone-lin-${slug}: p=${report.pass} f=${report.fail} s=${report.skip}; improve=${report.improve_lin}`;
    }
    appendStorage(
      STORAGE,
      'lia_ledger.dicel',
      `kind=clone_lin status=${report.status} slug=${slug} pass=${report.pass} fail=${report.fail} skip=${report.skip}`,
    );
  } finally {
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    report.temp_cleaned = !fs.existsSync(tempRoot);
  }

  report.intel = writeIntel(ROOT, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cycleReports = [];
  let stopReason = null;

  for (let c = 0; c < args.cycles; c++) {
    stopReason = shouldStop(args, c);
    if (stopReason) break;

    const target = args.source
      ? { name: args.name || slugFromSource(args.source), source: args.source, prefer: args.prefer }
      : FAMOUS_QUEUE[(args.queueIndex + c) % FAMOUS_QUEUE.length];

    console.error(`[clone-lin] cycle ${c + 1}/${args.cycles} → ${target.name}`);
    const report = runOneCycle(args, target);
    cycleReports.push(report);
    console.log(JSON.stringify({ cycle: c + 1, ...report }, null, 2));

    if (args.source && args.cycles === 1) break;
    stopReason = shouldStop(args, c + 1);
    if (stopReason) break;
  }

  console.log(JSON.stringify({
    done: true,
    cycles_run: cycleReports.length,
    stop: stopReason || 'complete',
    how_to_stop: 'Ctrl+C | --cycles N | create --stop-file path',
    reports: cycleReports.map((r) => ({
      slug: r.slug, status: r.status, url: r.clone_lin_url, intel: r.intel, improve: r.improve_lin,
    })),
  }, null, 2));

  process.exit(cycleReports.some((r) => r.pass > 0) ? 0 : 1);
}

main();
