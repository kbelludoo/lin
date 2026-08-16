
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';

async function test() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  const m = 'cf/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
  console.log('Testing', m, 'on T1...');
  const res = await provider.generate('py', task.id, task.spec('py'), { mock: false, seed: '424241', model: m });
  console.log('SUCCESS!', m, 'Tokens:', res.tokens, 'Elapsed:', Math.round(res.elapsedMs), 'ms');
}
await test();
