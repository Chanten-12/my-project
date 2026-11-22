import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/lyrics.js';

function mockRes() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('opraví verše, které nemají správný počet slabik', async () => {
  process.env.OPENROUTER_API_KEY = 'test';
  const answers = [
    '{"title":"Moře","lines":["Moře šumí tiše","Večerní vlny zpívají"]}',
    '```json\n{"title":"Moře","lines":["Moře šumí tiše","Vlny tiše zpívají"]}\n```',
    '{"title":"Moře","lines":["Moře šumí tiše","Vlny k nám zpívají"]}',
  ];
  const sent = [];
  globalThis.fetch = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: answers[sent.length - 1] } }] }), { status: 200 });
  };
  const res = mockRes();
  await handler({ method: 'POST', body: { phrases: [{ syllables: 6, pattern: 'DA da' }, { syllables: 6, pattern: 'DA da' }], theme: 'moře' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.counts, [6, 6]);
  assert.equal(res.body.lines[1], 'Vlny k nám zpívají');
  assert.equal(res.body.attempts, 3);
  const fixMsg = sent[1].messages.at(-1).content;
  assert.match(fixMsg, /Verš 2 .* má 8 slabik, potřebuje přesně 6/);
});

test('odmítne neplatnou melodii', async () => {
  process.env.OPENROUTER_API_KEY = 'test';
  const res = mockRes();
  await handler({ method: 'POST', body: { phrases: [{ syllables: 'x' }] } }, res);
  assert.equal(res.code, 400);
});
