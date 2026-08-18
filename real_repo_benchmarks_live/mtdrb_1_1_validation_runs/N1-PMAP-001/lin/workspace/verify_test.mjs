
import pMap from './index.js';
const res = await pMap([1, 2], async x => x * 2);
if (res[0] !== 2 || res[1] !== 4) process.exit(1);
console.log('PASS');
