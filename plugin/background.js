// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    // 创建父菜单项
    chrome.contextMenus.create({
        id: "addToBookmarks",
        title: "添加到书签管理器",
        contexts: ["page", "link"]
    });

    // 动态加载类别子菜单项
    updateContextMenuCategories();
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "addToBookmarks" || info.menuItemId === "createNewCategory") {
        // 打开插件弹窗
        chrome.action.openPopup();
    } else if (info.menuItemId.startsWith("category_")) {
        // 获取分类名称
        const category = info.menuItemId.replace("category_", "");

        // 使用该分类保存书签
        saveBookmarkWithCategory(tab, category, info.linkUrl);
    }
});

// 更新右键菜单中的分类
function updateContextMenuCategories() {
    // 清除所有现有子菜单
    chrome.contextMenus.removeAll(() => {
        // 重新创建父菜单
        chrome.contextMenus.create({
            id: "addToBookmarks",
            title: "添加到书签管理器",
            contexts: ["page", "link"]
        });

        // 从存储中获取书签数据
        chrome.storage.local.get('bookmarksData', (data) => {
            if (data.bookmarksData) {
                // 为每个分类创建子菜单
                Object.keys(data.bookmarksData).forEach(category => {
                    chrome.contextMenus.create({
                        id: "category_" + category,
                        parentId: "addToBookmarks",
                        title: category,
                        contexts: ["page", "link"]
                    });
                });

                // 添加"创建新分类"菜单项
                chrome.contextMenus.create({
                    id: "createNewCategory",
                    parentId: "addToBookmarks",
                    title: "创建新分类...",
                    contexts: ["page", "link"]
                });
            }
        });
    });
}

// 当书签数据更新时，刷新右键菜单
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.bookmarksData) {
        updateContextMenuCategories();
    }
});

// 使用指定分类保存书签
function saveBookmarkWithCategory(tab, category, linkUrl = null) {
    // 获取要保存的URL和标题
    const url = linkUrl || tab.url;
    const title = tab.title;

    // 从存储中获取书签数据
    chrome.storage.local.get(['bookmarksData', 'fileSha'], (data) => {
        let bookmarksData = data.bookmarksData || {};
        const fileSha = data.fileSha;

        // 确保分类存在
        if (!bookmarksData[category]) {
            bookmarksData[category] = [];
        }

        // 创建新书签对象
        const newBookmark = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            title: title,
            url: url,
            description: "",
            addedAt: new Date().toISOString()
        };

        // 添加到相应分类
        bookmarksData[category].push(newBookmark);

        // 保存到本地
        chrome.storage.local.set({ bookmarksData: bookmarksData }, () => {
            // 上传到GitHub
            uploadToGitHub(bookmarksData, fileSha);

            // 显示通知
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '书签已保存',
                message: `已将"${title}"添加到"${category}"分类`
            });
        });
    });
}

// 上传到GitHub
function uploadToGitHub(bookmarksData, fileSha) {
    chrome.storage.sync.get(['githubRepo', 'githubToken', 'jsonPath'], (settings) => {
        if (!settings.githubRepo || !settings.githubToken || !settings.jsonPath) {
            console.error('GitHub配置不完整');
            return;
        }

        const [owner, repo] = settings.githubRepo.split('/');
        const content = utf8_to_b64(JSON.stringify(bookmarksData, null, 2)); // Base64编码

        const requestBody = {
            message: '添加新书签',
            content: content
        };

        // 如果有SHA，添加到请求中
        if (fileSha) {
            requestBody.sha = fileSha;
        }

        fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${settings.jsonPath}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${settings.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })
            .then(response => response.json())
            .then(data => {
                if (data.content) {
                    // 更新本地保存的SHA
                    chrome.storage.local.set({ fileSha: data.content.sha });
                    console.log('书签已成功上传到GitHub');
                } else if (data.message) {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                console.error('上传到GitHub失败:', error);
            });
    });
}

function utf8_to_b64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function b64_to_utf8(str) {
    return decodeURIComponent(escape(atob(str)));
}