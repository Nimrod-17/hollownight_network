# Hallownest Diary

An explorable lore network for Hollow Knight / Silksong, built week by week.

## Structure

- `index.html` — page structure
- `style.css` — visual theme (palette, typography)
- `main.js` — graph logic (D3 force simulation) and the progressive-reveal mechanic
- `data.json` — node/edge dataset. **This is just a placeholder with 8 fake nodes** — replace it with the real data scraped from the wiki.

## data.json format

```json
{
  "nodes": [
    { "id": "unique-id", "label": "Display name", "area": "Zone/category", "fragment": "Short, original text shown when the node is revealed", "type": "character | location | ..." }
  ],
  "links": [
    { "source": "node-id-1", "target": "node-id-2" }
  ]
}
```

Important: write the `fragment` field in your own words, not copied from the wiki (to respect copyright and to keep the "diary" voice consistent).

## How the reveal mechanic works

Every node has a state tracked in `main.js`:
- `hidden`: not drawn
- `glimpsed`: drawn but dim, no label or card
- `revealed`: clicked, shows the card in the side panel and "lights up" its neighbors to `glimpsed`

Change the starting nodes by editing `SEED_IDS` at the top of `main.js`.

## Local development

No build step required. Just open `index.html` through a local server (the `fetch` call on `data.json` won't work if you open the file directly from disk):

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Publishing on GitHub Pages

See the separate instructions for creating the repository and enabling Pages.
