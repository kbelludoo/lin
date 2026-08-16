
import { TASKS } from './benchmarks/ain-lb/tasks/define.mjs';
import { createProvider } from './benchmarks/ain-lb/provider.mjs';
import { check } from './benchmarks/ain-lb/langcheck.mjs';

async function audit() {
  const provider = createProvider({ mock: false });
  const task = TASKS['T1'];
  
  for (const lang of ['ts', 'rust']) {
    console.log('========================================');
    console.log('AUDITING LANG:', lang);
    console.log('========================================');
    const gen = await provider.generate(lang, task.id, task.spec(lang), { mock: false, seed: '424242' });
    console.log('--- GENERATED CODE ---');
    console.log(gen.text);
    console.log('--- RUNNING CHECK ---');
    const ck = check(lang, gen.text);
    console.log('CHECK RESULT:', JSON.stringify(ck, null, 2));
  }
}
await audit();
