import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables, syllabifyWord } from '../czech.js';
import { analyze, midiToFreq, midiToName, SAMPLE_RATE } from '../melody.js';

test('počítání českých slabik', () => {
  const cases = {
    'mama': 2, 'kouzlo': 2, 'vlk': 1, 'Petr': 2, 'srdce': 2, 'smrt': 1, 'čtvrt': 1,
    'auto': 2, 'neumím': 3, 'naučit': 3, 'zahrada': 3, 'hvězdy': 2, 'slunce': 2,
    'v lese': 2, 'Večerní hvězda svítí nad tmou': 9, 'Na horách sníh': 4,
  };
  for (const [text, n] of Object.entries(cases)) assert.equal(countSyllables(text), n, text);
});

test('dělení slova', () => {
  assert.deepEqual(syllabifyWord('zahrada'), ['za', 'hra', 'da']);
  assert.deepEqual(syllabifyWord('večerní'), ['ve', 'čer', 'ní']);
});

test('názvy tónů', () => {
  assert.equal(midiToName(60), 'C4');
  assert.equal(midiToName(70), 'B4');
  assert.equal(midiToName(71), 'H4');
});

// syntetická melodie: tóny s harmonickými, náběhem a doznivem; null = pauza
function synth(seq) {
  const sr = SAMPLE_RATE;
  const total = seq.reduce((s, [, d]) => s + d, 0);
  const out = new Float32Array(Math.ceil(total * sr) + sr / 4);
  let pos = 0;
  for (const [m, d] of seq) {
    const n = Math.floor(d * sr);
    if (m !== null) {
      const f = midiToFreq(m) * (1 + 0.003 * Math.sin(pos)); // lehké rozladění
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.015) * Math.min(1, (n - i) / (0.03 * sr));
        const v = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t);
        out[pos + i] = 0.3 * env * v + (Math.random() - 0.5) * 0.004;
      }
    }
    pos += n;
  }
  return out;
}

test('rozpozná tóny, opakované noty a fráze', () => {
  const seq = [
    [67, 0.3], [67, 0.3], [69, 0.3], [67, 0.3], [72, 0.3], [71, 0.6], // fráze 1: 6 tónů
    [null, 0.5],
    [67, 0.3], [67, 0.3], [69, 0.3], [67, 0.3], [74, 0.3], [72, 0.7], // fráze 2: 6 tónů
  ];
  const { notes, phrases } = analyze(synth(seq));
  const expected = seq.filter(([m]) => m !== null).map(([m]) => m);
  assert.deepEqual(notes.map((n) => n.midi), expected);
  assert.equal(phrases.length, 2);
  assert.deepEqual(phrases.map((p) => p.syllables), [6, 6]);
  assert.ok(phrases[0].notes[5].long, 'poslední tón fráze je dlouhý');
});

test('ticho nevrací žádné tóny', () => {
  const { notes } = analyze(new Float32Array(SAMPLE_RATE));
  assert.equal(notes.length, 0);
});

test('charakter melodie: tónina, tvar a závěr', async () => {
  const { describe } = await import('../melody.js');
  // C dur stupnice nahoru a zpět dolů na C, pak fráze stoupající na G (otevřený konec)
  const up = [60, 62, 64, 65, 67, 65, 64, 62, 60].map((m) => [m, 0.3]);
  up[up.length - 1][1] = 0.8;
  const r1 = analyze(synth(up));
  const d1 = describe(r1);
  assert.equal(d1.key.name, 'C dur');
  assert.equal(d1.contour, 'oblouk');
  assert.equal(d1.ending, 'uzavřený');
  assert.match(d1.traits.pohyb, /krokový/);

  // a moll, končí na E nahoře
  const minor = [57, 60, 64, 62, 60, 59, 57, 64].map((m) => [m, 0.35]);
  const d2 = describe(analyze(synth(minor)));
  assert.equal(d2.key.name, 'a moll');
  assert.equal(d2.ending, 'pootevřený');
});
