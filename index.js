const RESULT_BATCH_SIZE = 18;
const QUICK_FILTER_LIMIT = 6;
const FEATURED_CATEGORY_LIMIT = 5;
const CATEGORY_PREVIEW_LIMIT = 4;
const SEARCH_DEBOUNCE = 180;

const state = {
    categories: [],
    bookmarks: [],
    selectedCategory: null,
    query: '',
    sort: 'relevance',
    renderQueue: [],
    renderIndex: 0,
    renderToken: 0,
    searchTimer: null,
    intersectionObserver: null
};

const dom = {};

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    cacheDom();
    bindGlobalEvents();
    await loadBookmarks();
}

function cacheDom() {
    dom.searchInput = document.getElementById('search-input');
    dom.sidebarSearchInput = document.getElementById('sidebar-search-input');
    dom.clearSearch = document.getElementById('clear-search');
    dom.sortSelect = document.getElementById('sort-select');
    dom.resetView = document.getElementById('reset-view');
    dom.categoryNav = document.getElementById('category-nav');
    dom.featuredCategories = document.getElementById('featured-categories');
    dom.quickFilters = document.getElementById('quick-filters');
    dom.contentArea = document.getElementById('content-area');
    dom.viewEyebrow = document.getElementById('view-eyebrow');
    dom.viewTitle = document.getElementById('view-title');
    dom.resultCount = document.getElementById('result-count');
    dom.sidebarSummary = document.getElementById('sidebar-summary');
    dom.searchHint = document.getElementById('search-hint');
    dom.jumpTop = document.getElementById('jump-top');
    dom.backToTop = document.getElementById('back-to-top');
    dom.statBookmarks = document.getElementById('stat-bookmarks');
    dom.statCategories = document.getElementById('stat-categories');
    dom.statLargest = document.getElementById('stat-largest');
    dom.statRecent = document.getElementById('stat-recent');
    dom.structuredData = document.getElementById('structured-data');
}

function bindGlobalEvents() {
    dom.searchInput.addEventListener('input', handleSearchInput);
    dom.sidebarSearchInput.addEventListener('input', handleSearchInput);
    dom.clearSearch.addEventListener('click', clearSearch);
    dom.sortSelect.addEventListener('change', handleSortChange);
    dom.resetView.addEventListener('click', showOverview);
    dom.jumpTop.addEventListener('click', scrollToTop);
    dom.backToTop.addEventListener('click', scrollToTop);

    document.addEventListener('keydown', (event) => {
        if (event.key === '/' && document.activeElement !== dom.searchInput && document.activeElement !== dom.sidebarSearchInput) {
            event.preventDefault();
            dom.searchInput.focus();
        }

        if (event.key === 'Escape' && state.query) {
            clearSearch();
        }
    });

    window.addEventListener('scroll', handleScrollState, { passive: true });
    window.addEventListener('popstate', () => {
        hydrateStateFromUrl();
        renderCurrentView();
    });
}

async function loadBookmarks() {
    try {
        const response = await fetch('bookmarks.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawData = await response.json();
        normalizeData(rawData);
        hydrateStateFromUrl();
        renderStaticSections();
        renderCurrentView();
        updateStructuredData();
        handleScrollState();
    } catch (error) {
        console.error('加载书签失败:', error);
        renderLoadError();
    }
}

function normalizeData(rawData) {
    const entries = Object.entries(rawData)
        .filter(([, bookmarks]) => Array.isArray(bookmarks) && bookmarks.length > 0)
        .map(([category, bookmarks]) => {
            const normalizedBookmarks = bookmarks.map((bookmark, index) => normalizeBookmark(bookmark, category, index));
            return {
                name: category,
                id: slugify(category),
                count: normalizedBookmarks.length,
                bookmarks: normalizedBookmarks,
                recentTimestamp: Math.max(...normalizedBookmarks.map((bookmark) => bookmark.timestamp))
            };
        })
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));

    state.categories = entries;
    state.bookmarks = entries.flatMap((category) => category.bookmarks);
}

function normalizeBookmark(bookmark, category, index) {
    const addedAt = bookmark.addedAt || '';
    const parsedTimestamp = Number.isFinite(Date.parse(addedAt)) ? Date.parse(addedAt) : 0;
    const title = (bookmark.title || '未命名书签').trim();
    const description = (bookmark.description || '').trim();
    const url = bookmark.url || '#';
    const domain = extractDomain(url);

    return {
        ...bookmark,
        id: bookmark.id || `${slugify(category)}-${index}`,
        category,
        title,
        description,
        url,
        domain,
        addedAt,
        timestamp: parsedTimestamp,
        searchText: `${category} ${title} ${description} ${domain} ${url}`.toLowerCase()
    };
}

function hydrateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = (params.get('q') || '').trim();
    const category = params.get('category');
    const sort = params.get('sort') || 'relevance';

    state.query = query;
    state.selectedCategory = category && hasCategory(category) ? category : null;
    state.sort = ['relevance', 'recent', 'title'].includes(sort) ? sort : 'relevance';

    syncSearchInputs(state.query);

    if (dom.sortSelect) {
        dom.sortSelect.value = state.sort;
    }
}

function syncUrl() {
    const params = new URLSearchParams();

    if (state.query) {
        params.set('q', state.query);
    }

    if (state.selectedCategory) {
        params.set('category', state.selectedCategory);
    }

    if (state.sort !== 'relevance') {
        params.set('sort', state.sort);
    }

    const nextUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState({}, '', nextUrl);
}

function renderStaticSections() {
    renderStats();
    renderCategoryNav();
    renderFeaturedCategories();
    renderQuickFilters();
}

function renderStats() {
    const largest = state.categories[0];
    const recentBookmark = [...state.bookmarks].sort((left, right) => right.timestamp - left.timestamp)[0];

    dom.statBookmarks.textContent = state.bookmarks.length.toLocaleString('zh-CN');
    dom.statCategories.textContent = state.categories.length.toString();
    dom.statLargest.textContent = largest ? `${largest.name} · ${largest.count}` : '-';
    dom.statRecent.textContent = recentBookmark && recentBookmark.addedAt ? formatDate(recentBookmark.addedAt) : '未记录';
    dom.sidebarSummary.textContent = `共 ${state.categories.length} 个分类，${state.bookmarks.length} 条书签。`;
}

function renderCategoryNav() {
    dom.categoryNav.innerHTML = '';

    const overviewButton = createPillButton(`全部 · ${state.bookmarks.length}`, state.selectedCategory === null && !state.query, () => {
        state.selectedCategory = null;
        state.query = '';
        syncSearchInputs('');
        renderCurrentView();
    }, 'category-link');

    dom.categoryNav.appendChild(overviewButton);

    state.categories.forEach((category) => {
        const button = createPillButton(`${category.name} · ${category.count}`, state.selectedCategory === category.name, () => {
            selectCategory(category.name);
        }, 'category-link');
        button.setAttribute('aria-label', `查看 ${category.name} 分类`);
        dom.categoryNav.appendChild(button);
    });
}

function renderFeaturedCategories() {
    dom.featuredCategories.innerHTML = '';

    state.categories.slice(0, FEATURED_CATEGORY_LIMIT).forEach((category) => {
        const button = createPillButton(category.name, false, () => selectCategory(category.name), 'filter-chip');
        dom.featuredCategories.appendChild(button);
    });
}

function renderQuickFilters() {
    dom.quickFilters.innerHTML = '';

    const overviewChip = createPillButton('全部分类', state.selectedCategory === null && !state.query, showOverview, 'filter-chip');
    dom.quickFilters.appendChild(overviewChip);

    state.categories.slice(0, QUICK_FILTER_LIMIT).forEach((category) => {
        const chip = createPillButton(category.name, state.selectedCategory === category.name, () => selectCategory(category.name), 'filter-chip');
        dom.quickFilters.appendChild(chip);
    });
}

function renderCurrentView() {
    syncUrl();
    renderCategoryNav();
    renderQuickFilters();

    if (state.query) {
        renderSearchResults();
        return;
    }

    if (state.selectedCategory) {
        renderCategoryDetails(state.selectedCategory);
        return;
    }

    renderOverview();
}

function renderOverview() {
    state.selectedCategory = null;
    dom.viewEyebrow.textContent = '书签概览';
    dom.viewTitle.textContent = '按分类浏览常用资源';
    dom.resultCount.textContent = `${state.categories.length} 个分类`;
    dom.searchHint.textContent = '输入关键词，或选择分类开始浏览。';

    const overviewGrid = document.createElement('div');
    overviewGrid.className = 'overview-grid';

    state.categories.forEach((category) => {
        overviewGrid.appendChild(createOverviewCard(category));
    });

    dom.contentArea.replaceChildren(overviewGrid);
}

function renderCategoryDetails(categoryName) {
    const category = state.categories.find((item) => item.name === categoryName);
    if (!category) {
        showOverview();
        return;
    }

    dom.viewEyebrow.textContent = '分类浏览';
    dom.viewTitle.textContent = `${category.name} · ${category.count} 条书签`;
    dom.resultCount.textContent = `${category.count} 条结果`;
    dom.searchHint.textContent = `当前浏览 ${category.name} 分类。`;

    const items = sortBookmarks(category.bookmarks, state.sort, state.query);
    renderBookmarkFeed(items, `浏览 ${category.name} 分类`);
}

function renderSearchResults() {
    const items = searchBookmarks(state.query);
    const sortedItems = sortBookmarks(items, state.sort, state.query);

    dom.viewEyebrow.textContent = '即时搜索';
    dom.viewTitle.textContent = state.query ? `“${state.query}” 的搜索结果` : '搜索结果';
    dom.resultCount.textContent = `${sortedItems.length} 条结果`;
    dom.searchHint.textContent = '找到与你输入内容相关的网站与工具。';

    renderBookmarkFeed(sortedItems, '搜索结果');
}

function renderBookmarkFeed(items, emptyTitle) {
    disconnectObserver();
    state.renderQueue = items;
    state.renderIndex = 0;
    state.renderToken += 1;

    if (!items.length) {
        dom.contentArea.replaceChildren(createEmptyState(emptyTitle, '没有找到相关结果。'));
        return;
    }

    const wrapper = document.createElement('div');
    const grid = document.createElement('div');
    const footer = document.createElement('div');
    const status = document.createElement('p');
    const sentinel = document.createElement('div');

    grid.className = 'bookmark-grid';
    footer.className = 'feed-footer';
    status.className = 'feed-status';
    sentinel.className = 'visually-hidden';
    sentinel.setAttribute('aria-hidden', 'true');

    footer.appendChild(status);
    wrapper.append(grid, footer, sentinel);
    dom.contentArea.replaceChildren(wrapper);

    renderNextBatch(grid, status, state.renderToken);
    setupInfiniteLoading(grid, status, sentinel, state.renderToken);
}

function renderNextBatch(grid, status, token) {
    if (token !== state.renderToken) {
        return;
    }

    const fragment = document.createDocumentFragment();
    const batchEnd = Math.min(state.renderIndex + RESULT_BATCH_SIZE, state.renderQueue.length);

    for (let index = state.renderIndex; index < batchEnd; index += 1) {
        fragment.appendChild(createBookmarkCard(state.renderQueue[index], state.query));
    }

    grid.appendChild(fragment);
    state.renderIndex = batchEnd;
    status.innerHTML = `已展示 <strong>${state.renderIndex}</strong> / ${state.renderQueue.length}`;
}

function setupInfiniteLoading(grid, status, sentinel, token) {
    if (state.renderIndex >= state.renderQueue.length) {
        return;
    }

    if ('IntersectionObserver' in window) {
        state.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                renderNextBatch(grid, status, token);

                if (state.renderIndex >= state.renderQueue.length) {
                    disconnectObserver();
                }
            });
        }, { rootMargin: '320px 0px' });

        state.intersectionObserver.observe(sentinel);
        return;
    }

    const loadMore = document.createElement('button');
    loadMore.className = 'text-button';
    loadMore.type = 'button';
    loadMore.textContent = '加载更多';
    loadMore.addEventListener('click', () => {
        renderNextBatch(grid, status, token);
        if (state.renderIndex >= state.renderQueue.length) {
            loadMore.remove();
        }
    });
    status.parentElement.appendChild(loadMore);
}

function disconnectObserver() {
    if (state.intersectionObserver) {
        state.intersectionObserver.disconnect();
        state.intersectionObserver = null;
    }
}

function createOverviewCard(category) {
    const card = document.createElement('article');
    const header = document.createElement('header');
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    const badge = document.createElement('span');
    const summary = document.createElement('p');
    const preview = document.createElement('div');
    const footer = document.createElement('div');
    const updated = document.createElement('span');
    const action = document.createElement('button');

    card.className = 'overview-card';
    title.textContent = category.name;
    badge.className = 'count-badge';
    badge.textContent = `${category.count} 条`;
    summary.className = 'overview-summary';
    summary.textContent = '精选该分类中的热门站点。';
    preview.className = 'overview-preview';
    footer.className = 'overview-footer';
    updated.className = 'bookmark-meta';
    updated.textContent = `最近更新：${formatTimestamp(category.recentTimestamp)}`;
    action.className = 'text-button';
    action.type = 'button';
    action.textContent = '查看分类';
    action.addEventListener('click', () => selectCategory(category.name));

    header.append(titleGroup, badge);
    titleGroup.appendChild(title);
    footer.append(updated, action);

    category.bookmarks.slice(0, CATEGORY_PREVIEW_LIMIT).forEach((bookmark) => {
        const previewLink = document.createElement('a');
        const previewTitle = document.createElement('strong');
        const previewMeta = document.createElement('span');

        previewLink.className = 'preview-link';
        previewLink.href = bookmark.url;
        previewLink.target = '_blank';
        previewLink.rel = 'noopener noreferrer';
        previewTitle.textContent = bookmark.title;
        previewMeta.textContent = bookmark.domain;

        previewLink.append(previewTitle, previewMeta);
        preview.appendChild(previewLink);
    });

    card.append(header, summary, preview, footer);
    return card;
}

function createBookmarkCard(bookmark, query) {
    const card = document.createElement('article');
    const header = document.createElement('header');
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    const categoryBadge = document.createElement('button');
    const description = document.createElement('p');
    const meta = document.createElement('div');
    const footer = document.createElement('div');
    const dateBadge = document.createElement('span');
    const domainBadge = document.createElement('span');
    const openLink = document.createElement('a');

    card.className = 'bookmark-card';

    titleLink.className = 'bookmark-title';
    titleLink.href = bookmark.url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.innerHTML = highlightMatch(bookmark.title, query);
    title.appendChild(titleLink);

    categoryBadge.className = 'category-badge';
    categoryBadge.type = 'button';
    categoryBadge.textContent = bookmark.category;
    categoryBadge.addEventListener('click', () => selectCategory(bookmark.category));

    description.className = 'bookmark-description';
    description.innerHTML = highlightMatch(bookmark.description || '暂无描述', query);

    meta.className = 'bookmark-meta';
    dateBadge.className = 'meta-badge';
    dateBadge.textContent = bookmark.addedAt ? `添加于 ${formatDate(bookmark.addedAt)}` : '未记录时间';
    domainBadge.className = 'domain-badge';
    domainBadge.textContent = bookmark.domain;
    meta.append(dateBadge, domainBadge);

    openLink.className = 'bookmark-action';
    openLink.href = bookmark.url;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = '访问链接';

    header.append(titleGroup, categoryBadge);
    titleGroup.appendChild(title);
    footer.className = 'bookmark-footer';
    footer.append(meta, openLink);
    card.append(header, description, footer);

    return card;
}

function createEmptyState(title, description) {
    const box = document.createElement('section');
    const heading = document.createElement('h3');
    const paragraph = document.createElement('p');

    box.className = 'empty-state';
    heading.textContent = title;
    paragraph.textContent = description;
    box.append(heading, paragraph);

    return box;
}

function createPillButton(label, active, handler, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (active) {
        button.classList.add('active');
    }
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
}

function handleSearchInput(event) {
    window.clearTimeout(state.searchTimer);
    const nextValue = event.target.value.trim();
    syncSearchInputs(nextValue);

    state.searchTimer = window.setTimeout(() => {
        state.query = nextValue;
        if (state.query) {
            state.selectedCategory = null;
        }
        renderCurrentView();
    }, SEARCH_DEBOUNCE);
}

function clearSearch() {
    syncSearchInputs('');
    state.query = '';
    renderCurrentView();
}

function handleSortChange() {
    state.sort = dom.sortSelect.value;
    renderCurrentView();
}

function showOverview() {
    syncSearchInputs('');
    state.query = '';
    state.selectedCategory = null;
    renderCurrentView();
}

function selectCategory(categoryName) {
    state.selectedCategory = categoryName;
    state.query = '';
    syncSearchInputs('');
    renderCurrentView();
}

function syncSearchInputs(value) {
    dom.searchInput.value = value;
    if (dom.sidebarSearchInput) {
        dom.sidebarSearchInput.value = value;
    }
}

function searchBookmarks(query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return state.bookmarks;
    }

    return state.bookmarks
        .map((bookmark) => ({
            ...bookmark,
            score: calculateScore(bookmark, normalizedQuery)
        }))
        .filter((bookmark) => bookmark.score > 0);
}

function calculateScore(bookmark, query) {
    const queryTerms = query.split(/\s+/).filter(Boolean);
    const title = bookmark.title.toLowerCase();
    const description = bookmark.description.toLowerCase();
    const category = bookmark.category.toLowerCase();
    const domain = bookmark.domain.toLowerCase();
    const url = bookmark.url.toLowerCase();

    let score = 0;

    if (category === query) {
        score += 120;
    } else if (category.includes(query)) {
        score += 60;
    }

    if (title === query) {
        score += 120;
    } else if (title.startsWith(query)) {
        score += 80;
    } else if (title.includes(query)) {
        score += 50;
    }

    if (description.includes(query)) {
        score += 30;
    }

    if (domain.includes(query)) {
        score += 24;
    }

    if (url.includes(query)) {
        score += 12;
    }

    queryTerms.forEach((term) => {
        if (title.includes(term)) {
            score += 16;
        }
        if (description.includes(term)) {
            score += 9;
        }
        if (category.includes(term)) {
            score += 12;
        }
        if (domain.includes(term)) {
            score += 8;
        }
    });

    return score;
}

function sortBookmarks(items, sortMode, query) {
    const nextItems = [...items];

    if (sortMode === 'recent') {
        return nextItems.sort((left, right) => right.timestamp - left.timestamp || left.title.localeCompare(right.title, 'zh-CN'));
    }

    if (sortMode === 'title') {
        return nextItems.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
    }

    if (query) {
        return nextItems.sort((left, right) => {
            const leftScore = left.score ?? calculateScore(left, query.toLowerCase());
            const rightScore = right.score ?? calculateScore(right, query.toLowerCase());
            return rightScore - leftScore || right.timestamp - left.timestamp;
        });
    }

    return nextItems.sort((left, right) => right.timestamp - left.timestamp || left.title.localeCompare(right.title, 'zh-CN'));
}

function renderLoadError() {
    dom.viewEyebrow.textContent = '加载失败';
    dom.viewTitle.textContent = '书签内容暂时不可用';
    dom.resultCount.textContent = '0 项';
    dom.contentArea.replaceChildren(createEmptyState('暂时无法加载内容', '请稍后再试。'));
}

function updateStructuredData() {
    const topCategories = state.categories.slice(0, 8).map((category) => ({
        '@type': 'CollectionPage',
        name: category.name,
        about: category.bookmarks.slice(0, 4).map((bookmark) => bookmark.title)
    }));

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '咪豆猫书签导航',
        inLanguage: 'zh-CN',
        description: '聚合 AI、开发、设计与学习资源的网站导航。',
        mainEntity: {
            '@type': 'ItemList',
            numberOfItems: state.bookmarks.length,
            itemListElement: topCategories
        }
    };

    dom.structuredData.textContent = JSON.stringify(structuredData, null, 2);
}

function highlightMatch(text, query) {
    const safeText = escapeHtml(text || '');
    if (!query) {
        return safeText;
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`(${escapedQuery})`, 'ig');
    return safeText.replace(matcher, '<mark class="match-mark">$1</mark>');
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hasCategory(categoryName) {
    return state.categories.some((category) => category.name === categoryName);
}

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
        return '未知域名';
    }
}

function formatDate(value) {
    if (!value) {
        return '未记录';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function formatTimestamp(timestamp) {
    if (!timestamp) {
        return '未记录';
    }

    return formatDate(new Date(timestamp).toISOString());
}

function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '');
}

function handleScrollState() {
    const show = window.scrollY > 640;
    dom.backToTop.hidden = !show;
    dom.jumpTop.classList.toggle('active', show);
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
