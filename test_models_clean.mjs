
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';

async function test() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  const testModels = [
    'kgw/kilo-auto/free',
    'cf/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    'groq/openai/gpt-oss-120b'
  ];
  for (const m of testModels) {
    try {
      console.log('Testing model with parseBody:', m);
      const res = await provider.generate('py', task.id, task.spec('py'), { mock: false, seed: '424241', model: m });
      console.log('SUCCESS on', m, '-> Tokens:', res.tokens, 'Length:', res.text.length);
    } catch(e) {
      console.log('ERROR on', m, '->', e.message);
    }
  }
}
await test();
