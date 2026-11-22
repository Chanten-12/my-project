// Rozpoznání melodie z jednohlasé nahrávky: výška tónů (YIN), dělení na noty a fráze.

export const SAMPLE_RATE = 16000;
const FRAME = 1024;
const HOP = 256;

// YIN odhad základní frekvence jednoho okna. Vrací { f0, conf } nebo null.
export function yinPitch(buf, sr, minF = 65, maxF = 1100, threshold = 0.15) {
  const W = Math.floor(buf.length / 2);
  const tauMin = Math.max(2, Math.floor(sr / maxF));
  const tauMax = Math.min(W - 1, Math.floor(sr / minF));
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // kumulativní normalizovaný rozdíl
  const cmnd = new Float32Array(tauMax + 2);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // žádné okno pod prahem – vezmi globální minimum, ale s nízkou jistotou
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    tau = best;
  }
  // parabolická interpolace
  let betterTau = tau;
  if (tau > 1 && tau < tauMax + 1) {
    const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }
  return { f0: sr / betterTau, conf: 1 - cmnd[tau] };
}

const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Česká jména tónů: B = B♭, H = B.
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B', 'H'];
export function midiToName(m) {
  const r = Math.round(m);
  return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function analyze(samples, sr = SAMPLE_RATE) {
  const dt = HOP / sr;
  const frames = [];
  for (let pos = 0; pos + FRAME <= samples.length; pos += HOP) {
    const buf = samples.subarray(pos, pos + FRAME);
    let e = 0;
    for (let j = 0; j < buf.length; j++) e += buf[j] * buf[j];
    const rms = Math.sqrt(e / buf.length);
    frames.push({ t: pos / sr, rms, ...yinPitch(buf, sr) });
  }
  const rmsMax = frames.reduce((m, f) => Math.max(m, f.rms), 0);
  if (rmsMax < 1e-4) return { notes: [], phrases: [], duration: samples.length / sr };

  const gate = rmsMax * 0.08;
  const midi = frames.map((f) => (f.conf >= 0.75 && f.rms >= gate ? freqToMidi(f.f0) : null));

  // mediánový filtr proti oktávovým skokům a šumu
  const smooth = midi.map((m, i) => {
    if (m === null) return null;
    const win = [];
    for (let k = i - 2; k <= i + 2; k++) if (midi[k] != null) win.push(midi[k]);
    return median(win);
  });

  // nástupy tónů z jemné obálky hlasitosti (rozliší opakované stejné noty)
  const onsetTimes = detectOnsets(samples, sr);
  const onset = frames.map(() => false);
  for (const t of onsetTimes) {
    const i = Math.round(t / dt);
    if (i >= 0 && i < onset.length) onset[i] = true;
  }

  const notes = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const dur = cur.end - cur.start;
    if (dur >= 0.07) {
      const m = median(cur.midis);
      notes.push({
        start: cur.start,
        end: cur.end,
        midi: Math.round(m),
        cents: Math.round((m - Math.round(m)) * 100),
        rms: cur.rmsSum / cur.midis.length,
        onset: cur.onset,
      });
    }
    cur = null;
  };
  for (let i = 0; i < frames.length; i++) {
    const m = smooth[i];
    if (m === null) { close(); continue; }
    const t = frames[i].t;
    if (cur) {
      const ref = median(cur.midis.slice(-8));
      const newOnset = onset[i] && cur.midis.length >= 4;
      if (Math.abs(m - ref) < 0.75 && !newOnset) {
        cur.midis.push(m);
        cur.rmsSum += frames[i].rms;
        cur.end = t + dt;
        continue;
      }
      close();
    }
    cur = { start: t, end: t + dt, midis: [m], rmsSum: frames[i].rms, onset: onset[i] };
  }
  close();

  // slouč krátké přerušení stejné noty bez nového nástupu
  const merged = [];
  for (const n of notes) {
    const p = merged[merged.length - 1];
    if (p && p.midi === n.midi && n.start - p.end < 0.05 && !n.onset) {
      p.end = n.end;
    } else merged.push({ ...n });
  }

  const phrases = splitPhrases(merged);
  return { notes: merged, phrases, duration: samples.length / sr };
}

// Najde lokální minima obálky, po kterých hlasitost výrazně vzroste (úder, nový nádech).
function detectOnsets(samples, sr) {
  const win = 256, hop = 64;
  const env = [];
  for (let pos = 0; pos + win <= samples.length; pos += hop) {
    let e = 0;
    for (let j = pos; j < pos + win; j++) e += samples[j] * samples[j];
    env.push(Math.sqrt(e / win));
  }
  const max = env.reduce((m, v) => Math.max(m, v), 0);
  const look = Math.round((0.04 * sr) / hop);
  const minGap = (0.08 * sr) / hop;
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < env.length - 1; i++) {
    if (!(env[i] <= env[i - 1] && env[i] <= env[i + 1])) continue;
    let peak = 0;
    for (let k = i + 1; k <= Math.min(env.length - 1, i + look); k++) peak = Math.max(peak, env[k]);
    if (peak > 0.1 * max && peak >= 1.6 * env[i] && i - last >= minGap) {
      out.push(((i * hop + win / 2) / sr));
      last = i;
    }
  }
  return out;
}

// ---------- hudební charakter melodie ----------

const KEY_NAMES = ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'As', 'A', 'B', 'H'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Tónina podle Krumhansl-Schmuckler (histogram tónů vážený délkou).
export function detectKey(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[((n.midi % 12) + 12) % 12] += n.end - n.start;
  let best = { r: -2 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, prof] of [['dur', MAJOR], ['moll', MINOR]]) {
      const rotated = prof.map((_, i) => prof[(i - tonic + 12) % 12]);
      const r = correlate(hist, rotated);
      if (r > best.r) best = { r, tonic, mode };
    }
  }
  const name = KEY_NAMES[best.tonic];
  return {
    tonic: best.tonic,
    mode: best.mode,
    name: best.mode === 'dur' ? `${name} dur` : `${name.toLowerCase()} moll`,
    confidence: Math.round(Math.max(0, best.r) * 100) / 100,
  };
}

function contourOf(ns) {
  const first = ns[0].midi, last = ns[ns.length - 1].midi;
  let maxI = 0, minI = 0;
  ns.forEach((n, i) => { if (n.midi > ns[maxI].midi) maxI = i; if (n.midi < ns[minI].midi) minI = i; });
  const peak = ns[maxI].midi, low = ns[minI].midi;
  if (maxI > 0 && maxI < ns.length - 1 && peak - first >= 2 && peak - last >= 2) return 'oblouk';
  if (minI > 0 && minI < ns.length - 1 && first - low >= 2 && last - low >= 2) return 'údolí';
  if (last - first >= 2) return 'stoupá';
  if (first - last >= 2) return 'klesá';
  return 'drží se';
}

// Popis charakteru melodie: čísla i česká slova pro AI a pro zobrazení.
export function describe({ notes, phrases }) {
  if (!notes.length) return null;
  const key = detectKey(notes);
  const durs = notes.map((n) => n.end - n.start);
  const span = phrases.reduce((s, p) => s + (p.notes[p.notes.length - 1].end - p.notes[0].start), 0);
  const notesPerSec = notes.length / (span || 1);
  const meanDur = durs.reduce((s, d) => s + d, 0) / durs.length;
  const cv = Math.sqrt(durs.reduce((s, d) => s + (d - meanDur) ** 2, 0) / durs.length) / meanDur;
  const midis = notes.map((n) => n.midi);
  const range = Math.max(...midis) - Math.min(...midis);
  const register = median(midis);

  const intervals = [];
  for (const p of phrases) for (let i = 1; i < p.notes.length; i++) intervals.push(p.notes[i].midi - p.notes[i - 1].midi);
  const abs = intervals.map(Math.abs);
  const steps = abs.filter((d) => d >= 1 && d <= 2).length;
  const leaps = abs.filter((d) => d >= 5).length;
  const repeats = abs.filter((d) => d === 0).length;
  const largestLeap = abs.length ? Math.max(...abs) : 0;

  const contours = phrases.map((p) => contourOf(p.notes));
  const overall = notes.length > 1 ? contourOf(notes) : 'drží se';
  const lastPc = ((notes[notes.length - 1].midi % 12) + 12) % 12;
  const fromTonic = (lastPc - key.tonic + 12) % 12;
  const ending = fromTonic === 0 ? 'uzavřený' : (fromTonic === 7 || fromTonic === 3 || fromTonic === 4) ? 'pootevřený' : 'otevřený';

  const n = intervals.length || 1;
  const traits = {
    tónina: `${key.name} (${key.mode === 'dur' ? 'jasná, světlá' : 'tmavší, niternější'})`,
    tempo: notesPerSec < 1.6 ? 'pomalé, rozvážné' : notesPerSec < 3.5 ? 'klidně plynoucí' : 'živé, rychlé',
    výška: register < 55 ? 'hluboko' : register > 74 ? 'vysoko' : 've středu',
    rozsah: range <= 5 ? 'úzký, skromný' : range <= 12 ? 'střední' : 'široký, rozmáchlý',
    pohyb: steps / n >= 0.6 ? 'krokový, plynulý' : leaps / n >= 0.3 ? 'skokový, odvážný' : 'kombinuje kroky a skoky',
    opakování: repeats / n >= 0.3 ? 'hodně opakovaných tónů – naléhavé, mluvní' : 'málo opakování',
    rytmus: cv < 0.25 ? 'pravidelný, stálý' : cv < 0.6 ? 'mírně proměnlivý' : 'volný, proměnlivý',
    tvar: overall,
    'tvar frází': contours.join(', '),
    závěr: ending === 'uzavřený' ? 'končí na základním tónu – doma, uzavřeně'
      : ending === 'pootevřený' ? 'končí blízko domova – pootevřeně' : 'končí mimo základní tón – otevřeně, jako otázka',
  };

  return {
    key, notesPerSec: Math.round(notesPerSec * 10) / 10, range, largestLeap,
    stepShare: Math.round((steps / n) * 100) / 100, leapShare: Math.round((leaps / n) * 100) / 100,
    contour: overall, phraseContours: contours, ending, traits,
  };
}

function splitPhrases(notes) {
  const groups = [];
  let g = [];
  notes.forEach((n, i) => {
    if (g.length && n.start - notes[i - 1].end >= 0.3) { groups.push(g); g = []; }
    g.push(n);
  });
  if (g.length) groups.push(g);

  // příliš dlouhé fráze rozděl v největší pauze (nebo v půlce)
  const out = [];
  const cut = (arr) => {
    if (arr.length <= 16) { out.push(arr); return; }
    let best = Math.floor(arr.length / 2), bestGap = -1;
    for (let i = 4; i < arr.length - 3; i++) {
      const gap = arr[i].start - arr[i - 1].end;
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    cut(arr.slice(0, best));
    cut(arr.slice(best));
  };
  groups.forEach(cut);

  return out.map((ns) => {
    const durs = ns.map((n) => n.end - n.start);
    const medDur = median(durs);
    const medRms = median(ns.map((n) => n.rms));
    const marked = ns.map((n, i) => {
      const dur = durs[i];
      const gapBefore = i === 0 ? Infinity : n.start - ns[i - 1].end;
      return {
        ...n,
        strong: i === 0 || dur >= 1.45 * medDur || n.rms >= 1.35 * medRms || gapBefore >= 0.15,
        long: i === ns.length - 1 || dur >= 1.8 * medDur,
      };
    });
    const pattern = marked.map((n) => (n.strong ? 'DA' : 'da') + (n.long ? '~' : '')).join(' ');
    return { notes: marked, syllables: marked.length, pattern };
  });
}
