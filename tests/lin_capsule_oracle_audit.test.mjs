import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRIBUTED_TASK_CORPUS, buildDistributedBaseLinobj } from './lin_capsule_distributed_corpus.mjs';

test('LIN Capsule - Systematic 10-Task Oracle Audit (Component Omission Falsification)', () => {
  console.log('\n================================================================');
  console.log('  AUDITORIA SISTEMÁTICA: 10 TAREFAS × FALSIFICAÇÃO POR COMPONENTE');
  console.log('================================================================\n');

  assert.equal(DISTRIBUTED_TASK_CORPUS.length, 10, 'Corpus deve conter exatamente 10 tarefas completas');

  let totalFalsificationsTested = 0;

  for (const task of DISTRIBUTED_TASK_CORPUS) {
    console.log(`▶ [${task.id}] ${task.name}`);

    // 1. Validar requisito mínimo de 3 arquivos
    assert.ok(task.requiredFiles.length >= 3, `${task.id} deve requerer >= 3 arquivos`);
    console.log(`  - Arquivos requeridos (${task.requiredFiles.length}): [${task.requiredFiles.map(f => f.split('/').pop()).join(', ')}]`);

    const base = buildDistributedBaseLinobj();

    // 2. Testar Patch Válido Completo (DEVE dar PASS)
    const validRes = task.applyPatch(base, task.validPatch);
    assert.equal(validRes.ok, true, `${task.id}: Patch válido deve aplicar com sucesso`);
    const validOracle = task.oracle(validRes.linobj);
    assert.equal(validOracle.pass, true, `${task.id}: Oráculo DEVE dar PASS para patch completo`);
    console.log(`  - Patch Válido: PASS (Evidências: ${JSON.stringify(validOracle.evidence)})`);

    // 3. Testar Sistematicamente a Remoção de Cada Componente Obrigatório (DEVE dar FAIL CLOSED)
    const components = Object.keys(task.falsifications);
    assert.ok(components.length >= 3, `${task.id} deve ter falsificações para pelo menos 3 componentes`);

    for (const comp of components) {
      const omittedPatch = task.falsifications[comp];
      const omittedRes = task.applyPatch(base, omittedPatch);
      assert.equal(omittedRes.ok, true, `${task.id}: Patch com omissão de '${comp}' deve aplicar estruturalmente`);
      
      const omittedOracle = task.oracle(omittedRes.linobj);
      assert.equal(omittedOracle.pass, false, `${task.id}: Oráculo DEVE REJEITAR (FAIL CLOSED) se '${comp}' for omitido`);
      assert.equal(omittedOracle.evidence[comp], false, `${task.id}: Evidência do componente '${comp}' deve ser false`);
      totalFalsificationsTested++;
    }
    console.log(`  - Falsificações Testadas (${components.length} componentes): 100% REJEITADAS (FAIL CLOSED)`);
  }

  console.log('\n================================================================');
  console.log(`  AUDITORIA CONCLUÍDA: 10/10 Tarefas Válidas | ${totalFalsificationsTested} Falsificações Rejeitadas`);
  console.log('================================================================\n');
});
