# World News Homepage

Railway-ready Flask MVP for a consumer world-news homepage backed by World News API.

The app calls World News API live when `WORLDNEWSAPI_KEY` is available. If the API key is missing or the API is unavailable, it falls back to a small generic sample dataset so the page still renders locally and on Railway.

## Product Direction

- Broad world news, not peptide-specific.
- Consumer homepage first, dashboard later.
- Images are preserved and shown on article cards.
- World News API `sentiment` and `category` are intentionally not used in the UI.
- Primary filters are search, source country, publisher domain, time window, and sort.

## Local Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Visit `http://localhost:5000`.

For live data:

```powershell
$env:WORLDNEWSAPI_KEY="your-key-here"
python app.py
```

Do not commit real API keys. Add `WORLDNEWSAPI_KEY` in Railway variables.

## API

- `GET /api/articles`
- `GET /api/summary`
- `GET /api/facets`
- `GET /api/trends`

`/api/articles` supports `search`, `country`, `source`, `hours`, `images`, `sort`, `limit`, and `offset`.
