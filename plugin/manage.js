const state = {
    bookmarksData: {},
    selectedCategory: null,
    fileSha: '',
    settings: null,
    dirty: false,
    duplicateGroups: [],
    hasScannedDuplicates: false
};

const dom = {};

document.addEventListener('DOMContentLoaded', initializeManagePage);

async function initializeManagePage() {
    cacheDom();
    bindEvents();
    await loadSettings();
    await hydrateState();
}

function cacheDom() {
    dom.categoryList = document.getElementById('category-list');
    dom.totalCategories = document.getElementById('total-categories');
    dom.totalBookmarks = document.getElementById('total-bookmarks');
    dom.status = document.getElementById('status');
    dom.editorTitle = document.getElementById('editor-title');
    dom.editorSubtitle = document.getElementById('editor-subtitle');
    dom.dirtyFlag = document.getElementById('dirty-flag');
    dom.renameCategoryBtn = document.getElementById('rename-category-btn');
    dom.deleteCategoryBtn = document.getElementById('delete-category-btn');
    dom.newCategoryInput = document.getElementById('new-category-input');
    dom.addCategoryBtn = document.getElementById('add-category-btn');
    dom.reloadBtn = document.getElementById('reload-btn');
    dom.saveBtn = document.getElementById('save-btn');
    dom.bookmarkTitle = document.getElementById('bookmark-title');
    dom.bookmarkUrl = document.getElementById('bookmark-url');
    dom.bookmarkDescription = document.getElementById('bookmark-description');
    dom.addBookmarkBtn = document.getElementById('add-bookmark-btn');
    dom.bookmarkList = document.getElementById('bookmark-list');
    dom.scanDuplicatesBtn = document.getElementById('scan-duplicates-btn');
    dom.clearDuplicatesBtn = document.getElementById('clear-duplicates-btn');
    dom.duplicateSummary = document.getElementById('duplicate-summary');
    dom.duplicateList = document.getElementById('duplicate-list');
}

function bindEvents() {
    dom.addCategoryBtn.addEventListener('click', addCategory);
    dom.reloadBtn.addEventListener('click', reloadFromGitHub);
    dom.saveBtn.addEventListener('click', saveToGitHub);
    dom.addBookmarkBtn.addEventListener('click', addBookmark);
    dom.renameCategoryBtn.addEventListener('click', renameSelectedCategory);
    dom.deleteCategoryBtn.addEventListener('click', deleteSelectedCategory);
    dom.scanDuplicatesBtn.addEventListener('click', scanDuplicates);
    dom.clearDuplicatesBtn.addEventListener('click', clearAllDuplicates);
    window.addEventListener('beforeunload', handleBeforeUnload);
}

async function loadSettings() {
    const settings = await storageSyncGet(['githubRepo', 'githubToken', 'jsonPath']);
    state.settings = {
        githubRepo: settings.githubRepo || '',
        githubToken: settings.githubToken || '',
        jsonPath: settings.jsonPath || 'bookmarks.json'
    };
}

async function hydrateState() {
    const localState = await storageLocalGet(['bookmarksData', 'fileSha']);
    state.bookmarksData = normalizeBookmarksData(localState.bookmarksData || {});
    state.fileSha = localState.fileSha || '';

    const categories = getCategoryNames();
    state.selectedCategory = categories[0] || null;

    renderAll();

    if (categories.length === 0 && hasGitHubConfig()) {
        await reloadFromGitHub();
        return;
    }

    if (!hasGitHubConfig()) {
        showStatus('warning', '请先在插件弹窗的设置页填写 GitHub 仓库、令牌和 JSON 路径。');
    }
}

function normalizeBookmarksData(source) {
    const normalized = {};

    Object.entries(source || {}).forEach(([category, items]) => {
        if (!Array.isArray(items)) {
            return;
        }

        normalized[category] = items.map((bookmark) => ({
            id: bookmark.id || generateId(),
            title: bookmark.title || '',
            url: bookmark.url || '',
            description: bookmark.description || '',
            addedAt: bookmark.addedAt || new Date().toISOString()
        }));
    });

    return normalized;
}

function renderAll() {
    refreshDuplicateGroups();
    renderSummary();
    renderCategoryList();
    renderEditor();
    renderDuplicatePanel();
    updateDirtyFlag();
}

function renderSummary() {
    const categories = getCategoryNames();
    const totalBookmarks = categories.reduce((count, category) => count + state.bookmarksData[category].length, 0);
    dom.totalCategories.textContent = String(categories.length);
    dom.totalBookmarks.textContent = String(totalBookmarks);
}

function renderCategoryList() {
    const categories = getCategoryNames();
    dom.categoryList.innerHTML = '';

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '还没有分类，先添加一个分类。';
        dom.categoryList.appendChild(empty);
        return;
    }

    categories.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `category-item${state.selectedCategory === category ? ' active' : ''}`;
        button.innerHTML = `<span>${escapeHtml(category)}</span><small>${state.bookmarksData[category].length} 条</small>`;
        button.addEventListener('click', () => {
            state.selectedCategory = category;
            renderAll();
        });
        dom.categoryList.appendChild(button);
    });
}

function renderEditor() {
    const category = state.selectedCategory;
    const categories = getCategoryNames();

    dom.renameCategoryBtn.disabled = !category;
    dom.deleteCategoryBtn.disabled = !category;
    dom.addBookmarkBtn.disabled = !category;

    if (!category) {
        dom.editorTitle.textContent = '选择一个分类';
        dom.editorSubtitle.textContent = categories.length === 0 ? '先创建分类，再添加书签。' : '从左侧选择一个分类开始编辑。';
        dom.bookmarkList.innerHTML = '<div class="empty">当前没有可编辑的分类。</div>';
        return;
    }

    const bookmarks = state.bookmarksData[category] || [];
    dom.editorTitle.textContent = category;
    dom.editorSubtitle.textContent = `当前分类下有 ${bookmarks.length} 条书签，可直接修改后提交到 GitHub。`;

    if (bookmarks.length === 0) {
        dom.bookmarkList.innerHTML = '<div class="empty">这个分类还没有书签，使用上方表单添加第一条。</div>';
        return;
    }

    const categoryOptions = categories.map((item) => `<option value="${escapeAttribute(item)}"${item === category ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('');

    dom.bookmarkList.innerHTML = bookmarks.map((bookmark) => `
        <article class="bookmark-card" data-bookmark-id="${escapeAttribute(bookmark.id)}">
            <div class="bookmark-meta">
                <span>添加时间：${formatDate(bookmark.addedAt)}</span>
                <div class="bookmark-actions">
                    <button class="btn danger delete-bookmark-btn" type="button" data-bookmark-id="${escapeAttribute(bookmark.id)}">删除</button>
                </div>
            </div>
            <div class="bookmark-grid">
                <div class="field">
                    <label>标题</label>
                    <input type="text" data-field="title" data-bookmark-id="${escapeAttribute(bookmark.id)}" value="${escapeAttribute(bookmark.title)}">
                </div>
                <div class="field">
                    <label>地址</label>
                    <input type="url" data-field="url" data-bookmark-id="${escapeAttribute(bookmark.id)}" value="${escapeAttribute(bookmark.url)}">
                </div>
                <div class="field full">
                    <label>描述</label>
                    <textarea data-field="description" data-bookmark-id="${escapeAttribute(bookmark.id)}">${escapeHtml(bookmark.description)}</textarea>
                </div>
                <div class="field">
                    <label>所属分类</label>
                    <select data-field="category" data-bookmark-id="${escapeAttribute(bookmark.id)}">${categoryOptions}</select>
                </div>
            </div>
        </article>
    `).join('');

    dom.bookmarkList.querySelectorAll('[data-field]').forEach((element) => {
        element.addEventListener('change', handleBookmarkFieldChange);
    });

    dom.bookmarkList.querySelectorAll('.delete-bookmark-btn').forEach((button) => {
        button.addEventListener('click', deleteBookmark);
    });
}

function renderDuplicatePanel() {
    const groups = state.duplicateGroups;

    dom.clearDuplicatesBtn.disabled = groups.length === 0;

    if (!state.hasScannedDuplicates) {
        dom.duplicateSummary.textContent = '点击按钮扫描重复 URL，默认保留每组中的第一条记录。';
        dom.duplicateList.innerHTML = '<div class="empty">尚未执行去重扫描。</div>';
        return;
    }

    if (groups.length === 0) {
        dom.duplicateSummary.textContent = '未发现重复 URL。';
        dom.duplicateList.innerHTML = '<div class="empty">当前书签数据中没有检测到重复项。</div>';
        return;
    }

    const duplicateCount = groups.reduce((count, group) => count + group.items.length - 1, 0);
    dom.duplicateSummary.textContent = `检测到 ${groups.length} 组重复 URL，共有 ${duplicateCount} 条可清理的重复项。`;

    dom.duplicateList.innerHTML = groups.map((group, index) => `
        <article class="duplicate-group">
            <header>
                <div>
                    <strong>${escapeHtml(group.key)}</strong>
                    <small>保留第 1 条，删除其余 ${group.items.length - 1} 条</small>
                </div>
                <button class="btn danger clear-duplicate-group-btn" type="button" data-group-index="${index}">清理这组重复项</button>
            </header>
            <div class="duplicate-items">
                ${group.items.map((item, itemIndex) => `
                    <div class="duplicate-item${itemIndex === 0 ? ' keep' : ''}">
                        <strong>${escapeHtml(item.bookmark.title || '未命名书签')}</strong>
                        <p>分类：${escapeHtml(item.category)}</p>
                        <p>地址：${escapeHtml(item.bookmark.url || '')}</p>
                        <p>添加时间：${escapeHtml(formatDate(item.bookmark.addedAt))}${itemIndex === 0 ? ' · 保留' : ' · 待删除'}</p>
                    </div>
                `).join('')}
            </div>
        </article>
    `).join('');

    dom.duplicateList.querySelectorAll('.clear-duplicate-group-btn').forEach((button) => {
        button.addEventListener('click', clearDuplicateGroup);
    });
}

async function reloadFromGitHub() {
    if (!hasGitHubConfig()) {
        showStatus('error', '缺少 GitHub 配置，请先到插件弹窗的设置页保存配置。');
        return;
    }

    if (state.dirty && !window.confirm('当前有未提交修改，刷新后会覆盖本地内容，是否继续？')) {
        return;
    }

    showStatus('loading', '正在从 GitHub 读取书签数据...');

    try {
        const fileData = await fetchGitHubFile();
        state.bookmarksData = normalizeBookmarksData(JSON.parse(decodeBase64Utf8(fileData.content)));
        state.fileSha = fileData.sha || '';
        state.selectedCategory = getCategoryNames()[0] || null;
        state.dirty = false;
        await persistLocalState();
        renderAll();
        showStatus('success', '已从 GitHub 刷新到最新书签数据。');
    } catch (error) {
        if (error.code === 404) {
            state.bookmarksData = {};
            state.fileSha = '';
            state.selectedCategory = null;
            state.dirty = false;
            await persistLocalState();
            renderAll();
            showStatus('warning', 'GitHub 上还没有书签文件，当前以空数据开始管理，首次保存时会自动创建。');
            return;
        }

        console.error('读取 GitHub 失败:', error);
        showStatus('error', error.message || '读取 GitHub 失败');
    }
}

async function saveToGitHub() {
    if (!hasGitHubConfig()) {
        showStatus('error', '缺少 GitHub 配置，请先到插件弹窗的设置页保存配置。');
        return;
    }

    showStatus('loading', '正在提交书签到 GitHub...');

    try {
        const response = await putGitHubFile(state.bookmarksData, state.fileSha);
        state.fileSha = response.content.sha;
        state.dirty = false;
        await persistLocalState();
        renderAll();
        showStatus('success', '书签已提交到 GitHub。');
    } catch (error) {
        console.error('提交 GitHub 失败:', error);
        if (error.code === 409 || error.code === 422) {
            showStatus('error', 'GitHub 文件版本已变化，请先点击“从 GitHub 刷新”，再重新合并并提交。');
            return;
        }

        showStatus('error', error.message || '提交 GitHub 失败');
    }
}

async function addCategory() {
    const category = dom.newCategoryInput.value.trim();
    if (!category) {
        showStatus('error', '请输入分类名称。');
        return;
    }

    if (state.bookmarksData[category]) {
        showStatus('error', '这个分类已经存在。');
        return;
    }

    state.bookmarksData[category] = [];
    state.selectedCategory = category;
    dom.newCategoryInput.value = '';
    await markDirtyAndPersist();
    renderAll();
    showStatus('success', `已创建分类“${category}”。`);
}

async function renameSelectedCategory() {
    const currentName = state.selectedCategory;
    if (!currentName) {
        return;
    }

    const nextName = window.prompt('输入新的分类名称', currentName);
    if (nextName === null) {
        return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
        showStatus('error', '分类名称不能为空。');
        return;
    }

    if (trimmedName === currentName) {
        return;
    }

    if (state.bookmarksData[trimmedName]) {
        showStatus('error', '目标分类名称已存在。');
        return;
    }

    state.bookmarksData[trimmedName] = state.bookmarksData[currentName];
    delete state.bookmarksData[currentName];
    state.selectedCategory = trimmedName;
    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '分类名称已更新。');
}

async function deleteSelectedCategory() {
    const category = state.selectedCategory;
    if (!category) {
        return;
    }

    const count = (state.bookmarksData[category] || []).length;
    if (!window.confirm(`确定删除分类“${category}”吗？其中的 ${count} 条书签也会一并删除。`)) {
        return;
    }

    delete state.bookmarksData[category];
    state.selectedCategory = getCategoryNames()[0] || null;
    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '分类已删除。');
}

async function addBookmark() {
    const category = state.selectedCategory;
    if (!category) {
        showStatus('error', '请先创建或选择一个分类。');
        return;
    }

    const title = dom.bookmarkTitle.value.trim();
    const url = dom.bookmarkUrl.value.trim();
    const description = dom.bookmarkDescription.value.trim();

    if (!title || !url) {
        showStatus('error', '标题和地址都必须填写。');
        return;
    }

    state.bookmarksData[category].unshift({
        id: generateId(),
        title,
        url,
        description,
        addedAt: new Date().toISOString()
    });

    dom.bookmarkTitle.value = '';
    dom.bookmarkUrl.value = '';
    dom.bookmarkDescription.value = '';

    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '书签已添加到当前分类。');
}

async function handleBookmarkFieldChange(event) {
    const bookmarkId = event.target.dataset.bookmarkId;
    const field = event.target.dataset.field;
    const currentCategory = state.selectedCategory;

    if (!bookmarkId || !field || !currentCategory) {
        return;
    }

    const bookmarkIndex = state.bookmarksData[currentCategory].findIndex((item) => item.id === bookmarkId);
    if (bookmarkIndex === -1) {
        return;
    }

    const bookmark = state.bookmarksData[currentCategory][bookmarkIndex];

    if (field === 'category') {
        const targetCategory = event.target.value;
        if (!state.bookmarksData[targetCategory]) {
            return;
        }

        state.bookmarksData[currentCategory].splice(bookmarkIndex, 1);
        state.bookmarksData[targetCategory].unshift(bookmark);
        await markDirtyAndPersist();
        renderAll();
        showStatus('success', '书签已移动到新的分类。');
        return;
    }

    bookmark[field] = event.target.value;
    await markDirtyAndPersist();
    updateDirtyFlag();
}

async function deleteBookmark(event) {
    const bookmarkId = event.target.dataset.bookmarkId;
    const category = state.selectedCategory;
    if (!bookmarkId || !category) {
        return;
    }

    state.bookmarksData[category] = state.bookmarksData[category].filter((item) => item.id !== bookmarkId);
    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '书签已删除。');
}

async function scanDuplicates() {
    state.hasScannedDuplicates = true;
    refreshDuplicateGroups();
    renderDuplicatePanel();

    if (state.duplicateGroups.length === 0) {
        showStatus('success', '去重扫描完成，未发现重复 URL。');
        return;
    }

    const duplicateCount = state.duplicateGroups.reduce((count, group) => count + group.items.length - 1, 0);
    showStatus('warning', `去重扫描完成，发现 ${state.duplicateGroups.length} 组重复 URL，共 ${duplicateCount} 条可清理项。`);
}

async function clearDuplicateGroup(event) {
    const groupIndex = Number(event.target.dataset.groupIndex);
    const group = state.duplicateGroups[groupIndex];

    if (!group) {
        return;
    }

    if (!window.confirm(`确定清理这组重复 URL 吗？将保留第 1 条，删除其余 ${group.items.length - 1} 条。`)) {
        return;
    }

    group.items.slice(1).forEach((item) => {
        removeBookmarkById(item.category, item.bookmark.id);
    });

    if (!state.bookmarksData[state.selectedCategory]) {
        state.selectedCategory = getCategoryNames()[0] || null;
    }

    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '这组重复项已清理。');
}

async function clearAllDuplicates() {
    if (state.duplicateGroups.length === 0) {
        showStatus('success', '当前没有可清理的重复项。');
        return;
    }

    const duplicateCount = state.duplicateGroups.reduce((count, group) => count + group.items.length - 1, 0);
    if (!window.confirm(`确定删除全部重复项吗？将删除 ${duplicateCount} 条重复书签，并保留每组中的第 1 条。`)) {
        return;
    }

    state.duplicateGroups.forEach((group) => {
        group.items.slice(1).forEach((item) => {
            removeBookmarkById(item.category, item.bookmark.id);
        });
    });

    if (!state.bookmarksData[state.selectedCategory]) {
        state.selectedCategory = getCategoryNames()[0] || null;
    }

    await markDirtyAndPersist();
    renderAll();
    showStatus('success', '全部重复项已清理。');
}

async function markDirtyAndPersist() {
    state.dirty = true;
    await persistLocalState();
}

function refreshDuplicateGroups() {
    state.duplicateGroups = collectDuplicateGroups();
}

function collectDuplicateGroups() {
    const groups = new Map();

    getCategoryNames().forEach((category) => {
        state.bookmarksData[category].forEach((bookmark, index) => {
            const duplicateKey = normalizeUrlForDuplicateCheck(bookmark.url);
            if (!duplicateKey) {
                return;
            }

            if (!groups.has(duplicateKey)) {
                groups.set(duplicateKey, []);
            }

            groups.get(duplicateKey).push({
                category,
                bookmark,
                order: index
            });
        });
    });

    return Array.from(groups.entries())
        .filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({
            key,
            items: items.sort(compareDuplicateItems)
        }))
        .sort((left, right) => right.items.length - left.items.length || left.key.localeCompare(right.key, 'en'));
}

function compareDuplicateItems(left, right) {
    const leftTime = parseTimestamp(left.bookmark.addedAt);
    const rightTime = parseTimestamp(right.bookmark.addedAt);

    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    return left.order - right.order;
}

function normalizeUrlForDuplicateCheck(value) {
    const url = (value || '').trim();
    if (!url) {
        return '';
    }

    try {
        const parsed = new URL(url);
        parsed.hash = '';

        const entries = Array.from(parsed.searchParams.entries())
            .filter(([key]) => !/^utm_/i.test(key) && key !== 'fbclid' && key !== 'gclid')
            .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, 'en'));

        parsed.search = entries.length > 0
            ? `?${entries.map(([key, entryValue]) => `${encodeURIComponent(key)}=${encodeURIComponent(entryValue)}`).join('&')}`
            : '';

        const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${normalizedPath}${parsed.search}`;
    } catch (error) {
        return url.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
    }
}

function removeBookmarkById(category, bookmarkId) {
    if (!state.bookmarksData[category]) {
        return;
    }

    state.bookmarksData[category] = state.bookmarksData[category].filter((item) => item.id !== bookmarkId);
}

async function persistLocalState() {
    await storageLocalSet({
        bookmarksData: state.bookmarksData,
        fileSha: state.fileSha
    });
}

function updateDirtyFlag() {
    dom.dirtyFlag.hidden = !state.dirty;
}

function getCategoryNames() {
    return Object.keys(state.bookmarksData).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function hasGitHubConfig() {
    return Boolean(state.settings.githubRepo && state.settings.githubToken && state.settings.jsonPath);
}

async function fetchGitHubFile() {
    const { owner, repo, path, token } = getGitHubRequestContext();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        const error = new Error(`读取失败: ${response.status}`);
        error.code = response.status;
        throw error;
    }

    return response.json();
}

async function putGitHubFile(bookmarksData, sha) {
    const { owner, repo, path, token } = getGitHubRequestContext();
    const requestBody = {
        message: '更新书签数据',
        content: encodeBase64Utf8(JSON.stringify(bookmarksData, null, 2))
    };

    if (sha) {
        requestBody.sha = sha;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.message || `提交失败: ${response.status}`);
        error.code = response.status;
        throw error;
    }

    return data;
}

function getGitHubRequestContext() {
    if (!hasGitHubConfig()) {
        throw new Error('缺少 GitHub 配置');
    }

    const [owner, repo] = state.settings.githubRepo.split('/');

    if (!owner || !repo) {
        throw new Error('GitHub 仓库格式应为 用户名/仓库名');
    }

    return {
        owner,
        repo,
        path: state.settings.jsonPath,
        token: state.settings.githubToken
    };
}

function showStatus(type, message) {
    dom.status.className = `status ${type}`;
    dom.status.textContent = message;
}

function handleBeforeUnload(event) {
    if (!state.dirty) {
        return;
    }

    event.preventDefault();
    event.returnValue = '';
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '未记录';
    }

    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function parseTimestamp(value) {
    const timestamp = Date.parse(value || '');
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function encodeBase64Utf8(value) {
    return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64Utf8(value) {
    return decodeURIComponent(escape(atob(value)));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function storageSyncGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(keys, resolve);
    });
}

function storageLocalGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

function storageLocalSet(value) {
    return new Promise((resolve) => {
        chrome.storage.local.set(value, resolve);
    });
}