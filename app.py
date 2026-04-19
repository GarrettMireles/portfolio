import hashlib
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "sample_articles.json"

ALLOWED_HOURS = {12, 24, 48, 72, 168, 720}
TOPICS = [
    "Regulation",
    "Market",
    "Research",
    "Health & Wellness",
    "Legal",
    "Supply Chain",
    "Safety",
]

PEPTIDE_KEYWORDS = {
    "BPC-157": 1.0,
    "TB-500": 1.0,
    "Thymosin Beta-4": 1.0,
    "GHK-Cu": 1.0,
    "CJC-1295": 1.0,
    "Ipamorelin": 1.0,
    "Tesamorelin": 1.0,
    "Sermorelin": 1.0,
    "Semaglutide": 1.0,
    "Tirzepatide": 1.0,
    "PT-141": 1.0,
    "Bremelanotide": 1.0,
    "Melanotan II": 1.0,
    "AOD-9604": 1.0,
    "DSIP": 1.0,
    "Epitalon": 1.0,
    "Selank": 1.0,
    "Semax": 1.0,
    "Cerebrolysin": 1.0,
    "LL-37": 1.0,
    "KPV": 1.0,
    "Mots-C": 1.0,
    "Humanin": 1.0,
    "SS-31": 1.0,
    "Elamipretide": 1.0,
    "Dihexa": 1.0,
    "GLP-1": 1.0,
    "GIP/GLP-1": 1.0,
    "peptide therapy": 0.7,
    "peptide clinic": 0.7,
    "compounding pharmacy": 0.7,
    "research peptide": 0.7,
    "growth hormone secretagogue": 0.7,
    "GHRH": 0.7,
    "GHRP-6": 0.7,
    "GHRP-2": 0.7,
    "subcutaneous injection": 0.7,
    "lyophilized peptide": 0.7,
    "biohacking": 0.4,
    "longevity": 0.4,
    "anti-aging": 0.4,
    "hormone optimization": 0.4,
    "regenerative medicine": 0.4,
    "telehealth prescriber": 0.4,
    "research chemical": 0.4,
}

TOPIC_TERMS = {
    "Regulation": ["fda", "rule", "regulation", "warning", "enforcement", "compound"],
    "Market": ["market", "revenue", "earnings", "funding", "merger", "acquisition", "sales"],
    "Research": ["study", "trial", "research", "clinical", "mechanism", "pubmed"],
    "Health & Wellness": ["wellness", "clinic", "therapy", "fitness", "longevity", "consumer"],
    "Legal": ["lawsuit", "patent", "charge", "settlement", "court", "legal"],
    "Supply Chain": ["supply", "manufacturing", "raw material", "export", "shortage", "sourcing"],
    "Safety": ["safety", "recall", "contamination", "adverse", "hospital", "warning"],
}


def parse_iso(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def serialize_article(article):
    clean = dict(article)
    if isinstance(clean.get("published_dt"), datetime):
        clean.pop("published_dt")
    return clean


def load_sample_articles():
    with DATA_PATH.open(encoding="utf-8") as data_file:
        articles = json.load(data_file)

    for article in articles:
        article["published_dt"] = parse_iso(article["published_at"])
    return articles


def demo_anchor_time(articles):
    if not articles:
        return datetime.now(timezone.utc)
    return max(article["published_dt"] for article in articles) + timedelta(hours=1)


def parse_csv_param(name):
    value = request.args.get(name, "")
    return {item.strip().lower() for item in value.split(",") if item.strip()}


def clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


def calculate_relevance(title, excerpt):
    haystack = f"{title} {excerpt}".lower()
    score = sum(weight for keyword, weight in PEPTIDE_KEYWORDS.items() if keyword.lower() in haystack)
    return min(score / 3.0, 1.0)


def extract_mentions(title, excerpt):
    haystack = f"{title} {excerpt}".lower()
    return [
        keyword
        for keyword, weight in PEPTIDE_KEYWORDS.items()
        if weight >= 1.0 and keyword.lower() in haystack
    ][:6]


def classify_topics(title, excerpt):
    haystack = f"{title} {excerpt}".lower()
    scores = {
        topic: sum(1 for term in terms if term in haystack)
        for topic, terms in TOPIC_TERMS.items()
    }
    matched = [topic for topic, score in scores.items() if score > 0]
    if not matched:
        matched = ["Research"]
    matched.sort(key=lambda topic: scores[topic], reverse=True)
    return matched[0], matched[:3]


def sentiment_from_text(title, excerpt, fallback=0.0):
    haystack = f"{title} {excerpt}".lower()
    negative_terms = ["warning", "lawsuit", "recall", "shortage", "contamination", "charge", "risk"]
    positive_terms = ["funding", "growth", "study", "advance", "approval", "expands", "improves"]
    score = fallback
    score += 0.18 * sum(1 for term in positive_terms if term in haystack)
    score -= 0.22 * sum(1 for term in negative_terms if term in haystack)
    return max(-1.0, min(score, 1.0))


def sentiment_label(score):
    if score >= 0.2:
        return "positive"
    if score <= -0.2:
        return "negative"
    return "neutral"


def source_from_url(url):
    host = urlparse(url).netloc.replace("www.", "")
    return host.split(":")[0] or "World News"


def fetch_worldnews_articles(limit):
    api_key = os.getenv("WORLDNEWSAPI_KEY")
    if not api_key:
        return []

    params = urlencode(
        {
            "api-key": api_key,
            "text": 'peptide OR "GLP-1" OR semaglutide OR tirzepatide OR "BPC-157" OR "GHK-Cu"',
            "language": "en",
            "number": min(max(limit, 10), 50),
            "sort": "publish-time",
            "sort-direction": "DESC",
        }
    )
    url = f"https://api.worldnewsapi.com/search-news?{params}"
    req = Request(url, headers={"User-Agent": "peptide-news-analytics/1.0"})

    try:
        with urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, json.JSONDecodeError):
        return []

    mapped = []
    for item in payload.get("news", []):
        title = item.get("title") or "Untitled article"
        excerpt = item.get("summary") or item.get("text") or ""
        source_url = item.get("url") or "#"
        published_at = item.get("publish_date") or datetime.now(timezone.utc).isoformat()
        if published_at.endswith("Z"):
            published_dt = parse_iso(published_at)
        else:
            published_dt = parse_iso(published_at.replace("+00:00", "Z"))

        primary_topic, topic_tags = classify_topics(title, excerpt)
        raw_sentiment = item.get("sentiment")
        try:
            score = float(raw_sentiment)
        except (TypeError, ValueError):
            score = sentiment_from_text(title, excerpt)

        article = {
            "article_id": hashlib.sha256(source_url.encode("utf-8")).hexdigest(),
            "title": title,
            "excerpt": excerpt[:500],
            "source_name": item.get("source_name") or source_from_url(source_url),
            "source_url": source_url,
            "published_at": published_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "sentiment_label": sentiment_label(score),
            "sentiment_score": round(score, 2),
            "relevance_score": round(calculate_relevance(title, excerpt), 2),
            "primary_topic": primary_topic,
            "topic_tags": topic_tags,
            "peptide_mentions": extract_mentions(title, excerpt),
            "image_url": item.get("image"),
            "published_dt": published_dt,
        }
        mapped.append(article)

    return mapped


def filtered_articles(articles, anchor_time):
    topics = parse_csv_param("topic")
    sources = parse_csv_param("source")
    sentiments = parse_csv_param("sentiment")
    search = request.args.get("search", "").strip().lower()
    hours = clamp_int(request.args.get("hours"), 24, 12, 720)
    if hours not in ALLOWED_HOURS:
        hours = 24

    cutoff = anchor_time - timedelta(hours=hours)
    results = [article for article in articles if article["published_dt"] >= cutoff]

    if topics:
        results = [
            article
            for article in results
            if any(topic.lower() in topics for topic in article.get("topic_tags", []))
            or article.get("primary_topic", "").lower() in topics
        ]

    if sources:
        results = [article for article in results if article.get("source_name", "").lower() in sources]

    if sentiments:
        results = [article for article in results if article.get("sentiment_label", "").lower() in sentiments]

    if search:
        results = [
            article
            for article in results
            if search in article.get("title", "").lower()
            or search in article.get("excerpt", "").lower()
            or any(search in mention.lower() for mention in article.get("peptide_mentions", []))
        ]

    sort = request.args.get("sort", "date")
    if sort == "relevance":
        results.sort(key=lambda article: article.get("relevance_score", 0), reverse=True)
    elif sort == "sentiment":
        results.sort(key=lambda article: article.get("sentiment_score", 0), reverse=True)
    else:
        results.sort(key=lambda article: article["published_dt"], reverse=True)

    return results, hours


def get_article_source():
    live_requested = request.args.get("live") == "1"
    if live_requested:
        live_articles = fetch_worldnews_articles(limit=clamp_int(request.args.get("limit"), 20, 1, 50))
        if live_articles:
            return live_articles, datetime.now(timezone.utc), "worldnewsapi"

    sample_articles = load_sample_articles()
    return sample_articles, demo_anchor_time(sample_articles), "sample"


@app.route("/")
def home():
    return render_template("index.html", topics=TOPICS)


@app.route("/api/articles")
def articles():
    source_articles, anchor_time, data_source = get_article_source()
    results, hours = filtered_articles(source_articles, anchor_time)
    limit = clamp_int(request.args.get("limit"), 12, 1, 50)
    offset = clamp_int(request.args.get("offset"), 0, 0, max(len(results), 0))
    page = results[offset : offset + limit]

    return jsonify(
        {
            "articles": [serialize_article(article) for article in page],
            "total": len(results),
            "limit": limit,
            "offset": offset,
            "hours": hours,
            "data_source": data_source,
        }
    )


@app.route("/api/summary")
def summary():
    source_articles, anchor_time, data_source = get_article_source()
    results, hours = filtered_articles(source_articles, anchor_time)
    total = len(results)
    avg_sentiment = round(
        sum(article.get("sentiment_score", 0) for article in results) / total, 2
    ) if total else 0
    topic_counts = Counter(article.get("primary_topic", "Research") for article in results)
    top_topic, top_topic_count = topic_counts.most_common(1)[0] if topic_counts else ("None", 0)
    pub_rate = round(total / max(hours, 1), 1)

    return jsonify(
        {
            "total_articles": total,
            "avg_sentiment": avg_sentiment,
            "sentiment_detail": sentiment_label(avg_sentiment).title(),
            "top_topic": top_topic,
            "top_topic_count": top_topic_count,
            "publication_rate": pub_rate,
            "hours": hours,
            "data_source": data_source,
        }
    )


@app.route("/api/topics")
def topics():
    source_articles, anchor_time, data_source = get_article_source()
    results, hours = filtered_articles(source_articles, anchor_time)
    grouped = defaultdict(list)
    for article in results:
        grouped[article.get("primary_topic", "Research")].append(article)

    breakdown = []
    for topic in TOPICS:
        items = grouped.get(topic, [])
        avg_sentiment = (
            round(sum(article.get("sentiment_score", 0) for article in items) / len(items), 2)
            if items
            else 0
        )
        breakdown.append(
            {
                "topic": topic,
                "article_count": len(items),
                "avg_sentiment": avg_sentiment,
            }
        )

    return jsonify({"topics": breakdown, "hours": hours, "data_source": data_source})


@app.route("/api/trends")
def trends():
    source_articles, anchor_time, data_source = get_article_source()
    days = clamp_int(request.args.get("days"), 7, 1, 30)
    requested_topic = request.args.get("topic", "").strip().lower()
    start_date = (anchor_time - timedelta(days=days - 1)).date()
    buckets = {
        (start_date + timedelta(days=index)).isoformat(): Counter()
        for index in range(days)
    }

    for article in source_articles:
        day = article["published_dt"].date().isoformat()
        if day not in buckets:
            continue
        topic = article.get("primary_topic", "Research")
        if requested_topic and topic.lower() != requested_topic:
            continue
        buckets[day][topic] += 1

    series = [
        {"date": day, "topics": dict(counts), "article_count": sum(counts.values())}
        for day, counts in buckets.items()
    ]
    return jsonify({"trends": series, "days": days, "data_source": data_source})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)
