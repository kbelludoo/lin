
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';

async function test() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  const res = await provider.generate('py', task.id, task.spec('py'), { mock: false, seed: '424241' });
  console.log('Provider.generate success! Tokens:', res.tokens, 'Length:', res.text.length);
}
await test();
