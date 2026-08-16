'use strict';
const m = require('./bench.cjs');
const f = m.default && m.default.factorial ? m.default : m;
const d = f.double_ || f.double;
console.log(JSON.stringify([f.factorial(10), f.isEven(7), f.sumTo(100), f.square(8), d(5)]));
