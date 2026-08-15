import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emitAilFromSource, harvestTopNumConsts } from '../src/emitter.mjs';
import { emitOneTarget } from '../scripts/clone_lin_multi.mjs';
import { parseStmts } from '../src/body_ast.mjs';

const harvested = harvestTopNumConsts('const s=1000; const m=s*60; const y=d*365.25; const d=86400000;');
assert.equal(harvested.s, 1000);
assert.equal(harvested.m, 60000);

const throwLin = `@LIN:L1c:0.2
^schema_once ^lossy=true ^ops=test
~G{?=if #=for ^=ret :else}
!boom(value){?(typeof value!='string'){throw new Error( ("must be a string or number. value="+(JSON.stringify(value))),)}^value}
=ex{boom}`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lin_ms_surf_'));
for (const t of ['py', 'go', 'rust', 'java']) {
  const row = emitOneTarget(throwLin, 'boom', t, work);
  assert.equal(row.status, 'PASS', `${t} throw: ${row.reason}`);
}

const sw = parseStmts("switch (u){case 'y': case 'year':;^n*y;default: throw new Error('bad')}");
assert.equal(sw[0].type, 'if');
assert.match(sw[0].cond, /u=='y'/);

const src = `
const s = 1000;
const m = s * 60;
function fmtShort(ms){ const msAbs = Math.abs(ms); if (msAbs >= m) return Math.round(ms / m) + 'm'; return ms + 'ms'; }
`;
const fileLia = emitAilFromSource(src, { shortenLocals: false });
assert.match(fileLia, /\$K\{/);
assert.match(fileLia, /\bm=/);
const fileRow = emitOneTarget(fileLia.replace(/^@LIA:/, '@LIN:').replace(/^@AIL:/, '@LIN:'), 'FmtShort', 'py', work);
assert.equal(fileRow.status, 'PASS', `file py: ${fileRow.reason}`);

console.log('ok emit_ms_surface');
