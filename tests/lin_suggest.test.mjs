import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs } from '../src/compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linPath = path.join(root, 'src', 'lin_suggest.lin');
const lin = fs.readFileSync(linPath, 'utf8');
const { js } = compileLiaToJs(lin, { exportMode: 'multiple' });
const tmp = path.join(os.tmpdir(), 'lin_suggest_test.cjs');
fs.writeFileSync(tmp, js, 'utf8');
const mod = createRequire(import.meta.url)(tmp);
try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }

assert.equal(mod.suggestCount(), 7);
assert.equal(mod.suggestIds(), 'S001|S002|S003|S004|S005|S006|S007');

const keys = ['id', 'goal', 'why_for_ai', 'proof_or_gate', 'next_repair', 'status'];
for (let i = 0; i < 7; i++) {
  const row = mod.suggestionAt(i);
  for (const k of keys) {
    assert.ok(row[k], `missing ${k} at ${i}`);
  }
}

const s002 = mod.suggestById('S002');
assert.equal(s002.status, 'SLICE1');
assert.match(s002.next_repair, /refine b:int\{>0\}/);
assert.match(s002.next_repair, /require b>0/);

const s001 = mod.suggestById('S001');
assert.equal(s001.status, 'DONE');
assert.match(s001.proof_or_gate, /LIN_EMIT_FAIL_CLOSED/);

const blob = mod.suggestAllLines();
assert.match(blob, /id=S002/);
assert.match(blob, /id=S007/);

assert.equal(mod.agreeRank(), 1);
assert.equal(mod.mechCount(), 6);
assert.equal(mod.mechAt(0).mechanism, 'rules_plus_causal_diagnosis');
assert.equal(mod.mechAt(0).stars, 5);
assert.equal(mod.mechAt(0).copy_language, 0);
assert.equal(mod.mechAt(1).mechanism, 'invariants_plus_small_proof_obligations');
assert.equal(mod.mechAt(2).mechanism, 'ast_as_data_declarative_transform');
assert.equal(mod.mechAt(3).mechanism, 'types_that_carry_meaning');
assert.equal(mod.mechAt(4).mechanism, 'safe_execution_ownership_no_ub');
assert.equal(mod.mechAt(5).mechanism, 'scientific_math_first_class');
const intent = mod.intentShape();
assert.ok('objective' in intent && 'constraints' in intent);
assert.ok('allowed_changes' in intent && 'forbidden' in intent);
assert.match(mod.intentWhy(), /intent\{objective,constraints,allowed_changes,forbidden\}/);
assert.match(mod.rankAllLines(), /rank=1 mechanism=rules_plus_causal_diagnosis/);
assert.equal(mod.agreeAgentLangs(), 1);
assert.equal(mod.agentIrPath(), 'src/lin_agent_ir.lin');
assert.match(mod.archThree(), /LIN_Agent_IR/);

const irLin = fs.readFileSync(path.join(root, 'src', 'lin_agent_ir.lin'), 'utf8');
const irJs = compileLiaToJs(irLin, { exportMode: 'multiple' }).js;
const irTmp = path.join(os.tmpdir(), 'lin_agent_ir_test.cjs');
fs.writeFileSync(irTmp, irJs, 'utf8');
const ir = createRequire(import.meta.url)(irTmp);
try { fs.rmSync(irTmp, { force: true }); } catch { /* ignore */ }

assert.equal(ir.agreeAgentLangs(), 1);
assert.equal(ir.forbidShrink(), 1);
assert.equal(ir.layerCount(), 3);
assert.equal(ir.layerAt(0).name, 'LIN');
assert.equal(ir.layerAt(0).shrink_lin_to_dsl, 0);
assert.equal(ir.layerAt(1).name, 'LIN_Agent_IR');
assert.equal(ir.layerAt(2).name, 'LIN_Proof_Layer');
assert.equal(ir.absCount(), 6);
assert.equal(ir.absAt(0).absorb_from, 'edict');
assert.equal(ir.absAt(0).stars, 5);
assert.equal(ir.absAt(0).copy_language, 0);
assert.equal(ir.absAt(1).absorb_from, 'mog');
assert.equal(ir.absAt(2).absorb_from, 'lisp');
assert.equal(ir.absAt(3).absorb_from, 'prolog');
assert.equal(ir.absAt(4).absorb_from, 'lingo');
assert.equal(ir.absAt(5).absorb_from, 'ilo');
assert.equal(ir.absAt(5).stars, 3);
assert.equal(ir.openSpace(), 'IA thinks, mutates, proves BEFORE emit');
assert.match(ir.agentLoop(), /prove/);
assert.match(ir.absAllLines(), /arch=LIN\+LIN_Agent_IR\+LIN_Proof_Layer/);

console.log('ok lin_suggest');
