const state = {
    limit: 8,
    offset: 0,
    total: 0,
    loading: false
};

const grid = document.querySelector("#articles-grid");
const articleTableBody = document.querySelector("#article-table-body");
const peptideTypeTableBody = document.querySelector("#peptide-type-table-body");
const emptyState = document.querySelector("#empty-state");
const loadMoreButton = document.querySelector("#load-more");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const liveToggle = document.querySelector("#live-toggle");

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
    const peptideTypes = selectedValues("peptide_type");
    const search = searchInput.value.trim();

    params.set("topic", topics.length ? topics.join(",") : "__none__");
    params.set("source", sources.length ? sources.join(",") : "__none__");
    params.set("peptide_type", peptideTypes.length ? peptideTypes.join(",") : "__none__");
    if (search) params.set("search", search);
    if (liveToggle.checked) params.set("live", "1");

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

function formatDate(value) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(value));
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function safeUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch {
        return "#";
    }
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
    badges.append(createBadge(article.primary_topic, "topic"));
    (article.peptide_types || []).forEach((type) => {
        badges.append(createBadge(type, "type"));
    });

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
    sentiment.textContent = article.peptide_mentions?.length ? `${article.peptide_mentions.length} mentions` : "No named peptide";
    footer.append(relevance, sentiment);

    body.append(top, footer);
    card.append(image, body);
    return card;
}

function renderTableRow(article) {
    const row = document.createElement("tr");
    const sourceName = escapeHtml(article.source_name || "Unknown");
    const sourceUrl = safeUrl(article.source_url);
    const source = sourceUrl !== "#"
        ? `<a href="${sourceUrl}" target="_blank" rel="noreferrer">${sourceName}</a>`
        : sourceName;
    const types = escapeHtml((article.peptide_types || []).join(", ") || "Unclassified");
    const mentions = escapeHtml((article.peptide_mentions || []).join(", ") || "None found");

    row.innerHTML = `
        <td>${formatDate(article.published_at)}</td>
        <td>${source}</td>
        <td>${types}</td>
        <td>${mentions}</td>
        <td>${escapeHtml(article.primary_topic || "Unclassified")}</td>
        <td>${formatPercent(article.relevance_score)}</td>
        <td>${escapeHtml(article.title)}</td>
    `;
    return row;
}

function renderArticles(payload, append = false) {
    state.total = payload.total;
    if (!append) {
        grid.replaceChildren();
        articleTableBody.replaceChildren();
    }

    const cardFragment = document.createDocumentFragment();
    const tableFragment = document.createDocumentFragment();
    payload.articles.forEach((article) => {
        cardFragment.append(renderArticle(article));
        tableFragment.append(renderTableRow(article));
    });
    grid.append(cardFragment);
    articleTableBody.append(tableFragment);

    const visible = articleTableBody.children.length;
    resultCount.textContent = `${formatNumber(visible)} of ${formatNumber(payload.total)} articles`;
    emptyState.hidden = payload.total !== 0;
    loadMoreButton.hidden = visible >= payload.total;
    document.querySelector("#data-source").textContent =
        payload.data_source === "worldnewsapi" ? "World News API" : "Sample dataset";
}

function renderSummary(summary) {
    document.querySelector("#summary-total").textContent = formatNumber(summary.total_articles);
    document.querySelector("#summary-window").textContent = `Last ${summary.hours === 168 ? "7 days" : summary.hours === 720 ? "30 days" : `${summary.hours} hours`}`;
    document.querySelector("#summary-type-count").textContent = formatNumber(summary.peptide_type_count);
    document.querySelector("#summary-type").textContent = summary.top_peptide_type;
    document.querySelector("#summary-type-detail").textContent = `${formatNumber(summary.top_peptide_type_count)} articles`;
    document.querySelector("#summary-source").textContent = summary.top_source;
    document.querySelector("#summary-source-detail").textContent = `${formatNumber(summary.top_source_count)} articles`;
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

        const source = document.createElement("span");
        source.className = "topic-sentiment";
        source.textContent = topic.article_count ? `Top source ${topic.top_source}` : "No articles";

        item.append(row, bar, source);
        list.append(item);
    });
}

function renderPeptideTypes(payload) {
    peptideTypeTableBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    payload.peptide_types
        .filter((row) => row.article_count > 0)
        .forEach((item) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${escapeHtml(item.peptide_type)}</td>
                <td>${formatNumber(item.article_count)}</td>
                <td>${escapeHtml(item.top_topic)}</td>
            `;
            fragment.append(row);
        });

    if (!fragment.children.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="3">No peptide types in this slice</td>';
        fragment.append(row);
    }
    peptideTypeTableBody.append(fragment);
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

        const [articles, summary, topics, peptideTypes] = await Promise.all([
            fetchJson("/api/articles", articleParams),
            fetchJson("/api/summary", metricParams),
            fetchJson("/api/topics", metricParams),
            fetchJson("/api/peptide-types", metricParams)
        ]);

        renderArticles(articles, append);
        renderSummary(summary);
        renderTopics(topics);
        renderPeptideTypes(peptideTypes);
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
liveToggle.addEventListener("change", resetAndRefresh);
loadMoreButton.addEventListener("click", () => refreshDashboard({ append: true }));

setLastUpdated();
refreshDashboard();
