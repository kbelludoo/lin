#!/usr/bin/env node
/**
 * LIN clone→rewrite→IMPROVE_LIN_FROM_CLONE→publish continuous loop.
 * Spec: spec/LIN_CLONE_LIN_LOOP.dicel
 *
 * Gate: NEVER publish / NEVER mark DONE / NEVER advance queue unless
 * suite_rate == 1.0 (pass>0, fail==0, skip==0) with exact hash / behavior_eq.
 * PARTIAL → INTEL+learn+improve, stay on SAME repo, retry.
 * Stop: all queued DONE 100% (default, no wrap) | Ctrl+C | --stop-file | --cycles N
 * Wrap only with --repeat.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFromFile, oracleFromFn, verifyFnAgainstOracle, walkLang,
} from './clone_lin_oracle.mjs';
import {
  appendStorage, buildPublishDir, improveLinFromClone, learnFromFails,
  publishGh, runCmd, writeIntel,
} from './clone_lin_improve.mjs';
import { ensureToolchains } from './ensure_toolchains.mjs';
import { copyMultiIntoPublish, verifyMultiTargets } from './clone_lin_multi.mjs';
import { loadYearStarQueue, buildYearStarQueue } from './fetch_star_queue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE = path.join(ROOT, 'storage');
const CAND = path.join(ROOT, 'candidates');
const STATE_PATH = path.join(ROOT, '.clone_lin_queue_state.json');

/** Famous repos WITH tests — finish one at 100% then next. */
const FAMOUS_QUEUE = [
  { name: 'dayjs', source: 'https://github.com/iamkun/dayjs.git', prefer: 'src/utils.js' },
  { name: 'underscore', source: 'https://github.com/jashkenas/underscore.git', prefer: 'modules/' },
  { name: 'ms', source: 'https://github.com/vercel/ms.git', prefer: null },
  { name: 'left-pad', source: 'https://github.com/left-pad/left-pad.git', prefer: 'index.js' },
  { name: 'nanoid', source: 'https://github.com/ai/nanoid.git', prefer: 'index.browser.js' },
  { name: 'chalk', source: 'https://github.com/chalk/chalk.git', prefer: 'source/' },
  { name: 'dedent', source: 'https://github.com/dmnd/dedent.git', prefer: 'src/dedent' },
  { name: 'is-number', source: 'https://github.com/jonschlinkert/is-number.git', prefer: null },
];

function resolveQueue(refresh) {
  let y = refresh ? null : loadYearStarQueue();
  if (!y || !y.queue?.length) y = buildYearStarQueue();
  return y.queue && y.queue.length ? y.queue : FAMOUS_QUEUE;
}

function parseArgs(argv) {
  const o = {
    source: null, name: null, lang: null, maxFns: 24, dryPublish: false, shallow: true,
    prefer: null, cycles: 0, stopFile: null, queueIndex: null, repeat: false, refreshStars: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') o.source = argv[++i];
    else if (a === '--name') o.name = argv[++i];
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--max-fns') o.maxFns = Number(argv[++i]) || 24;
    else if (a === '--dry-publish') o.dryPublish = true;
    else if (a === '--prefer') o.prefer = argv[++i];
    else if (a === '--no-shallow') o.shallow = false;
    else if (a === '--cycles') o.cycles = Number(argv[++i]) || 0;
    else if (a === '--stop-file') o.stopFile = argv[++i];
    else if (a === '--queue-index') o.queueIndex = Number(argv[++i]);
    else if (a === '--repeat') o.repeat = true;
    else if (a === '--refresh-stars') o.refreshStars = true;
  }
  return o;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { queueIndex: 0, done: [], current: null, attempts: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function shouldStop(args, cycle) {
  if (args.cycles > 0 && cycle >= args.cycles) return 'cycles_exhausted';
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

/** 100% gate: every declared fn must pass exact hash; skips count against rate. */
function suiteStats(pass, fail, skip) {
  const total = pass + fail + skip;
  const suite_rate = total > 0 ? pass / total : 0;
  const full = total > 0 && fail === 0 && skip === 0 && pass === total;
  return { total, suite_rate, full };
}

function runOneCycle(args, target) {
  const slug = slugFromSource(target.source, target.name);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lin_clone_${slug}_`));
  const report = {
    slug, source: target.source, status: 'FAIL_LEARN', pass: 0, fail: 0, skip: 0,
    pass_names: [], fail_names: [], skip_names: [], temp_cleaned: false, note_pt: '',
    done: false, published: false, suite_rate: 0, suite_total: 0,
  };

  try {
    const cloned = cloneSource(target.source, path.join(tempRoot, 'src'), args.shallow);
    if (!cloned.ok) throw new Error(`clone_failed:${cloned.error}`);
    const files = preferFilter(walkLang(cloned.dest, target.lang || 'javascript'), target.prefer || args.prefer);
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
          report.skip_names.push(`${fn.name}:${oracle.reason}`);
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
          report.fail_detail = report.fail_detail || [];
          report.fail_detail.push(`${v.name}:${v.stage}:${String(v.reason || 'holdout_mismatch').slice(0, 80)}`);
        } else {
          report.skip++;
          report.skip_names.push(`${v.name}:${v.reason || 'skip'}`);
        }
      }
    }

    const stats = suiteStats(report.pass, report.fail, report.skip);
    report.suite_total = stats.total;
    report.suite_rate = Number(stats.suite_rate.toFixed(4));

    const fails = results.filter((r) => r.status === 'fail');
    if (fails.length) report.learn = learnFromFails(STORAGE, fails, slug).hypothesis;

    const multi = verifyMultiTargets(ROOT, STORAGE, CAND, results, slug);
    report.multi = multi.summary;
    report.multi_line = Object.entries(multi.summary)
      .map(([t, s]) => `${t}:P${s.PASS}/S${s.SKIP}/F${s.FAIL}`).join(' ');
    report.learn_lang = multi.learn?.hypothesis || 'none';

    // S5 IMPROVE_LIN_FROM_CLONE (mandatory every attempt)
    report.improve_lin = improveLinFromClone(ROOT, STORAGE, CAND, results, slug).summary;

    // S6: build publish dir + gh push ONLY at suite_rate==1.0 (never on PARTIAL)
    report.clone_lin_local = '';
    report.clone_lin_url = '';
    if (stats.full) {
      const pubDir = buildPublishDir(ROOT, slug, results, {
        source: target.source, pass: report.pass, fail: report.fail, skip: report.skip,
        improve_lin: report.improve_lin, suite_rate: report.suite_rate,
        multi_summary: multi.summary,
      });
      copyMultiIntoPublish(pubDir, multi);
      try { fs.rmSync(multi.workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      const pub = publishGh(ROOT, pubDir, slug, args.dryPublish);
      report.clone_lin_url = pub.url || '';
      report.clone_lin_local = pub.local || pubDir;
      if (pub.ok || args.dryPublish) {
        report.status = 'PASS';
        report.done = true;
        report.published = true;
        report.note_pt = `DONE 100% clone-lin-${slug}: p=${report.pass} suite_rate=1.0 JS; multi=${report.multi_line}; improve=${report.improve_lin}`;
      } else {
        report.status = 'PASS_PUBLISH_FAIL';
        report.done = false;
        report.published = false;
        report.note_pt = `100% local mas publish gh falhou: ${(pub.error || '').slice(0, 120)}. Local=${pub.local}`;
      }
    } else if (report.pass > 0) {
      // PARTIAL: INTEL+learn only — NO publish dir, NO gh, NOT done
      report.status = report.fail === 0 ? 'PARTIAL_PASS' : 'PARTIAL_PASS_WITH_FAILS';
      report.done = false;
      report.published = false;
      report.note_pt = `PARTIAL (nao publish): p=${report.pass} f=${report.fail} s=${report.skip} suite_rate=${report.suite_rate}; multi=${report.multi_line}; stay+retry; improve=${report.improve_lin}`;
    } else {
      report.status = 'FAIL_LEARN';
      report.done = false;
      report.published = false;
      report.note_pt = `FAIL_LEARN (nao publish): p=0 f=${report.fail} s=${report.skip} suite_rate=${report.suite_rate}; multi=${report.multi_line}; stay+retry; improve=${report.improve_lin}`;
    }
    try { fs.rmSync(multi.workDir, { recursive: true, force: true }); } catch { /* ignore */ }

    appendStorage(
      STORAGE,
      'lia_ledger.dicel',
      `kind=clone_lin status=${report.status} slug=${slug} pass=${report.pass} fail=${report.fail} skip=${report.skip} suite_rate=${report.suite_rate} done=${report.done} published=${report.published}`,
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
  const toolchain = ensureToolchains();
  console.error(`[clone-lin] toolchain present=${toolchain.present.join(',')} installed=${toolchain.installed.join(',')||'-'} failed=${toolchain.failed.map((f) => f.tool).join(',')||'-'}`);
  const QUEUE = resolveQueue(args.refreshStars);
  const cycleReports = [];
  let stopReason = null;
  const state = loadState();

  function allQueuedDone(st) {
    return QUEUE.every((q) => st.done.includes(q.name));
  }

  if (args.queueIndex != null && Number.isFinite(args.queueIndex)) {
    state.queueIndex = Math.max(0, args.queueIndex % QUEUE.length);
  }

  let queueIndex = state.queueIndex || 0;
  const single = args.source
    ? { name: args.name || slugFromSource(args.source), source: args.source, prefer: args.prefer, lang: args.lang }
    : null;

  console.error(`[clone-lin] gate=suite_rate==1.0 sticky=true wrap=${args.repeat ? 'repeat' : 'exit_when_queue_done'}`);
  console.error(`[clone-lin] queue=${QUEUE.map((q) => `${q.name}:${q.lang || 'js'}`).join('→')}`);

  for (let c = 0; ; c++) {
    stopReason = shouldStop(args, c);
    if (stopReason) break;
    if (!single && !args.repeat && allQueuedDone(state)) {
      stopReason = 'queue_complete';
      console.error('[clone-lin] all queued repos DONE 100% — exit (use --repeat to wrap)');
      break;
    }

    const target = single || QUEUE[queueIndex % QUEUE.length];
    state.current = target.name;
    state.attempts[target.name] = (state.attempts[target.name] || 0) + 1;
    saveState(state);

    console.error(`[clone-lin] attempt ${c + 1} → ${target.name} (q=${queueIndex}, try#${state.attempts[target.name]})`);
    const report = runOneCycle(args, target);
    cycleReports.push(report);
    console.log(JSON.stringify({
      cycle: c + 1,
      queue_index: queueIndex,
      attempt_on_repo: state.attempts[target.name],
      ...report,
    }, null, 2));

    if (report.done && report.published) {
      if (!state.done.includes(target.name)) state.done.push(target.name);
      if (!single) {
        if (!args.repeat && allQueuedDone(state)) {
          stopReason = 'queue_complete';
          console.error(`[clone-lin] ${target.name} DONE 100% — queue complete, no wrap`);
          saveState(state);
          break;
        }
        queueIndex = (queueIndex + 1) % QUEUE.length;
        state.queueIndex = queueIndex;
        console.error(`[clone-lin] ${target.name} DONE 100% → next=${QUEUE[queueIndex].name}`);
      } else {
        console.error(`[clone-lin] single-source ${target.name} DONE 100%`);
        stopReason = 'single_source_done';
        saveState(state);
        break;
      }
      saveState(state);
    } else {
      console.error(`[clone-lin] ${target.name} NOT 100% (rate=${report.suite_rate}) — stay+retry (no publish)`);
      saveState(state);
    }

    stopReason = shouldStop(args, c + 1);
    if (stopReason) break;
  }

  const anyDone = cycleReports.some((r) => r.done && r.published);
  console.log(JSON.stringify({
    done: stopReason === 'stop_file' || stopReason === 'single_source_done' || stopReason === 'cycles_exhausted' || stopReason === 'queue_complete',
    success_any_100: anyDone,
    cycles_run: cycleReports.length,
    stop: stopReason || 'complete',
    queue: QUEUE.map((q) => q.name),
    queue_index: queueIndex,
    current: state.current,
    repos_done: state.done,
    wrap: args.repeat ? 'repeat' : 'exit_when_queue_done',
    how_to_stop: 'queue_complete (default) | Ctrl+C | --stop-file | --repeat to wrap',
    gate: 'suite_rate==1.0 required to publish/advance',
    reports: cycleReports.map((r) => ({
      slug: r.slug,
      status: r.status,
      suite_rate: r.suite_rate,
      done: r.done,
      published: r.published,
      url: r.clone_lin_url,
      intel: r.intel,
      improve: r.improve_lin,
    })),
  }, null, 2));

  // exit 0 only if we achieved at least one honest 100% OR user stop-file
  process.exit(anyDone || stopReason === 'stop_file' || stopReason === 'queue_complete' ? 0 : 1);
}

main();
