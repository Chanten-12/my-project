# Melodie na slova

Webová appka, která „přeloží" nahranou melodii do slov:

- **Co říká hudba** – z hudebního charakteru melodie (tónina, tempo, pohyb, tvar, závěr) napíše AI
  poselství, obrazy, vysvětlení „proč to tak zní" a otevřené otázky ve stylu Orakula (`api/meaning.js`).
- **Text písně** – český text, který přesně sedne do not (`api/lyrics.js`).

Jak to funguje:

1. Uživatel nahraje melodii (mikrofon nebo soubor) – broukání, pískání, zpěv „la la" nebo jeden nástroj.
2. V prohlížeči se rozpoznají tóny (`melody.js`, algoritmus YIN), rozdělí se na fráze podle pauz
   a u každé fráze se určí počet slabik, silné doby a dlouhé noty. Funkce `describe()` z tónů
   odvodí tóninu (dur/moll), tempo, rozsah, krokový/skokový pohyb, tvar frází a závěr.
3. Server (`api/lyrics.js`) nechá AI napsat text. Slabiky každého verše sám přepočítá (`czech.js`)
   a když nesedí, pošle AI opravu (až 3 pokusy).
4. Text se zobrazí slabiku po slabice pod notami a dá se ručně upravovat.

## Nasazení na Vercel

1. Importovat repozitář na vercel.com (žádný build krok není potřeba).
2. V **Settings → Environment Variables** nastavit:
   - `OPENROUTER_API_KEY` – klíč z openrouter.ai (stejný jako u Orakula),
   - `LYRICS_MODEL` (nepovinné) – model z OpenRouteru. Výchozí je bezplatná Llama 3.3 70B;
     placený model počítá české slabiky výrazně přesněji.

## Testy

```
npm test
```

## Omezení

- Funguje pro jednohlasou melodii, ne pro akordy ani skladby s doprovodem.
- Opakované stejné tóny se rozliší jen s nástupem (úder, nový nádech, „la-la").
- Fráze (verše) se dělí podle pauz delších než 0,3 s.
