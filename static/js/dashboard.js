const state = {
    limit: 18,
    offset: 0,
    total: 0,
    loading: false,
    source: "",
    country: ""
};

const grid = document.querySelector("#story-grid");
const lead = document.querySelector("#lead-story");
const emptyState = document.querySelector("#empty-state");
const loadMoreButton = document.querySelector("#load-more");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const countrySelect = document.querySelector("#country-select");
const sourceSelect = document.querySelector("#source-select");
const hoursSelect = document.querySelector("#hours-select");
const sortSelect = document.querySelector("#sort-select");

function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDate(value) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(value));
}

function relativeDate(value) {
    const published = new Date(value);
    const diff = Math.max(0, Date.now() - published.getTime());
    const hours = Math.floor(diff / 36e5);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "Just now";
}

function safeUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch {
        return "#";
    }
}

function imageUrl(article) {
    return article.image_url || "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80";
}

function meta(article) {
    const country = article.source_country ? article.source_country.toUpperCase() : "World";
    return `
        <div class="meta-row">
            <span>${article.source_domain || article.source_name || "Unknown source"}</span>
            <span>${country}</span>
            <span>${relativeDate(article.published_at)}</span>
        </div>
    `;
}

function renderLead(article) {
    if (!article) {
        lead.innerHTML = "";
        return;
    }
    const url = safeUrl(article.source_url);
    lead.innerHTML = `
        <img class="lead-image" src="${imageUrl(article)}" alt="" loading="eager">
        <div class="lead-body">
            <div>
                ${meta(article)}
                <h2 class="lead-title">${escapeHtml(article.title)}</h2>
                <p class="lead-excerpt">${escapeHtml(article.excerpt || "")}</p>
            </div>
            <a class="read-link" href="${url}" target="_blank" rel="noreferrer">Read the full story</a>
        </div>
    `;
}

function renderCard(article) {
    const card = document.createElement("article");
    card.className = "story-card";
    const url = safeUrl(article.source_url);
    card.innerHTML = `
        <img class="story-image" src="${imageUrl(article)}" alt="" loading="lazy">
        <div class="story-body">
            <div>
                ${meta(article)}
                <h3 class="story-title">${escapeHtml(article.title)}</h3>
                <p class="story-excerpt">${escapeHtml(article.excerpt || "")}</p>
            </div>
            <a class="read-link" href="${url}" target="_blank" rel="noreferrer">Read more</a>
        </div>
    `;
    return card;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function params(offset = 0) {
    const query = new URLSearchParams({
        limit: String(state.limit),
        offset: String(offset),
        hours: hoursSelect.value,
        sort: sortSelect.value
    });
    const search = searchInput.value.trim();
    if (search) query.set("search", search);
    if (state.source) query.set("source", state.source);
    if (state.country) query.set("country", state.country);
    return query;
}

function setLastUpdated(dataSource) {
    const stamp = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
    }).format(new Date());
    document.querySelector("#last-updated").textContent = stamp;
    document.querySelector("#data-source").textContent = dataSource;
}

function fillSelect(select, rows, label) {
    const current = select.value;
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = label;
    select.append(all);
    rows.forEach((row) => {
        const option = document.createElement("option");
        option.value = row.value;
        option.textContent = `${row.value} (${row.count})`;
        select.append(option);
    });
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : "";
}

function setFacets(facets) {
    fillSelect(sourceSelect, facets.sources || [], "All sources");
    fillSelect(countrySelect, facets.countries || [], "All countries");
}

function renderArticles(payload, append = false) {
    state.total = payload.total;
    if (!append) {
        grid.replaceChildren();
        if (payload.articles.length) renderLead(payload.articles[0]);
        else renderLead(null);
    }

    const fragment = document.createDocumentFragment();
    payload.articles.slice(append ? 0 : 1).forEach((article) => fragment.append(renderCard(article)));
    grid.append(fragment);

    const visible = grid.children.length + (lead.innerHTML ? 1 : 0);
    resultCount.textContent = `${formatNumber(Math.min(visible, payload.total))} of ${formatNumber(payload.total)} stories`;
    emptyState.hidden = payload.total !== 0;
    loadMoreButton.hidden = visible >= payload.total;
    setFacets(payload.facets || { sources: [], countries: [] });
    setLastUpdated(payload.data_source);
}

async function fetchJson(path, query) {
    const response = await fetch(`${path}?${query.toString()}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
}

async function refresh({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    loadMoreButton.disabled = true;
    resultCount.textContent = append ? "Loading more" : "Loading stories";

    try {
        const offset = append ? state.offset : 0;
        const articleParams = params(offset);
        const articles = await fetchJson("/api/articles", articleParams);

        renderArticles(articles, append);
        state.offset = Math.min(state.total, offset + articles.articles.length);
    } catch (error) {
        console.error(error);
        resultCount.textContent = "Unable to load stories";
    } finally {
        state.loading = false;
        loadMoreButton.disabled = false;
    }
}

function resetAndRefresh() {
    state.offset = 0;
    refresh();
}

function debounce(callback, delay = 300) {
    let timer;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => callback(...args), delay);
    };
}

searchInput.addEventListener("input", debounce(resetAndRefresh));
hoursSelect.addEventListener("change", resetAndRefresh);
sortSelect.addEventListener("change", resetAndRefresh);

sourceSelect.addEventListener("change", () => {
    state.source = sourceSelect.value;
    resetAndRefresh();
});

countrySelect.addEventListener("change", () => {
    state.country = countrySelect.value;
    resetAndRefresh();
});

loadMoreButton.addEventListener("click", () => refresh({ append: true }));

refresh();
