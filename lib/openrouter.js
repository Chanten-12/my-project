export const MODEL = process.env.LYRICS_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

export async function callModel(messages, { maxTokens = 1200, temperature = 0.8 } = {}) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'X-Title': 'Melodie na slova',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature, messages }),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`AI odpověděla chybou ${r.status}`); }
  if (!r.ok || data.error) throw new Error(data.error?.message || `AI odpověděla chybou ${r.status}`);
  return data.choices?.[0]?.message?.content || '';
}

// Vytáhne první JSON objekt z odpovědi (i když je obalený ```json).
export function extractJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

export function requireKey(res) {
  if (process.env.OPENROUTER_API_KEY) return true;
  res.status(500).json({ error: 'Chybí OPENROUTER_API_KEY v nastavení serveru (Vercel → Environment Variables).' });
  return false;
}
