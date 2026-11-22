// Česká slabikace: počítání a dělení slabik pro zarovnání textu na noty.
// Heuristika – pokrývá běžnou češtinu včetně slabikotvorného r/l (vlk, Petr, srdce).

const VOWELS = 'aáeéěiíoóuúůyý';
const isLetter = (c) => !!c && /\p{L}/u.test(c);
const isVowel = (c) => !!c && VOWELS.includes(c);

// Vrátí pozice slabičných jader [start, end] ve slově.
export function nuclei(word) {
  const w = word.toLowerCase();
  const res = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (!isLetter(c)) continue;
    if (isVowel(c)) {
      let end = i;
      // dvojhláska "ou" (kouzlo, mou); "au"/"eu" jen na začátku slova (auto, euro),
      // aby se nespojovaly předpony jako na-učit, ne-umím
      if (w[i + 1] === 'u' && (c === 'o' || ((c === 'a' || c === 'e') && i === firstLetter(w)))) end = i + 1;
      res.push([i, end]);
      i = end;
      continue;
    }
    if (c === 'r' || c === 'l') {
      const prev = isLetter(w[i - 1]) ? w[i - 1] : null;
      const next = isLetter(w[i + 1]) ? w[i + 1] : null;
      if (prev && !isVowel(prev) && !isVowel(next)) res.push([i, i]);
    }
  }
  return res;
}

function firstLetter(w) {
  for (let i = 0; i < w.length; i++) if (isLetter(w[i])) return i;
  return -1;
}

const SIBILANTS = 'sšzž';
const LIQUIDS = 'rlřvjň';
function allowedOnset(u) {
  if (u.length === 2) return LIQUIDS.includes(u[1]) || SIBILANTS.includes(u[0]);
  if (u.length === 3) return SIBILANTS.includes(u[0]) && LIQUIDS.includes(u[2]);
  return true;
}

export function syllabifyWord(word) {
  const nu = nuclei(word);
  if (nu.length <= 1) return [word];
  const w = word.toLowerCase();
  const cuts = [];
  for (let k = 1; k < nu.length; k++) {
    const a = nu[k - 1][1] + 1;
    const b = nu[k][0];
    // souhlásky mezi jádry jako jednotky ("ch" je jedna hláska)
    const units = [];
    for (let i = a; i < b; i++) {
      if (w[i] === 'c' && w[i + 1] === 'h' && i + 1 < b) { units.push([i, 'ch']); i++; }
      else units.push([i, w[i]]);
    }
    // co nejdelší povolený začátek další slabiky (za-hra-da, se-stra, ve-čer-ní)
    let take = Math.min(units.length, 1);
    for (let n = Math.min(3, units.length); n >= 2; n--) {
      if (allowedOnset(units.slice(-n).map((u) => u[1]))) { take = n; break; }
    }
    cuts.push(units.length ? units[units.length - take][0] : b);
  }
  const parts = [];
  let from = 0;
  for (const cut of cuts) {
    parts.push(word.slice(from, cut));
    from = cut;
  }
  parts.push(word.slice(from));
  return parts;
}

// Rozdělí verš na slabiky. Neslabičné předložky (v, s, k, z) se připojí k dalšímu slovu.
// Vrací [{ text, wordStart, wordEnd }]
export function syllabifyLine(line) {
  const tokens = String(line || '').split(/\s+/).filter(Boolean);
  const out = [];
  let pending = '';
  for (const tok of tokens) {
    if (nuclei(tok).length === 0) {
      pending += tok + ' ';
      continue;
    }
    const parts = syllabifyWord(tok);
    parts.forEach((p, i) => {
      out.push({
        text: (i === 0 ? pending : '') + p,
        wordStart: i === 0,
        wordEnd: i === parts.length - 1,
      });
    });
    pending = '';
  }
  if (pending && out.length) out[out.length - 1].text += ' ' + pending.trim();
  return out;
}

export function countSyllables(line) {
  return syllabifyLine(line).length;
}
