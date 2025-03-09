
// 初始书签数据
let bookmarksData = {};

// 加载书签数据
async function loadBookmarks() {
    try {
        const response = await fetch('bookmarks.json');
        bookmarksData = await response.json();
        renderBookmarks();
        renderCategoryNav();
        setupEventListeners();
    } catch (error) {
        console.error('加载书签失败:', error);
    }
}

// 渲染书签
function renderBookmarks(data = bookmarksData) {
    const container = document.getElementById('bookmarks-container');
    container.innerHTML = '';

    if (Object.keys(data).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i>📚</i>
                <h2>没有找到书签</h2>
                <p>点击右下角的"+"按钮添加您的第一个书签</p>
            </div>
        `;
        return;
    }

    Object.keys(data).forEach(category => {
        const bookmarks = data[category];
        if (bookmarks.length === 0) return;

        const section = document.createElement('section');
        section.classList.add('category-section');
        section.id = `category-${category}`;

        section.innerHTML = `
            <div class="category-header">
                <h2>${category}</h2>
                <span class="count">${bookmarks.length}</span>
            </div>
            <div class="bookmarks-grid" id="grid-${category}"></div>
        `;

        container.appendChild(section);

        const grid = document.getElementById(`grid-${category}`);
        bookmarks.forEach(bookmark => {
            const card = document.createElement('div');
            card.classList.add('bookmark-card');
            card.innerHTML = `
                <h3>${bookmark.title}</h3>
                <p>${bookmark.description || '没有描述'}</p>
                <a href="${bookmark.url}" target="_blank">访问</a>
            `;
            grid.appendChild(card);
        });
    });
}

// 渲染分类导航
function renderCategoryNav() {
    const nav = document.getElementById('category-nav');
    nav.innerHTML = '';

    Object.keys(bookmarksData).forEach(category => {
        if (bookmarksData[category].length === 0) return;

        const button = document.createElement('button');
        button.textContent = category;
        button.addEventListener('click', () => {
            scrollToCategory(category);

            // 设置活动状态
            document.querySelectorAll('.category-nav button').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
        });
        nav.appendChild(button);
    });
}

// 滚动到分类位置
function scrollToCategory(category) {
    const element = document.getElementById(`category-${category}`);
    if (element) {
        window.scrollTo({
            top: element.offsetTop - 20,
            behavior: 'smooth'
        });
    }
}

// 搜索书签
function searchBookmarks(query) {
    query = query.toLowerCase();
    if (!query) {
        renderBookmarks();
        return;
    }

    const results = {};

    Object.keys(bookmarksData).forEach(category => {
        if (category.toLowerCase().includes(query)) {
            results[category] = bookmarksData[category];
            return;
        }

        const matchedBookmarks = bookmarksData[category].filter(bookmark =>
            bookmark.title.toLowerCase().includes(query) ||
            (bookmark.description && bookmark.description.toLowerCase().includes(query))
        );

        if (matchedBookmarks.length > 0) {
            results[category] = matchedBookmarks;
        }
    });

    renderBookmarks(results);
}

// 添加事件监听器
function setupEventListeners() {
    // 搜索功能
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    searchButton.addEventListener('click', () => {
        searchBookmarks(searchInput.value);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBookmarks(searchInput.value);
        }
    });
}

document.addEventListener('DOMContentLoaded', loadBookmarks);
