/**
 * CLR-001 LIN-side harness.
 * Runs fixtures through `lin agent-ir`. Records ACCEPT/DENIED + causal fields.
 * Does not invent win scores. Does not run Python/Rust agents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getClr } from '../../src/lin_ain_lb_clr_load.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = path.join(root, 'bin', 'lin.mjs');

function agentIr(filePath) {
  const r = spawnSync(process.execPath, [bin, 'agent-ir', filePath], { encoding: 'utf8', cwd: root });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout || ''); } catch { parsed = null; }
  return {
    fixture: path.relative(root, filePath).replace(/\\/g, '/'),
    exit: r.status,
    status: parsed && parsed.status ? parsed.status : 'PARSE_FAIL',
    ok: parsed ? parsed.ok : 0,
    field: parsed ? parsed.field : '',
    missing: parsed ? parsed.missing : '',
    repairs: parsed ? parsed.repairs : '',
    node: parsed ? parsed.node : '',
    message: parsed ? parsed.message : String(r.stderr || r.stdout || ''),
    module_ref: parsed && parsed.module_ref ? parsed.module_ref : '',
    hash_nucleus: parsed && parsed.hash_nucleus ? parsed.hash_nucleus : '',
    allowed_effects: parsed && parsed.allowed_effects ? parsed.allowed_effects : [],
    constraints: parsed && parsed.constraints ? parsed.constraints : [],
    intent: parsed && parsed.intent ? parsed.intent : '',
  };
}

function listPhase0(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith('.lin')).sort();
}

function discovery(clr) {
  const dir = path.join(root, clr.phase0Dir());
  const files = listPhase0(dir);
  const expected = String(clr.expectedModules()).split('|');
  const stems = files.map((f) => f.replace(/\.lin$/, ''));
  const found = expected.filter((m) => stems.includes(m.toLowerCase()));
  return {
    expected_modules: expected,
    expected_count: clr.expectedCount(),
    files_on_disk: files,
    correct_files: found.length,
    total: expected.length,
    note: 'file_presence_only; not a model win score',
  };
}

function compressionFields(rows, leftover) {
  const present = [];
  if (rows.some((r) => r.module_ref)) present.push('module_ref');
  if (rows.some((r) => r.hash_nucleus === 'EXISTING_semantic_hash') || leftover.hash_nucleus === 'EXISTING_semantic_hash') {
    present.push('semantic_hash');
  }
  if (rows.some((r) => (r.allowed_effects || []).length)) present.push('effects');
  if (leftover.contracts && leftover.contracts.length) present.push('contracts');
  if (rows.some((r) => r.intent)) present.push('agent_ir');
  return {
    keep_spec: 'module_ref|semantic_hash|effects|contracts|agent_ir',
    present,
    hash_nucleus: 'EXISTING_semantic_hash',
    redefine: 0,
    note: 'field_presence_after_wipe; not a compression ratio',
  };
}

export function runClr001() {
  const clr = getClr();
  const leftoverPath = path.join(root, clr.wipeDir(), 'leftover_contracts.json');
  const leftover = JSON.parse(fs.readFileSync(leftoverPath, 'utf8'));
  const accept = agentIr(path.join(root, clr.acceptFixture()));
  const deny = agentIr(path.join(root, clr.denyFixture()));
  const oldCommit = agentIr(path.join(root, clr.advDir(), 'old_commit.json'));
  const broken = agentIr(path.join(root, clr.advDir(), 'broken_new_commit.json'));
  const repair = agentIr(path.join(root, clr.advDir(), 'repair_via_ir.json'));
  const ingest = [accept, deny];
  const adversarial = [oldCommit, broken, repair];
  const hypHolds = accept.status === 'ACCEPT' && deny.status === 'DENIED';
  return {
    id: clr.clrId(),
    name: clr.clrName(),
    side: clr.side(),
    invent_score: clr.inventScore(),
    fake_agents: clr.fakeAgents(),
    fake_curve: clr.fakeCurve(),
    redefine_hash: clr.redefineHash(),
    hash_nucleus: clr.hashNucleus(),
    wire_existing: { spec: clr.ainLbSpec(), harness: clr.ainLbHarness() },
    cli: clr.cli(),
    phase0: discovery(clr),
    phase1_wipe: {
      chat_memory: leftover.chat_memory,
      remaining: leftover.survives_wipe,
      new_request: leftover.new_request,
    },
    ingest,
    adversarial: {
      protocol: clr.advReset(),
      runs: adversarial,
    },
    compression: compressionFields([...ingest, ...adversarial], leftover),
    window_curve: { spec: clr.windowSpec(), measured: clr.windowMeasured() },
    hypothesis: clr.hyp(),
    falsify_if: clr.falsifyIf(),
    hypothesis_holds_on_lin_gate: hypHolds ? 1 : 0,
  };
}

function main() {
  const report = runClr001();
  const text = JSON.stringify(report, null, 2);
  if (text.includes('AI_DEVELOPMENT_SCORE') || /85\s*%/.test(text) || /35\s*%/.test(text)) {
    throw new Error('runner must not invent win scores');
  }
  console.log(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
