import { runSingleRealLlmTrial } from './bench_agent_edit_003_real_llm.mjs';

const res = await runSingleRealLlmTrial(1);
console.log('TELEMETRY:', res.telemetry);
console.log('STAGES:', res.stages);
