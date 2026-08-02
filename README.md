# Prog Magic — Simulatore MTG (consistenza & goldfish)

App web per simulare mazzi di **Magic: The Gathering** (formato 60 carte) e
confrontarne due. Incolli due liste, l'app risolve le carte su
[Scryfall](https://scryfall.com/docs/api) e gira migliaia di simulazioni
Monte Carlo "goldfish" (ogni mazzo gioca da solo, senza avversario) per stimare
consistenza, velocità e curva. Poi stima il matchup, spiega i numeri,
suggerisce le giocate e un piano di sideboard, e mostra un replay illustrato di
una partita rappresentativa.

> ⚠️ La percentuale di matchup **non è una win-rate reale**: è una stima che
> combina velocità/consistenza in solitaria con l'interazione sulla carta
> (rimozioni, counter, spazzavia vs minacce). Serve a confrontare i motori dei
> mazzi, non a predire l'esito della partita.

## Funzionalità

- Import decklist in formato Arena/MTGO (con sezione `Sideboard`).
- Risoluzione carte + immagini via Scryfall (endpoint `/cards/collection`).
- Simulazione Monte Carlo in un **Web Worker** (UI sempre reattiva):
  mulligan alla londinese, pescate, giocate terra, pagamento del mana con i
  colori, lancio delle magie.
- **Ramp modellato**: mana dork/rock (con malattia da evocazione) e ramp che
  mette terre in gioco.
- Metriche: mani tenute a 7, mulligan medi, turno "attivo", terre/mana per
  turno, disponibilità colore, curva di mana.
- **Confronto spiegabile** tra i due mazzi (breakdown dei fattori) + **% post-side**.
- **Suggerimenti di matchup** e **piano di sideboard** basati sui ruoli delle
  carte (rimozioni, counter, spazzavia, minacce, carte-odio di colore…).
- **Replay illustrato** turno-per-turno con zoom delle carte al passaggio del mouse.

## Avvio

```bash
npm install
npm run dev
```

Poi apri http://localhost:5173.

Per usarla da un altro dispositivo sulla stessa rete Wi-Fi:

```bash
npm run dev -- --host
```

## Build di produzione

```bash
npm run build      # genera dist/
npm run preview    # anteprima della build
```

## Stack

Vite + React + TypeScript. Nessun backend: tutto gira nel browser.

## Struttura

```
src/
  scryfall.ts        risoluzione carte + immagini + abilità di mana
  deckParser.ts      parser decklist (main + sideboard)
  cardRoles.ts       deduzione ruoli/odio dal testo oracle
  compare.ts         confronto euristico (fattori) tra i due mazzi
  advice.ts          consigli di matchup + piano di sideboard
  sim/
    engine.ts        motore Monte Carlo goldfish (mulligan, mana, ramp)
    worker.ts        wrapper Web Worker
    runner.ts        avvio del worker dalla UI
  components/         UI (statistiche, confronto, consigli, replay)
```

## Limiti noti

- Simulazione goldfish: nessun avversario, nessuna interazione reale in partita.
- Mana: terre + ramp in modo semplificato; le creature-mana non tappano il
  turno in cui entrano; rituali one-shot (es. Dark Ritual) non modellati.
- Carte a doppia faccia: usata la faccia frontale; costi ibridi = generico.
- Ruoli/odio delle carte dedotti dal testo oracle (euristica imperfetta).

Dati e immagini delle carte © [Scryfall](https://scryfall.com).
