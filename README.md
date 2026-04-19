# Peptide News Analytics

Railway-ready Flask MVP for a peptide-focused news analytics dashboard.

The first deploy uses a seeded sample dataset so the dashboard is useful before Snowflake, scheduled ingestion, and NLP enrichment are wired in. The API shape is designed to match the future data pipeline.

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
- `GET /api/trends`

`/api/articles` supports `topic`, `source`, `sentiment`, `hours`, `limit`, `offset`, `search`, and `sort`.

## World News API

The app keeps seeded sample data as the default. For live experiments, set `WORLDNEWSAPI_KEY` in the environment and call:

```text
/api/articles?live=1
```

Do not commit real API keys. Add `WORLDNEWSAPI_KEY` in Railway variables when live ingestion becomes part of the product.
