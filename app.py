import hashlib
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "sample_articles.json"
WORLD_NEWS_API = "https://api.worldnewsapi.com/search-news"

ALLOWED_HOURS = {12, 24, 48, 72, 168, 720}
DEFAULT_LANGUAGE = "en"


def parse_dt(value):
    if not value:
        return datetime.now(timezone.utc)
    normalized = str(value).replace("Z", "+00:00")
    if " " in normalized and "T" not in normalized:
        normalized = normalized.replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso_utc(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def source_domain(url):
    host = urlparse(url or "").netloc.lower().replace("www.", "")
    return host.split(":")[0] or "unknown source"


def source_label(item):
    if item.get("source_name"):
        return item["source_name"]
    domain = source_domain(item.get("url"))
    if domain == "unknown source":
        return "Unknown Source"
    return domain


def article_id(url, title):
    seed = url or title or datetime.now(timezone.utc).isoformat()
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]


def normalize_article(item):
    url = item.get("url") or item.get("source_url") or "#"
    published = parse_dt(item.get("publish_date") or item.get("published_at"))
    summary = item.get("summary") or item.get("excerpt") or item.get("text") or ""
    title = item.get("title") or "Untitled story"

    return {
        "article_id": item.get("article_id") or article_id(url, title),
        "title": title,
        "excerpt": summary[:520],
        "source_name": source_label(item),
        "source_domain": source_domain(url),
        "source_url": url,
        "published_at": iso_utc(published),
        "published_ts": published.timestamp(),
        "image_url": item.get("image") or item.get("image_url"),
        "language": item.get("language") or DEFAULT_LANGUAGE,
        "source_country": (item.get("source_country") or item.get("country") or "").lower(),
        "authors": item.get("authors") or ([] if not item.get("author") else [item.get("author")]),
    }


def serialize_article(article):
    clean = dict(article)
    clean.pop("published_ts", None)
    return clean


def fallback_articles():
    if not DATA_PATH.exists():
        return []
    with DATA_PATH.open(encoding="utf-8") as data_file:
        rows = json.load(data_file)
    return [normalize_article(row) for row in rows]


def fetch_world_news(number=100):
    api_key = os.getenv("WORLDNEWSAPI_KEY")
    if not api_key:
        return []

    params = {
        "api-key": api_key,
        "language": DEFAULT_LANGUAGE,
        "number": max(10, min(int(number), 100)),
        "sort": "publish-time",
        "sort-direction": "DESC",
    }

    search = request.args.get("search", "").strip()
    if search:
        params["text"] = search

    source_country = request.args.get("country", "").strip().lower()
    if source_country:
        params["source-country"] = source_country

    url = f"{WORLD_NEWS_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "world-news-homepage/1.0"})

    try:
        with urlopen(req, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, OSError, URLError, json.JSONDecodeError):
        return []

    return [normalize_article(item) for item in payload.get("news", [])]


def load_articles():
    live_articles = fetch_world_news(100)
    if live_articles:
        return live_articles, "World News API"
    return fallback_articles(), "Sample fallback"


def clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


def filter_articles(articles):
    hours = clamp_int(request.args.get("hours"), 72, 12, 720)
    if hours not in ALLOWED_HOURS:
        hours = 72

    if articles:
        anchor = max(parse_dt(article["published_at"]) for article in articles)
    else:
        anchor = datetime.now(timezone.utc)
    cutoff = anchor - timedelta(hours=hours)

    search = request.args.get("search", "").strip().lower()
    source = request.args.get("source", "").strip().lower()
    country = request.args.get("country", "").strip().lower()
    image_filter = request.args.get("images", "any")

    filtered = []
    for article in articles:
        published = parse_dt(article["published_at"])
        if published < cutoff:
            continue
        if source and article.get("source_domain", "").lower() != source:
            continue
        if country and article.get("source_country", "").lower() != country:
            continue
        if image_filter == "with" and not article.get("image_url"):
            continue
        if search:
            haystack = " ".join(
                [
                    article.get("title", ""),
                    article.get("excerpt", ""),
                    article.get("source_name", ""),
                    article.get("source_domain", ""),
                ]
            ).lower()
            if search not in haystack:
                continue
        filtered.append(article)

    sort = request.args.get("sort", "newest")
    if sort == "source":
        filtered.sort(key=lambda item: (item.get("source_domain", ""), -item.get("published_ts", 0)))
    elif sort == "country":
        filtered.sort(key=lambda item: (item.get("source_country", ""), -item.get("published_ts", 0)))
    else:
        filtered.sort(key=lambda item: item.get("published_ts", 0), reverse=True)

    return filtered, hours


def facet_counts(articles):
    source_counts = Counter(article.get("source_domain") or "unknown source" for article in articles)
    country_counts = Counter(article.get("source_country") or "unknown" for article in articles)
    return {
        "sources": [{"value": key, "count": count} for key, count in source_counts.most_common(25)],
        "countries": [{"value": key, "count": count} for key, count in country_counts.most_common(25)],
    }


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/articles")
def api_articles():
    articles, data_source = load_articles()
    filtered, hours = filter_articles(articles)
    limit = clamp_int(request.args.get("limit"), 18, 1, 60)
    offset = clamp_int(request.args.get("offset"), 0, 0, len(filtered))
    page = filtered[offset : offset + limit]

    return jsonify(
        {
            "articles": [serialize_article(article) for article in page],
            "total": len(filtered),
            "limit": limit,
            "offset": offset,
            "hours": hours,
            "data_source": data_source,
            "facets": facet_counts(articles),
        }
    )


@app.route("/api/summary")
def api_summary():
    articles, data_source = load_articles()
    filtered, hours = filter_articles(articles)
    sources = Counter(article.get("source_domain") or "unknown source" for article in filtered)
    countries = Counter(article.get("source_country") or "unknown" for article in filtered)
    image_count = sum(1 for article in filtered if article.get("image_url"))
    latest = max((parse_dt(article["published_at"]) for article in filtered), default=None)

    return jsonify(
        {
            "total_articles": len(filtered),
            "source_count": len(sources),
            "country_count": len(countries),
            "image_count": image_count,
            "top_source": sources.most_common(1)[0][0] if sources else "none",
            "top_country": countries.most_common(1)[0][0] if countries else "none",
            "latest_published_at": iso_utc(latest) if latest else None,
            "hours": hours,
            "data_source": data_source,
        }
    )


@app.route("/api/facets")
def api_facets():
    articles, data_source = load_articles()
    return jsonify({"facets": facet_counts(articles), "data_source": data_source})


@app.route("/api/trends")
def api_trends():
    articles, data_source = load_articles()
    days = clamp_int(request.args.get("days"), 7, 1, 30)
    if articles:
        anchor = max(parse_dt(article["published_at"]) for article in articles)
    else:
        anchor = datetime.now(timezone.utc)
    start = (anchor - timedelta(days=days - 1)).date()
    buckets = {str(start + timedelta(days=index)): 0 for index in range(days)}
    for article in articles:
        day = parse_dt(article["published_at"]).date().isoformat()
        if day in buckets:
            buckets[day] += 1
    return jsonify(
        {
            "trends": [{"date": day, "article_count": count} for day, count in buckets.items()],
            "data_source": data_source,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)
