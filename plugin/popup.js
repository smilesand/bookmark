// 当弹出窗口加载时
document.addEventListener('DOMContentLoaded', function () {
    // 初始化标签切换功能
    initTabs();

    // 加载设置
    loadSettings();

    // 加载当前页面信息
    loadCurrentPageInfo();

    // 加载分类下拉菜单
    loadCategories();

    // 设置保存按钮事件
    document.getElementById('save-btn').addEventListener('click', saveBookmark);

    // 设置分类改变事件
    document.getElementById('category').addEventListener('change', function () {
        const newCategoryGroup = document.getElementById('new-category-group');
        if (this.value === 'new') {
            newCategoryGroup.style.display = 'block';
        } else {
            newCategoryGroup.style.display = 'none';
        }
    });

    // 设置保存设置按钮事件
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

    // 设置测试连接按钮事件
    document.getElementById('test-connection-btn').addEventListener('click', testConnection);
});

// 初始化标签切换功能
function initTabs() {
    const tabs = document.querySelectorAll('.tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            // 移除所有标签的活动状态
            tabs.forEach(t => t.classList.remove('active'));

            // 隐藏所有内容
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            // 设置当前标签为活动状态
            this.classList.add('active');

            // 显示当前标签对应的内容
            const tabId = this.dataset.tab;
            document.getElementById(tabId + '-tab').classList.add('active');
        });
    });
}

// 加载用户设置
function loadSettings() {
    chrome.storage.sync.get(['githubRepo', 'githubToken', 'jsonPath'], function (data) {
        if (data.githubRepo) {
            document.getElementById('github-repo').value = data.githubRepo;
        }

        if (data.githubToken) {
            document.getElementById('github-token').value = data.githubToken;
        }

        if (data.jsonPath) {
            document.getElementById('json-path').value = data.jsonPath;
        } else {
            document.getElementById('json-path').value = 'bookmarks.json';
        }
    });
}

// 保存用户设置
function saveSettings() {
    const githubRepo = document.getElementById('github-repo').value.trim();
    const githubToken = document.getElementById('github-token').value.trim();
    const jsonPath = document.getElementById('json-path').value.trim();

    if (!githubRepo || !githubToken || !jsonPath) {
        showSettingsStatus('error', '所有字段都必须填写');
        return;
    }

    chrome.storage.sync.set({
        githubRepo: githubRepo,
        githubToken: githubToken,
        jsonPath: jsonPath
    }, function () {
        showSettingsStatus('success', '设置已保存');
    });
}

// 测试GitHub连接
function testConnection() {
    const statusElement = document.getElementById('settings-status');
    showSettingsStatus('loading', '正在测试连接...');

    chrome.storage.sync.get(['githubRepo', 'githubToken', 'jsonPath'], function (data) {
        if (!data.githubRepo || !data.githubToken || !data.jsonPath) {
            showSettingsStatus('error', '请先保存设置');
            return;
        }

        const [owner, repo] = data.githubRepo.split('/');

        fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${data.jsonPath}`, {
            headers: {
                'Authorization': `token ${data.githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        })
            .then(response => {
                if (response.status === 200) {
                    return response.json().then(data => {
                        loadBookmarksData(data);
                        showSettingsStatus('success', '连接成功! 书签数据已加载');
                    });
                } else if (response.status === 404) {
                    showSettingsStatus('loading', '文件不存在，将创建新文件');
                    createNewJsonFile(owner, repo, data.jsonPath, data.githubToken);
                } else {
                    throw new Error(`GitHub API返回错误: ${response.status}`);
                }
            })
            .catch(error => {
                console.error('连接测试失败:', error);
                showSettingsStatus('error', `连接失败: ${error.message}`);
            });
    });
}

// 创建新的JSON文件
function createNewJsonFile(owner, repo, path, token) {
    const emptyData = {};
    const content = utf8_to_b64(JSON.stringify(emptyData, null, 2)); // Base64编码

    fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: '创建书签数据文件',
            content: content
        })
    })
        .then(response => {
            if (response.status === 201) {
                chrome.storage.local.set({ bookmarksData: emptyData });
                showSettingsStatus('success', '新的书签文件已创建');
            } else {
                throw new Error(`文件创建失败: ${response.status}`);
            }
        })
        .catch(error => {
            showSettingsStatus('error', `文件创建失败: ${error.message}`);
        });
}

// 加载书签数据
function loadBookmarksData(fileData) {
    // 解码Base64内容
    const content = b64_to_utf8(fileData.content);
    try {
        const bookmarksData = JSON.parse(content);
        chrome.storage.local.set({
            bookmarksData: bookmarksData,
            fileSha: fileData.sha // 保存SHA用于后续更新
        });

        // 更新类别下拉菜单
        updateCategoryDropdown(bookmarksData);
    } catch (error) {
        console.error('解析书签数据失败:', error);
        showSettingsStatus('error', '解析书签数据失败');
    }
}

// 加载当前页面信息
function loadCurrentPageInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];
        document.getElementById('title').value = currentTab.title;
        document.getElementById('description').value = '';
    });
}

// 加载分类下拉菜单
function loadCategories() {
    chrome.storage.local.get('bookmarksData', function (data) {
        if (data.bookmarksData) {
            updateCategoryDropdown(data.bookmarksData);
        } else {
            // 如果本地没有数据，则尝试从GitHub加载
            chrome.storage.sync.get(['githubRepo', 'githubToken', 'jsonPath'], function (settings) {
                if (settings.githubRepo && settings.githubToken && settings.jsonPath) {
                    testConnection();
                } else {
                    // 没有设置，显示提示
                    document.getElementById('category').innerHTML = `
                        <option value="">请先在设置中配置GitHub</option>
                    `;
                }
            });
        }
    });
}

// 更新类别下拉菜单
function updateCategoryDropdown(bookmarksData) {
    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = '';

    if (Object.keys(bookmarksData).length === 0) {
        const option = document.createElement('option');
        option.value = 'new';
        option.textContent = '创建新分类';
        categorySelect.appendChild(option);

        document.getElementById('new-category-group').style.display = 'block';
    } else {
        // 添加现有分类
        Object.keys(bookmarksData).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = `${category} (${bookmarksData[category].length})`;
            categorySelect.appendChild(option);
        });

        // 添加创建新分类选项
        const option = document.createElement('option');
        option.value = 'new';
        option.textContent = '创建新分类';
        categorySelect.appendChild(option);
    }
}

// 保存书签
function saveBookmark() {
    const statusElement = document.getElementById('status');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];
        const title = document.getElementById('title').value.trim();
        const description = document.getElementById('description').value.trim();
        let category = document.getElementById('category').value;

        if (!title) {
            showStatus('error', '请输入标题');
            return;
        }

        if (category === 'new' || category === '') {
            const newCategory = document.getElementById('new-category').value.trim();
            if (!newCategory) {
                showStatus('error', '请输入新分类名称');
                return;
            }
            category = newCategory;
        }

        // 显示加载状态
        showStatus('loading', '正在保存书签...');

        // 从本地获取书签数据
        chrome.storage.local.get(['bookmarksData', 'fileSha'], function (data) {
            let bookmarksData = data.bookmarksData || {};
            const fileSha = data.fileSha;

            // 确保分类存在
            if (!bookmarksData[category]) {
                bookmarksData[category] = [];
            }

            // 创建新书签对象
            const newBookmark = {
                id: generateId(),
                title: title,
                url: currentTab.url,
                description: description,
                addedAt: new Date().toISOString()
            };

            // 添加到相应分类
            bookmarksData[category].push(newBookmark);

            // 保存到本地
            chrome.storage.local.set({ bookmarksData: bookmarksData }, function () {
                // 上传到GitHub
                uploadToGitHub(bookmarksData, fileSha);
            });
        });
    });
}

// 上传到GitHub
function uploadToGitHub(bookmarksData, fileSha) {
    console.log(bookmarksData);
    console.log(fileSha);
    chrome.storage.sync.get(['githubRepo', 'githubToken', 'jsonPath'], function (settings) {
        console.log(settings);
        if (!settings.githubRepo || !settings.githubToken || !settings.jsonPath) {
            showStatus('error', '请先在设置中配置GitHub');
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
                    showStatus('success', '书签已保存并上传到GitHub');
                } else if (data.message) {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                console.error('上传到GitHub失败:', error);
                showStatus('error', `上传失败: ${error.message}`);
            });
    });
}

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 显示状态消息
function showStatus(type, message) {
    const statusElement = document.getElementById('status');
    statusElement.className = 'status ' + type;

    if (type === 'loading') {
        statusElement.innerHTML = `<span class="spinner"></span> ${message}`;
    } else {
        statusElement.textContent = message;
    }
}

// 显示设置标签页的状态消息
function showSettingsStatus(type, message) {
    const statusElement = document.getElementById('settings-status');
    statusElement.className = 'status ' + type;

    if (type === 'loading') {
        statusElement.innerHTML = `<span class="spinner"></span> ${message}`;
    } else {
        statusElement.textContent = message;
    }
}

function utf8_to_b64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function b64_to_utf8(str) {
    return decodeURIComponent(escape(atob(str)));
}