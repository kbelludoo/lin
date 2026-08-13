import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileAilToJs } from '../src/compiler.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ail = fs.readFileSync(path.join(root, 'examples', 'safe-compare.ail'), 'utf8');

const { js, program } = compileAilToJs(ail, { exportMode: 'single' });
assert.equal(program.fns[0].name, 'safeCompare');

const tmp = path.join(root, 'examples', '.tmp_safe.cjs');
fs.writeFileSync(tmp, js, 'utf8');
const fn = require(tmp);

assert.equal(fn('ab', 'ab'), true);
assert.equal(fn('a', 'b'), false);
assert.equal(fn('prefix', 'pre'), false);
assert.equal(fn('', ''), true);

fs.unlinkSync(tmp);
console.log('ok roundtrip safe-compare');
