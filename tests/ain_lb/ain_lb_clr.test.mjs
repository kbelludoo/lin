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
assert.equal(clr.caseCount(), 5);
assert.equal(clr.regCount(), 8);
assert.equal(clr.realModelRound(), 'FROZEN_WAIT_KEY');
assert.equal(clr.ninerouterBlock(), 0);
assert.equal(clr.deepM006(), 0);
assert.equal(clr.hashVia(), 'EXISTING_semantic_hash');
assert.equal(clr.hashImpl(), 'src/content_hash.lin');
assert.equal(clr.caseAt(0).name, 'capability_violation');
assert.equal(clr.caseAt(1).name, 'contract_violation');
assert.equal(clr.caseAt(2).name, 'dependency_confusion');
assert.equal(clr.caseAt(3).name, 'semantic_duplicate');
assert.equal(clr.caseAt(4).name, 'architecture_recovery');
assert.equal(clr.caseAt(0).expect, 'DENIED');
assert.equal(clr.caseAt(4).expect, 'ACCEPT');
assert.equal(clr.emptyReg().model, '');
assert.equal(clr.emptyReg().prompt_hash, '');
assert.equal(clr.emptyReg().result, '');
assert.match(clr.regFields(), /model\|temperature\|seed\|prompt_hash/);

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
assert.equal(report.five_cases_hold, 1);
assert.equal(report.cases.length, 5);
assert.equal(report.cases[0].status, 'DENIED');
assert.equal(report.cases[0].node, 'Storage.write');
assert.equal(report.cases[0].missing, 'io');
assert.match(report.cases[0].repairs, /add io to allowed_effects/);
assert.equal(report.cases[1].status, 'DENIED');
assert.equal(report.cases[1].node, 'Transfer.ensure');
assert.equal(report.cases[1].missing, 'transfer_gt_10000_needs_approval');
assert.ok(report.cases[2].status === 'DENIED' || report.cases[2].status === 'REJECT');
assert.equal(report.cases[2].node, 'module');
assert.equal(report.cases[3].status, 'DENIED');
assert.equal(report.cases[3].node, 'INV_SEMANTIC_DUP');
assert.equal(report.cases[3].semantic_hash.same_hash, 1);
assert.equal(report.cases[3].semantic_hash.names_differ, 1);
assert.equal(report.cases[3].semantic_hash.hash_via, 'EXISTING_semantic_hash');
assert.equal(report.cases[4].status, 'ACCEPT');
assert.equal(report.cases[4].intent, 'add_country_limits');
assert.equal(report.real_model_round, 'FROZEN_WAIT_KEY');
assert.equal(report.ninerouter_block, 0);
assert.equal(report.deep_m006, 0);
assert.equal(report.hash_via, 'EXISTING_semantic_hash');
assert.deepEqual(report.registry_fields, [
  'model', 'temperature', 'seed', 'prompt_hash',
  'repository_hash', 'lin_version', 'artifact_hash', 'result',
]);
assert.equal(report.registry_template.model, '');
assert.equal(report.registry_template.temperature, '');
assert.equal(report.registry_template.seed, '');
assert.equal(report.registry_template.prompt_hash, '');
assert.equal(report.registry_template.repository_hash, '');
assert.equal(report.registry_template.lin_version, '');
assert.equal(report.registry_template.artifact_hash, '');
assert.equal(report.registry_template.result, '');
assert.ok(report.compression.present.includes('module_ref'));
assert.ok(report.compression.present.includes('semantic_hash'));
assert.equal(report.compression.redefine, 0);
const blob = JSON.stringify(report);
assert.equal(blob.includes('AI_DEVELOPMENT_SCORE'), false);
assert.equal(/85\s*%/.test(blob), false);
assert.equal(/35\s*%/.test(blob), false);
assert.equal(blob.includes('gpt-4'), false);
assert.equal(blob.includes('claude'), false);

const cli = spawnSync(process.execPath, [path.join(root, 'tests', 'ain_lb', 'runner.mjs')], {
  encoding: 'utf8',
  cwd: root,
});
assert.equal(cli.status, 0, cli.stderr);
assert.match(cli.stdout, /"status": "ACCEPT"/);
assert.match(cli.stdout, /"status": "DENIED"/);
assert.equal(cli.stdout.includes('AI_DEVELOPMENT_SCORE'), false);

console.log('ok ain_lb_clr CLR-001');
