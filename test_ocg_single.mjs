
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';

async function test() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  console.log('Testing ocg/glm-5.2 on T1...');
  const res = await provider.generate('py', task.id, task.spec('py'), { mock: false, seed: '424241', model: 'ocg/glm-5.2' });
  console.log('SUCCESS ocg/glm-5.2! Tokens:', res.tokens, 'Elapsed:', Math.round(res.elapsedMs), 'ms');
  console.log('Code:', res.text.slice(0, 120));
}
await test();
