import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from '../../src/compiler.mjs';
import { getClr, linPath } from '../../src/lin_ain_lb_clr_load.mjs';
import { runClr001 } from './runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const clr = getClr();
assert.equal(linPath(), 'src/lin_ain_lb_clr.lin');
assert.equal(clr.clrId(), 'CLR-001');
assert.equal(clr.clrName(), 'context_loss_recovery');
assert.equal(clr.side(), 'LIN_only');
assert.equal(clr.phaseCount(), 3);
assert.equal(clr.phaseAt(0).name, 'build_payments');
assert.equal(clr.phaseAt(1).name, 'wipe_chat');
assert.equal(clr.inventScore(), 0);
assert.equal(clr.fakeCurve(), 0);
assert.equal(clr.fakeAgents(), 0);
assert.equal(clr.redefineHash(), 0);
assert.equal(clr.windowMeasured(), 0);
assert.equal(clr.hashNucleus(), 'EXISTING_semantic_hash');
assert.equal(clr.chatAfterWipe(), 0);
assert.equal(clr.wireExisting(), 1);
assert.equal(clr.ainLbSpec(), 'spec/AIN-LB.rulel');
assert.equal(clr.expectedCount(), 6);
assert.match(clr.hyp(), /H_CLR001/);
assert.match(clr.falsifyIf(), /deny_fixture_status_ACCEPT/);
assert.match(clr.windowSpec(), /8k\|16k\|32k\|128k/);
assert.match(clr.keepFields(), /module_ref/);
assert.match(clr.cli(), /agent-ir/);

const phase0 = path.join(root, 'tests', 'ain_lb', 'fixtures', 'phase0');
for (const name of ['user', 'balance', 'transfer', 'audit', 'perms', 'logs', 'catalog', 'contracts']) {
  const lin = fs.readFileSync(path.join(phase0, `${name}.lin`), 'utf8');
  const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
  const tmp = path.join(os.tmpdir(), `ain_lb_${name}_${process.pid}.cjs`);
  fs.writeFileSync(tmp, js, 'utf8');
  const mod = createRequire(import.meta.url)(tmp);
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  if (name === 'transfer') {
    assert.equal(mod.moduleRef(), 'Transfer');
    assert.equal(mod.approvalThreshold(), 10000);
    assert.equal(mod.needsApproval(10001), 1);
    assert.equal(mod.needsApproval(9999), 0);
  } else if (name === 'catalog') {
    assert.equal(mod.modCount(), 6);
    assert.equal(mod.hashNucleus(), 'EXISTING_semantic_hash');
    assert.equal(mod.redefineHash(), 0);
  } else if (name === 'contracts') {
    assert.match(mod.approvalRule(), /transfer_gt_10000/);
  } else {
    assert.ok(mod.moduleRef(), name);
  }
}

const report = runClr001();
assert.equal(report.id, 'CLR-001');
assert.equal(report.invent_score, 0);
assert.equal(report.fake_agents, 0);
assert.equal(report.fake_curve, 0);
assert.equal(report.redefine_hash, 0);
assert.equal(report.phase0.correct_files, 6);
assert.equal(report.phase0.total, 6);
assert.equal(report.phase1_wipe.chat_memory, 0);
assert.equal(report.window_curve.measured, 0);
assert.equal(report.ingest[0].status, 'ACCEPT');
assert.equal(report.ingest[0].intent, 'add_international_payments');
assert.equal(report.ingest[0].module_ref, 'Transfer');
assert.equal(report.ingest[1].status, 'DENIED');
assert.equal(report.ingest[1].node, 'Storage.write');
assert.equal(report.ingest[1].missing, 'io');
assert.match(report.ingest[1].message, /DENIED AGENT_IR/);
assert.match(report.ingest[1].repairs, /add io to allowed_effects/);
assert.equal(report.adversarial.runs[0].status, 'ACCEPT');
assert.equal(report.adversarial.runs[1].status, 'DENIED');
assert.equal(report.adversarial.runs[2].status, 'ACCEPT');
assert.equal(report.hypothesis_holds_on_lin_gate, 1);
assert.ok(report.compression.present.includes('module_ref'));
assert.ok(report.compression.present.includes('semantic_hash'));
assert.equal(report.compression.redefine, 0);
const blob = JSON.stringify(report);
assert.equal(blob.includes('AI_DEVELOPMENT_SCORE'), false);
assert.equal(/85\s*%/.test(blob), false);
assert.equal(/35\s*%/.test(blob), false);

const cli = spawnSync(process.execPath, [path.join(root, 'tests', 'ain_lb', 'runner.mjs')], {
  encoding: 'utf8',
  cwd: root,
});
assert.equal(cli.status, 0, cli.stderr);
assert.match(cli.stdout, /"status": "ACCEPT"/);
assert.match(cli.stdout, /"status": "DENIED"/);
assert.equal(cli.stdout.includes('AI_DEVELOPMENT_SCORE'), false);

console.log('ok ain_lb_clr CLR-001');
