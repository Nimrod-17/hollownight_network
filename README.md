# Diario di Hallownest

Sito esplorabile del network di lore di Hollow Knight / Silksong, costruito settimana per settimana.

## Struttura

- `index.html` — struttura della pagina
- `style.css` — tema visivo (palette, tipografia)
- `main.js` — logica del grafo (D3 force simulation) e meccanica di rivelazione progressiva
- `data.json` — dataset dei nodi/archi. **Questo è solo un esempio con 8 nodi finti** — va sostituito con i dati veri estratti dal wiki.

## Formato di data.json

```json
{
  "nodes": [
    { "id": "id-univoco", "label": "Nome mostrato", "area": "Zona/categoria", "fragment": "Testo breve, originale, mostrato quando il nodo viene rivelato", "type": "character | location | ..." }
  ],
  "links": [
    { "source": "id-nodo-1", "target": "id-nodo-2" }
  ]
}
```

Importante: il campo `fragment` va scritto con parole tue, non copiato dal wiki (per non violare il copyright e perché è più coerente con lo stile "diario").

## Come funziona la rivelazione

Ogni nodo ha uno stato in `main.js`:
- `hidden`: non disegnato
- `glimpsed`: disegnato ma spento, senza etichetta né scheda
- `revealed`: cliccato, mostra la scheda nel pannello laterale e "accende" i suoi vicini a `glimpsed`

Cambia i nodi di partenza modificando `SEED_IDS` in cima a `main.js`.

## Sviluppo locale

Nessuna build richiesta. Basta aprire `index.html` con un server locale (per via del `fetch` su `data.json`, non funziona aprendo il file direttamente da disco):

```
python3 -m http.server 8000
```

poi vai su `http://localhost:8000`.

## Pubblicazione su GitHub Pages

Vedi le istruzioni fornite a parte per creare il repository e attivare Pages.
