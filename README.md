# Peptide News Analytics

Railway-ready Flask MVP for a peptide-focused news analytics dashboard.

The first deploy uses a seeded sample dataset so the dashboard is useful before Snowflake, scheduled ingestion, and NLP enrichment are wired in. The dashboard is now oriented around reviewable tables, source/topic filters, and peptide type slicers instead of sentiment.

## Local Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Visit `http://localhost:5000`.

## API

- `GET /api/articles`
- `GET /api/summary`
- `GET /api/topics`
- `GET /api/peptide-types`
- `GET /api/trends`

`/api/articles` supports `topic`, `source`, `peptide_type`, `hours`, `limit`, `offset`, `search`, `sort`, and optional `live=1`.

## World News API

The app keeps seeded sample data as the default. For live experiments, set `WORLDNEWSAPI_KEY` in the environment and call:

```text
/api/articles?live=1
```

Do not commit real API keys. Add `WORLDNEWSAPI_KEY` in Railway variables when live ingestion becomes part of the product.

The World News API search response can provide article text, summary, URL, image URL, publish date, authors, category, language, source country, and sentiment. This app currently uses those fields to build article review tables and local peptide-type classifications; sentiment is intentionally not part of the main UI.
