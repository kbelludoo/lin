
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Layer = require('./lib/router/layer.js');
const l = new Layer('*', {}, () => {});
if (!l.match('/test')) process.exit(1);
console.log('PASS');
