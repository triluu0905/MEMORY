import assert from 'node:assert/strict';
import test from 'node:test';
import { diffSamples } from '../dist-server/server/sample-history.js';

test('sample history records meaningful edits and ignores display timestamps', () => {
  const sample = { id: 's1', code: 'B1', steps: [{ id: 'st1', date: '2026-11-24', procText: 'Mix', chems: [], cond: {}, res: {}, images: [], note: '', upd: 100 }] };
  const workspace = samples => ({ projects: [{ id: 'p1', children: [], samples }], charts: [] });
  assert.equal(diffSamples(workspace([sample]), workspace([{ ...sample, steps: [{ ...sample.steps[0], upd: 200 }] }])).length, 0);
  const updated = { ...sample, steps: [{ ...sample.steps[0], procText: 'Mix and heat', chems: [{ id: 'c1', name: 'NaCl', amount: '2', unit: 'g' }] }] };
  const changes = diffSamples(workspace([sample]), workspace([updated]));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'edited');
  assert.deepEqual(changes[0].changes.find(change => change.field === 'Bước 1 · Quy trình'),
    { field: 'Bước 1 · Quy trình', before: 'Mix', after: 'Mix and heat' });
  assert.deepEqual(changes[0].changes.find(change => change.field === 'Bước 1 · Hóa chất 1 · Định lượng'),
    { field: 'Bước 1 · Hóa chất 1 · Định lượng', before: '', after: '2 g' });
  assert.equal(diffSamples(workspace([]), workspace([sample]))[0].type, 'created');
  assert.equal(diffSamples(workspace([sample]), workspace([]))[0].type, 'deleted');
});
