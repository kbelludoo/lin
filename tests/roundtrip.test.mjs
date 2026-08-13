import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileLiaToJs, parseLia } from '../src/compiler.mjs';
import { LIA_HEADER } from '../src/emitter.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lia = fs.readFileSync(path.join(root, 'examples', 'safe-compare.lia'), 'utf8');

assert.ok(lia.startsWith('@LIA:'), 'example must use @LIA header');
assert.equal(LIA_HEADER, '@LIA:L1c:0.2');

const { js, program } = compileLiaToJs(lia, { exportMode: 'single' });
assert.equal(program.fns[0].name, 'safeCompare');

const tmp = path.join(root, 'examples', '.tmp_safe.cjs');
fs.writeFileSync(tmp, js, 'utf8');
const fn = require(tmp);

assert.equal(fn('ab', 'ab'), true);
assert.equal(fn('a', 'b'), false);
assert.equal(fn('prefix', 'pre'), false);
assert.equal(fn('', ''), true);

// Dual-read legacy @AIL header
const legacy = lia.replace('@LIA:', '@AIL:');
const legacyProg = parseLia(legacy);
assert.equal(legacyProg.header, '@AIL:L1c:0.2');
const { js: jsLegacy } = compileLiaToJs(legacy, { exportMode: 'single' });
fs.writeFileSync(tmp, jsLegacy, 'utf8');
delete require.cache[require.resolve(tmp)];
const fn2 = require(tmp);
assert.equal(fn2('ab', 'ab'), true);

fs.unlinkSync(tmp);
console.log('ok roundtrip safe-compare (+ legacy @AIL dual-read)');
