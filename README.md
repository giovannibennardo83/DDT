# DDT Manager

Mini applicazione web per creare, modificare, archiviare e stampare Documenti di Trasporto (DDT).

## File principali

- `index.html`: form Nuovo/Modifica con matrice righe ripetibile.
- `app.js`: logica UI (righe DDT, validazioni, scanner codice/lotto, modifica record).
- `db.js`: helper storage su `localStorage` + migrazione schema righe legacy.
- `print.html`: layout di stampa DDT in formato tabellare (15 righe fisse).
- `styles.css`: stili della UI, incluso layout mobile a card per le righe.
- `manifest.json` e `sw.js`: base PWA/offline.

## Schema dati righe

Ogni DDT salva le righe nel formato:

```json
{
  "righe": [
    {
      "codice_articolo": "ART-001",
      "lotto": "L-2401",
      "quantita": 1
    }
  ]
}
```

### Migrazione automatica

I DDT salvati con campi legacy (`articolo` / `descrizione`) vengono convertiti automaticamente in `codice_articolo` per non perdere dati.

## Uso

Apri `index.html` in un browser moderno.

1. Compila testata DDT.
2. Usa **Aggiungi riga** per inserire più righe (`codice_articolo`, `lotto`, `quantita`).
3. Salva, poi riapri con **Modifica** o stampa con **Stampa**.
