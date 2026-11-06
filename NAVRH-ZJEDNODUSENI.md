# Návrh: jak zjednodušit objednávání parfémů

## Teď (stav po spuštění webu)
Web → tlačítko „Objednat“ → Google formulář → zákaznice ručně vypíše číslo vůně → platba QR kódem → Dagmar ručně kontroluje platbu a posílá parfém.

## Krok 1 – rychlé vylepšení (zdarma, 15 minut)
1. **Předvyplněný formulář**: v Google Formulářích (⋮ → „Získat předvyplněný odkaz“) vygenerovat odkaz,
   kde je políčko „číslo parfému“ už vyplněné. Web pak u každé vůně pošle zákaznici rovnou
   s vybraným číslem – jedno políčko méně a žádné překlepy. (Stačí mi poslat ten odkaz, zapojím ho.)
2. **Číslo parfému jako výběr ze seznamu** (rozbalovací menu) místo volného textu.
3. **QR kód přímo na potvrzovací stránce formuláře** (nastavení → Prezentace → potvrzovací zpráva)
   + automatický e-mail s platebními údaji (doplněk *Form Notifications* nebo *Email Notifications for Forms*).
4. **Krátký odkaz** (např. `zahranicereality.cz/parfem`) a QR kód na leták/flakonek vedoucí na web.

## Krok 2 – poloautomatika (zdarma / pár set Kč měsíčně)
- **Make.com** (už ho máte připojený): nová odpověď ve formuláři → automaticky
  - e-mail zákaznici s QR platbou na přesnou částku a variabilním symbolem,
  - řádek do tabulky objednávek,
  - upozornění Dagmar na telefon/e-mail.
- Zákaznice tak ihned dostane vše, co potřebuje, a Dagmar nemusí nic ručně psát.

## Krok 3 – plnohodnotný nákup na jedno kliknutí
Pokud objednávek přibude, nahradit formulář jednoduchou platební bránou:
- **Stripe Payment Links** nebo **GoPay / Comgate** – tlačítko „Koupit“ u každé vůně → platba kartou/Apple Pay → hotovo.
- Alternativně malý e-shop (Shoptet, Webnode e-shop) s napojením na **Zásilkovnu**.

## Co potřebuji od Dagmar
- **Cenu** parfému (v podkladech na Drivu jsem ji nenašel) a velikost flakonku.
- Fotky flakonků (stačí z mobilu) – doplním je do karet vůní.
- Potvrzení čísel: na podkladu jsou **dvakrát P3** (druhé jsem označil jako P4)
  a **DC 3 a DC 4 mají stejné složení** (růžová růže, lotos).
- Zda zahrnout i parfémy **Já jsem prostor** a **Svoboda v těle** (texty k nim na Drivu jsou).
