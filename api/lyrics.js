import { countSyllables } from '../czech.js';

const MODEL = process.env.LYRICS_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
const MAX_ATTEMPTS = 3;

const MOODS = {
  radostna: 'radostná, světlá',
  melancholicka: 'melancholická, nostalgická',
  romanticka: 'romantická, něžná',
  hymnicka: 'slavnostní, hymnická',
  humorna: 'humorná, hravá',
  detska: 'dětská, jednoduchá slova pro malé děti',
  duchovni: 'duchovní, meditativní',
};
const RHYMES = {
  AABB: 'sdružený rým (AABB) – rýmují se vždy dva po sobě jdoucí verše',
  ABAB: 'střídavý rým (ABAB)',
  none: 'bez povinného rýmu, ale zvukomalebně',
};

const SYSTEM = `Jsi zkušený český textař. Píšeš texty písní na hotovou melodii.
Každá nota melodie nese přesně jednu slabiku textu, proto MUSÍ každý verš mít přesně zadaný počet slabik.
Pravidla:
- Počet slabik ve verši = počet not. Počítej pečlivě (slabikotvorné r a l se počítá: vlk = 1, srdce = 2).
- Čeština má přízvuk na první slabice slova. Na silné doby (DA) dávej začátky slov, na slabé (da) pokračování slov nebo jednoslabičná slova.
- Na dlouhé noty (označené ~) dávej slabiky s otevřenou samohláskou (a, o, e, í, ú), ideálně na konci slova.
- Piš přirozenou, zpívatelnou češtinu, bez násilných inverzí a bez archaismů.
- Vrať POUZE JSON ve tvaru {"title": "název", "lines": ["verš 1", "verš 2", ...]} – přesně jeden verš na každou frázi, bez slabikových pomlček.`;

function buildRequest({ phrases, theme, mood, rhyme }) {
  const lines = phrases.map((p, i) => `Verš ${i + 1}: ${p.syllables} slabik – ${p.pattern}`).join('\n');
  return `Téma: ${theme || 'volné, podle nálady melodie'}
Nálada: ${MOODS[mood] || MOODS.radostna}
Rýmy: ${RHYMES[rhyme] || RHYMES.AABB}

Melodie má ${phrases.length} frází:
${lines}`;
}

function parseLines(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      const j = JSON.parse(text.slice(s, e + 1));
      if (Array.isArray(j.lines)) return { title: String(j.title || ''), lines: j.lines.map(String) };
    } catch { /* fallback níže */ }
  }
  const lines = text.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|verš \d+:|[-*•])\s*/i, '').trim())
    .filter((l) => l && !/^[{}[\]`]/.test(l));
  return { title: '', lines };
}

function evaluate(lines, targets) {
  const counts = targets.map((_, i) => (lines[i] ? countSyllables(lines[i]) : 0));
  const score = counts.reduce((s, c, i) => s + Math.abs(c - targets[i]), 0)
    + 3 * Math.abs(lines.length - targets.length);
  return { counts, score };
}

async function callModel(messages) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'X-Title': 'Melodie na slova',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, temperature: 0.8, messages }),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`AI odpověděla chybou ${r.status}`); }
  if (!r.ok || data.error) throw new Error(data.error?.message || `AI odpověděla chybou ${r.status}`);
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Chybí OPENROUTER_API_KEY v nastavení serveru (Vercel → Environment Variables).' });
  }

  const body = req.body || {};
  const phrases = Array.isArray(body.phrases) ? body.phrases.slice(0, 40) : [];
  if (!phrases.length || phrases.some((p) => !Number.isInteger(p?.syllables) || p.syllables < 1 || p.syllables > 40)) {
    return res.status(400).json({ error: 'Neplatná melodie.' });
  }
  const clean = phrases.map((p) => ({
    syllables: p.syllables,
    pattern: String(p.pattern || '').replace(/[^DAda~ ]/g, '').slice(0, 200),
  }));
  const targets = clean.map((p) => p.syllables);
  const request = {
    phrases: clean,
    theme: String(body.theme || '').slice(0, 500),
    mood: String(body.mood || ''),
    rhyme: String(body.rhyme || ''),
  };

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildRequest(request) },
  ];

  let best = null;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const content = await callModel(messages);
      const parsed = parseLines(content);
      const ev = evaluate(parsed.lines, targets);
      if (!best || ev.score < best.score) best = { ...parsed, ...ev, attempts: attempt };
      if (ev.score === 0) break;

      // řekni AI, které verše nesedí, a nech je opravit
      const fixes = targets.map((t, i) => {
        if (!parsed.lines[i]) return `Verš ${i + 1} chybí, potřebuje ${t} slabik.`;
        if (ev.counts[i] !== t) return `Verš ${i + 1} „${parsed.lines[i]}" má ${ev.counts[i]} slabik, potřebuje přesně ${t}.`;
        return null;
      }).filter(Boolean);
      if (parsed.lines.length > targets.length) fixes.push(`Veršů je ${parsed.lines.length}, potřebuji přesně ${targets.length}.`);
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `Oprav to:\n${fixes.join('\n')}\nVrať znovu celý JSON se všemi verši.` });
    }
  } catch (e) {
    if (!best) return res.status(502).json({ error: e.message });
  }

  return res.status(200).json({
    title: best.title,
    lines: best.lines.slice(0, targets.length),
    counts: best.counts,
    targets,
    attempts: best.attempts,
  });
}
