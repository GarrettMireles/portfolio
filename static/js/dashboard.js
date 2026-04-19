const state = {
    limit: 8,
    offset: 0,
    total: 0,
    loading: false
};

const grid = document.querySelector("#articles-grid");
const emptyState = document.querySelector("#empty-state");
const loadMoreButton = document.querySelector("#load-more");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");

function selectedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
        .map((input) => input.value);
}

function selectedHours() {
    const checked = document.querySelector('input[name="hours"]:checked');
    return checked ? checked.value : "24";
}

function buildParams(offset = 0) {
    const params = new URLSearchParams({
        hours: selectedHours(),
        limit: String(state.limit),
        offset: String(offset),
        sort: sortSelect.value
    });

    const topics = selectedValues("topic");
    const sources = selectedValues("source");
    const sentiments = selectedValues("sentiment");
    const search = searchInput.value.trim();

    params.set("topic", topics.length ? topics.join(",") : "__none__");
    params.set("source", sources.length ? sources.join(",") : "__none__");
    params.set("sentiment", sentiments.length ? sentiments.join(",") : "__none__");
    if (search) params.set("search", search);

    return params;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}

function formatRelativeDate(value) {
    const published = new Date(value);
    const diffMs = Date.now() - published.getTime();
    const absMs = Math.abs(diffMs);
    const hours = Math.floor(absMs / 36e5);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "Just now";
}

function formatPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
}

function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setLastUpdated() {
    const stamp = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
    }).format(new Date());
    document.querySelector("#last-updated").textContent = stamp;
}

function createBadge(text, className = "") {
    const span = document.createElement("span");
    span.className = `badge ${className}`.trim();
    span.textContent = text;
    return span;
}

function renderArticle(article) {
    const card = document.createElement("article");
    card.className = "article-card";

    const image = document.createElement("img");
    image.className = "article-image";
    image.loading = "lazy";
    image.alt = "";
    image.src = article.image_url || "https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=900&q=80";

    const body = document.createElement("div");
    body.className = "article-body";

    const top = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "article-meta";

    const source = document.createElement("a");
    source.className = "article-source";
    source.href = article.source_url || "#";
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = article.source_name || "Unknown";

    const date = document.createElement("span");
    date.className = "article-date";
    date.textContent = formatRelativeDate(article.published_at);

    meta.append(source, date);

    const title = document.createElement("h3");
    title.className = "article-title";
    title.textContent = article.title;

    const excerpt = document.createElement("p");
    excerpt.className = "article-excerpt";
    excerpt.textContent = article.excerpt;

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.append(
        createBadge(titleCase(article.sentiment_label), article.sentiment_label),
        createBadge(article.primary_topic, "topic")
    );

    const mentions = document.createElement("div");
    mentions.className = "mention-row";
    (article.peptide_mentions || []).forEach((mention) => {
        mentions.append(createBadge(mention, "mention"));
    });

    top.append(meta, title, excerpt, badges, mentions);

    const footer = document.createElement("div");
    footer.className = "article-footer";
    const relevance = document.createElement("span");
    relevance.textContent = `Relevance: ${formatPercent(article.relevance_score)}`;
    const sentiment = document.createElement("span");
    sentiment.textContent = `Score: ${Number(article.sentiment_score || 0).toFixed(2)}`;
    footer.append(relevance, sentiment);

    body.append(top, footer);
    card.append(image, body);
    return card;
}

function renderArticles(payload, append = false) {
    state.total = payload.total;
    if (!append) grid.replaceChildren();

    const fragment = document.createDocumentFragment();
    payload.articles.forEach((article) => fragment.append(renderArticle(article)));
    grid.append(fragment);

    const visible = grid.children.length;
    resultCount.textContent = `${formatNumber(visible)} of ${formatNumber(payload.total)} articles`;
    emptyState.hidden = payload.total !== 0;
    loadMoreButton.hidden = visible >= payload.total;
    document.querySelector("#data-source").textContent =
        payload.data_source === "worldnewsapi" ? "World News API" : "Sample dataset";
}

function renderSummary(summary) {
    document.querySelector("#summary-total").textContent = formatNumber(summary.total_articles);
    document.querySelector("#summary-window").textContent = `Last ${summary.hours === 168 ? "7 days" : summary.hours === 720 ? "30 days" : `${summary.hours} hours`}`;
    document.querySelector("#summary-sentiment").textContent = Number(summary.avg_sentiment).toFixed(2);
    document.querySelector("#summary-sentiment-detail").textContent = summary.sentiment_detail;
    document.querySelector("#summary-topic").textContent = summary.top_topic;
    document.querySelector("#summary-topic-detail").textContent = `${formatNumber(summary.top_topic_count)} mentions`;
    document.querySelector("#summary-rate").textContent = Number(summary.publication_rate).toFixed(1);
}

function renderTopics(payload) {
    const list = document.querySelector("#topic-list");
    const max = Math.max(...payload.topics.map((topic) => topic.article_count), 1);
    list.replaceChildren();

    payload.topics.forEach((topic) => {
        const item = document.createElement("div");
        item.className = "topic-item";

        const row = document.createElement("div");
        row.className = "topic-row";
        const name = document.createElement("span");
        name.textContent = topic.topic;
        const count = document.createElement("span");
        count.textContent = topic.article_count;
        row.append(name, count);

        const bar = document.createElement("div");
        bar.className = "topic-bar";
        const fill = document.createElement("div");
        fill.className = "topic-fill";
        fill.style.width = `${Math.round((topic.article_count / max) * 100)}%`;
        bar.append(fill);

        const sentiment = document.createElement("span");
        sentiment.className = "topic-sentiment";
        sentiment.textContent = `Avg sentiment ${Number(topic.avg_sentiment).toFixed(2)}`;

        item.append(row, bar, sentiment);
        list.append(item);
    });
}

async function fetchJson(path, params) {
    const response = await fetch(`${path}?${params.toString()}`);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

async function refreshDashboard({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    loadMoreButton.disabled = true;
    resultCount.textContent = append ? "Loading more" : "Loading articles";

    try {
        const offset = append ? state.offset : 0;
        const articleParams = buildParams(offset);
        const metricParams = buildParams(0);
        metricParams.delete("limit");
        metricParams.delete("offset");

        const [articles, summary, topics] = await Promise.all([
            fetchJson("/api/articles", articleParams),
            fetchJson("/api/summary", metricParams),
            fetchJson("/api/topics", metricParams)
        ]);

        renderArticles(articles, append);
        renderSummary(summary);
        renderTopics(topics);
        state.offset = grid.children.length;
        setLastUpdated();
    } catch (error) {
        resultCount.textContent = "Unable to load articles";
        console.error(error);
    } finally {
        state.loading = false;
        loadMoreButton.disabled = false;
    }
}

function resetAndRefresh() {
    state.offset = 0;
    refreshDashboard();
}

function debounce(callback, delay = 250) {
    let timer;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => callback(...args), delay);
    };
}

document.querySelectorAll(".filter-checkbox").forEach((input) => {
    input.addEventListener("change", resetAndRefresh);
});

searchInput.addEventListener("input", debounce(resetAndRefresh));
sortSelect.addEventListener("change", resetAndRefresh);
loadMoreButton.addEventListener("click", () => refreshDashboard({ append: true }));

setLastUpdated();
refreshDashboard();
