
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';

async function test() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  const testModels = [
    'ocg/glm-5.2',
    'ocg/glm-5.1',
    'ocg/kimi-k2.6',
    'ocg/minimax-m3',
    'ocg/minimax-m2.7'
  ];
  for (const m of testModels) {
    try {
      console.log('Testing model with parseBody:', m);
      const res = await provider.generate('py', task.id, task.spec('py'), { mock: false, seed: '424241', model: m });
      console.log('SUCCESS on', m, '-> Tokens:', res.tokens, 'Length:', res.text.length, 'Code snippet:', res.text.slice(0, 80));
    } catch(e) {
      console.log('ERROR on', m, '->', e.message);
    }
  }
}
await test();
