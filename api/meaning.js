import { callModel, extractJson, requireKey } from '../lib/openrouter.js';

const TRAIT_KEYS = ['tónina', 'tempo', 'výška', 'rozsah', 'pohyb', 'opakování', 'rytmus', 'tvar', 'tvar frází', 'závěr'];

const SYSTEM = `Jsi citlivý průvodce, který rozumí hudbě a umí ji „přeložit" do slov.
Dostaneš hudební charakter melodie (tóninu, tempo, pohyb, tvar, závěr…). Řekni, co ta melodie říká.
Vycházej VÝHRADNĚ z uvedených hudebních vlastností – nevymýšlej si nástroje, žánr ani text.
Piš česky, v 2. osobě jednotného čísla (ty), lehce a poeticky, ale srozumitelně. Žádné odborné žargony bez vysvětlení.
Vrať POUZE JSON:
{
  "title": "krátký název poselství (2–5 slov)",
  "message": "poselství melodie, 3–5 vět",
  "images": ["3–5 krátkých obrazů nebo pocitů, které melodie vyvolává"],
  "why": ["2–4 krátká vysvětlení ve tvaru: hudební vlastnost → co vyjadřuje"],
  "questions": ["5 krátkých otevřených otázek, které melodie otevírá – ve stylu Access Consciousness, např. Co dalšího je možné?"]
}`;

const list = (v, max) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, max) : []);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireKey(res)) return;

  const traits = req.body?.traits;
  if (!traits || typeof traits !== 'object') return res.status(400).json({ error: 'Chybí popis melodie.' });
  const lines = TRAIT_KEYS
    .filter((k) => typeof traits[k] === 'string' && traits[k])
    .map((k) => `- ${k}: ${traits[k].slice(0, 160)}`);
  if (!lines.length) return res.status(400).json({ error: 'Chybí popis melodie.' });
  const situation = String(req.body?.situation || '').slice(0, 500).trim();

  const user = `Hudební charakter melodie:\n${lines.join('\n')}` +
    (situation ? `\n\nČlověk, který melodii přinesl, se ptá nebo řeší: „${situation}". Vztáhni poselství i otázky k tomu.` : '');

  try {
    const content = await callModel([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ], { temperature: 0.85 });
    const j = extractJson(content);
    if (!j || !j.message) return res.status(502).json({ error: 'AI vrátila nečitelnou odpověď, zkus to prosím znovu.' });
    return res.status(200).json({
      title: String(j.title || ''),
      message: String(j.message),
      images: list(j.images, 6),
      why: list(j.why, 5),
      questions: list(j.questions, 8),
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
