/**
 * SessionManager - 管理转录会话
 * 功能：创建、保存、加载、删除、切换会话
 */
class SessionManager {
    constructor() {
        this.sessions = {};
        this.currentSessionId = null;
        this.STORAGE_KEY = 'streamnote_sessions';
        this.CURRENT_SESSION_KEY = 'streamnote_current_session';
        this.DEFAULT_SETTINGS_KEY = 'streamnote_default_settings';

        // 全局默认设置（新建session时使用）
        this.defaultSettings = {
            defaultLanguage: "Chinese",
            defaultExplanationLanguage: "Chinese"
        };

        // 验证函数：检查是否允许切换到指定 session（由外部代码如 app.js 注册）
        this.canSwitchValidator = null;

        this.loadDefaultSettings();
        this.loadSessions();
        this.setupUI();
    }

    /**
     * 从 localStorage 加载全局默认设置
     */
    loadDefaultSettings() {
        try {
            const saved = localStorage.getItem(this.DEFAULT_SETTINGS_KEY);
            if (saved) {
                this.defaultSettings = JSON.parse(saved);
            }
        } catch (error) {
            console.error('[SessionManager] Load default settings error:', error);
        }
    }

    /**
     * 保存全局默认设置
     */
    saveDefaultSettings() {
        try {
            localStorage.setItem(this.DEFAULT_SETTINGS_KEY, JSON.stringify(this.defaultSettings));
        } catch (error) {
            console.error('[SessionManager] Save default settings error:', error);
        }
    }

    /**
     * 获取全局默认设置
     */
    getDefaultSettings() {
        return { ...this.defaultSettings };
    }

    /**
     * 更新全局默认设置
     */
    updateDefaultSettings(settings) {
        this.defaultSettings = { ...this.defaultSettings, ...settings };
        this.saveDefaultSettings();
    }

    /**
     * 从 localStorage 加载所有 session
     */
    loadSessions() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.sessions = JSON.parse(saved);

                // 向后兼容：为旧 session 添加默认设置和多语言结构
                Object.keys(this.sessions).forEach(id => {
                    const session = this.sessions[id];

                    // 兼容：将旧的单语言 translations 转为多语言结构
                    if (session.translations && !session.translations.Chinese) {
                        const oldTranslations = { ...session.translations };
                        session.translations = {
                            Chinese: oldTranslations,  // 假定旧数据是中文
                            English: {},
                            Spanish: {},
                            French: {},
                            Japanese: {},
                            Korean: {}
                        };
                    }

                    // 初始化新的数据结构字段（如果缺失）
                    if (!session.explanations) session.explanations = [];
                    if (!session.explanationHistory) session.explanationHistory = [];
                    if (!session.keywordCache) session.keywordCache = {};
                    if (!session.highlightCache) session.highlightCache = {};
                    if (!session.explanationCache) session.explanationCache = {};
                    if (!session.summaryCache) session.summaryCache = {};
                    if (!session.highlightPositions) session.highlightPositions = {};

                    // 向后兼容：添加 startTime 字段（如果缺失），初始化为 createdAt 的值（创建时间而非修改时间）
                    if (!session.startTime) {
                        session.startTime = session.createdAt || session.lastModified || Date.now();
                    }

                    // 向后兼容：添加 lastAccessed 字段（如果缺失），初始化为 lastModified 的值
                    if (!session.lastAccessed) {
                        session.lastAccessed = session.lastModified || Date.now();
                    }

                    // 删除旧的冗余字段
                    delete session.translatedKeywords;

                    if (!session.settings) {
                        session.settings = {
                            translationEnabled: true,
                            translationLayout: "split-bottom",
                            language: "Chinese",
                            explanationLanguage: "Chinese"
                        };
                    } else {
                        // 迁移旧设置格式
                        if (session.settings.targetLanguage && !session.settings.language) {
                            session.settings.language = session.settings.targetLanguage;
                        }
                        delete session.settings.targetLanguage;

                        // 迁移 layout 到 translationLayout
                        if (session.settings.layout && !session.settings.translationLayout) {
                            session.settings.translationLayout = session.settings.layout;
                        }
                        delete session.settings.layout;

                        // 保证 translationEnabled 存在，并与 translationLayout 保持一致
                        if (session.settings.translationEnabled === undefined) {
                            session.settings.translationEnabled = session.settings.translationLayout !== 'full-transcript';
                        }

                        // 初始化 explanationLanguage（如果缺失）
                        if (!session.settings.explanationLanguage) {
                            session.settings.explanationLanguage = session.settings.language || "Chinese";
                        }

                        delete session.settings.keywordEnabled;
                        delete session.settings.keywordExplanationLanguage;
                        delete session.settings.explanationCache;
                        delete session.settings.queryHistory;
                        delete session.settings.summaryCache;
                    }
                });
            }

            const currentId = localStorage.getItem(this.CURRENT_SESSION_KEY);
            if (currentId && this.sessions[currentId]) {
                this.currentSessionId = currentId;
            } else {
                // 创建默认 session，使用当前时间作为名称
                this.createNewSession();
            }
        } catch (error) {
            console.error('[SessionManager] Load error:', error);
            this.createNewSession();
        }
    }

    /**
     * 保存所有 session 到 localStorage
     */
    saveSessions() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions));
            localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
        } catch (error) {
            console.error('[SessionManager] Save error:', error);
        }
    }

    /**
     * 创建新 session
     */
    createNewSession(name = null) {
        const id = Date.now().toString();

        // Generate default name using ISO 8601 format (YYYY-MM-DD HH:MM:SS)
        let defaultName = name;
        if (!defaultName) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            defaultName = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // 使用全局默认设置
        const defaultSettings = this.getDefaultSettings();

        // 获取当前全局布局设置（从 localStorage）
        const translationEnabled = localStorage.getItem('translationEnabled') !== null
            ? JSON.parse(localStorage.getItem('translationEnabled'))
            : true;
        const translationLayout = localStorage.getItem('translationLayout') || 'split-bottom';

        this.sessions[id] = {
            id: id,
            name: defaultName,

            // 核心内容
            transcripts: {},

            // 内容元数据（记录当前内容的来源）
            contentMetadata: {
                source: 'transcript',  // 'transcript' 或 'text'
                sourceFile: null,      // text 模式时的文件名
                uploadTime: null,      // 上传/更新时间
                paragraphCount: 0      // 段落数
            },

            translations: {
                Chinese: {},
                English: {},
                Spanish: {},
                French: {},
                Japanese: {},
                Korean: {}
            },

            // 词列表（三种）
            keywords: [],       // 自动提取的关键词
            highlights: [],     // 手动标记的关键词
            explanations: [],   // 在解释面板查询过的词（旧格式，仅字词列表）
            explanationHistory: [], // 解释查询历史（新格式，包含完整信息）

            // 高亮位置信息（用于精确提取上下文）
            highlightPositions: {}, // { "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }

            // 解释缓存（与词列表对应）
            keywordCache: {},      // { "keyword|language": "explanation", ... }
            highlightCache: {},    // { "keyword|language": "explanation", ... }
            explanationCache: {},  // { "keyword|language": "explanation", ... }

            // 总结缓存
            summaryCache: {},      // { language: "summary", ... }

            // 配置设置（使用全局默认设置和当前全局布局）
            settings: {
                language: defaultSettings.defaultLanguage,
                explanationLanguage: defaultSettings.defaultExplanationLanguage
            },

            createdAt: Date.now(),
            startTime: Date.now(),  // 时间戳计算的基准时间（使用创建时间，而非修改时间）
            lastModified: Date.now(),
            lastAccessed: Date.now()
        };

        this.saveSessions();
        this.switchSession(id);
        return id;
    }

    /**
     * 获取当前 session
     */
    getCurrentSession() {
        return this.sessions[this.currentSessionId];
    }

    /**
     * 获取指定 ID 的 session
     */
    getSession(sessionId) {
        return this.sessions[sessionId] || null;
    }

    /**
     * 切换到指定 session
     */
    switchSession(sessionId) {
        if (!this.sessions[sessionId]) {
            console.error('[SessionManager] Session not found:', sessionId);
            return false;
        }

        this.currentSessionId = sessionId;
        this.saveSessions();
        this.renderSessionList();

        // 更新 header 中的 session 名称和信息
        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = this.sessions[sessionId].name;
        }

        // 触发自定义事件通知 StreamNote
        window.dispatchEvent(new CustomEvent('sessionChanged', {
            detail: { sessionId: sessionId }
        }));

        return true;
    }

    /**
     * 更新指定 session 的转录内容
     */
    updateCurrentTranscripts(transcripts) {
        const session = this.getCurrentSession();
        if (session) {
            session.transcripts = { ...transcripts };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新指定 sessionId 的转录内容（用于处理切换 session 期间的转录）
     */
    updateTranscriptsForSession(sessionId, transcripts) {
        // 检查该 session 是否还存在
        if (!this.sessions[sessionId]) {
            return false;
        }

        // 合并新的转录内容
        const session = this.sessions[sessionId];
        session.transcripts = { ...session.transcripts, ...transcripts };
        session.lastModified = Date.now();
        this.saveSessions();
        return true;
    }

    /**
     * 更新指定 sessionId 的关键词
     */
    updateKeywordsForSession(sessionId, keywords) {
        if (!this.sessions[sessionId]) {
            return false;
        }

        const session = this.sessions[sessionId];
        session.keywords = [...keywords];
        session.lastModified = Date.now();
        this.saveSessions();
        return true;
    }

    /**
     * 更新当前 session 的关键词
     */
    updateCurrentKeywords(keywords) {
        const session = this.getCurrentSession();
        if (session) {
            session.keywords = [...keywords];
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的高亮
     */
    updateCurrentHighlights(highlights) {
        const session = this.getCurrentSession();
        if (session) {
            session.highlights = [...highlights];
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的高亮位置信息
     */
    updateHighlightPositions(positions) {
        const session = this.getCurrentSession();
        if (session) {
            // 初始化highlightPositions对象（如果不存在）
            if (!session.highlightPositions) {
                session.highlightPositions = {};
            }
            session.highlightPositions = { ...positions };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的翻译内容（指定语言）
     */
    updateCurrentTranslations(translations, language) {
        const session = this.getCurrentSession();
        if (session) {
            if (!session.translations[language]) {
                session.translations[language] = {};
            }
            session.translations[language] = { ...session.translations[language], ...translations };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的解释列表
     */
    updateCurrentExplanations(explanations) {
        const session = this.getCurrentSession();
        if (session) {
            session.explanations = [...explanations];
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的解释历史（新格式，包含完整信息）
     */
    updateCurrentExplanationHistory(explanationHistory) {
        const session = this.getCurrentSession();
        if (session) {
            session.explanationHistory = [...explanationHistory];
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的关键词解释缓存
     */
    updateCurrentKeywordCache(cache) {
        const session = this.getCurrentSession();
        if (session) {
            session.keywordCache = { ...session.keywordCache, ...cache };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的高亮解释缓存
     */
    updateCurrentHighlightCache(cache) {
        const session = this.getCurrentSession();
        if (session) {
            session.highlightCache = { ...session.highlightCache, ...cache };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的解释面板查询词缓存
     */
    updateCurrentExplanationCache(cache) {
        const session = this.getCurrentSession();
        if (session) {
            session.explanationCache = { ...session.explanationCache, ...cache };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的总结缓存
     */
    updateCurrentSummaryCache(cache) {
        const session = this.getCurrentSession();
        if (session) {
            session.summaryCache = { ...session.summaryCache, ...cache };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 更新当前 session 的设置
     */
    updateCurrentSettings(settings) {
        const session = this.getCurrentSession();
        if (session) {
            session.settings = { ...session.settings, ...settings };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    /**
     * 重命名当前 session
     */
    renameCurrentSession(newName) {
        const session = this.getCurrentSession();
        if (session && newName.trim()) {
            session.name = newName.trim();
            session.lastModified = Date.now();
            this.saveSessions();
            this.renderSessionList();

            // 更新 header 中的 session 名称显示
            const sessionNameDisplay = document.getElementById('sessionNameDisplay');
            if (sessionNameDisplay) {
                sessionNameDisplay.textContent = session.name;
            }

            return true;
        }
    }

    /**
     * 导出当前 session 为 JSON 文件
     */
    exportCurrentSession() {
        const session = this.getCurrentSession();
        if (!session) return;

        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            session: session
        };

        this.downloadJSON(data, `StreamNote_${session.name}_${this.formatDate()}.json`);
    }

    /**
     * 导出所有 sessions 为 JSON 文件
     */
    exportAllSessions() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            sessions: this.sessions
        };

        this.downloadJSON(data, `StreamNote_All_Sessions_${this.formatDate()}.json`);
    }

    /**
     * 导入 sessions 数据
     */
    importSessions(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.session) {
                    // Import single session
                    const newId = Date.now().toString();
                    const imported = { ...data.session, id: newId };
                    this.sessions[newId] = imported;
                    this.switchSession(newId);
                    alert(`Successfully imported session: ${imported.name}`);
                } else if (data.sessions) {
                    // Import multiple sessions
                    const confirmMsg = `Import ${Object.keys(data.sessions).length} sessions?\nThis will merge with existing data.`;
                    if (confirm(confirmMsg)) {
                        Object.values(data.sessions).forEach(session => {
                            const newId = Date.now().toString() + Math.random();
                            this.sessions[newId] = { ...session, id: newId };
                        });
                        this.saveSessions();
                        this.renderSessionList();
                        alert('Import successful!');
                    }
                }
            } catch (error) {
                console.error('[SessionManager] Import error:', error);
                alert('Import failed: Invalid file format');
            }
        };
        reader.readAsText(file);
    }

    /**
     * 清空所有 session 数据
     */
    clearAllSessions() {
        const confirmMsg = '⚠️ Clear all session data?\nThis action cannot be undone!';
        if (confirm(confirmMsg)) {
            const doubleConfirm = 'Final confirmation: Really delete all data?';
            if (confirm(doubleConfirm)) {
                this.sessions = {};
                localStorage.removeItem(this.STORAGE_KEY);
                localStorage.removeItem(this.CURRENT_SESSION_KEY);
                this.createNewSession('Default Session');
                alert('All data cleared');
            }
        }
    }

    /**
     * 下载 JSON 数据
     */
    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 格式化日期用于文件名
     */
    formatDate() {
        const now = new Date();
        return now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    }

    /**
     * 删除指定 session
     */
    deleteSession(sessionId) {
        if (!this.sessions[sessionId]) return;
        delete this.sessions[sessionId];

        // 如果删除的是当前 session，切换到其他 session
        if (this.currentSessionId === sessionId) {
            const sessionIds = Object.keys(this.sessions);
            if (sessionIds.length > 0) {
                // 定位到最新的 session（最后一个）
                this.switchSession(sessionIds[sessionIds.length - 1]);
            } else {
                // 没有 session 了，创建新的
                this.createNewSession("Default Session");
            }
        }
    }

    /**
     * 设置 UI 事件监听
     */
    setupUI() {
        // 新建 session 按钮
        const newSessionBtn = document.getElementById('newSessionBtn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => {
                this.createNewSession();
            });
        }

        // Session modal 打开按钮
        const openBtn = document.getElementById('openSessionPanel');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (window.streamNoteInstance) {
                    window.streamNoteInstance.toggleModal('sessionModal');
                }
            });
        }

        // Session modal 关闭按钮（如果需要在 sessionManager 中处理）
        const toggleBtn = document.getElementById('closeSessionModal');
        if (toggleBtn) {
            // 这个按钮的事件处理已经在 streamNote 中添加了
        }

        // Session 名称编辑模式切换
        const editBtn = document.getElementById('editSessionNameBtn');
        const confirmBtn = document.getElementById('confirmSessionNameBtn');
        const cancelBtn = document.getElementById('cancelSessionNameBtn');
        const nameInput = document.getElementById('sessionNameInput');
        const displayMode = document.getElementById('sessionNameDisplay');
        const editMode = document.getElementById('sessionNameEdit');

        // 进入编辑模式
        editBtn?.addEventListener('click', () => {
            const session = this.getCurrentSession();
            if (session) {
                nameInput.value = session.name;
                displayMode.style.display = 'none';
                editMode.style.display = 'flex';
                nameInput.focus();
                nameInput.select();
            }
        });

        // 确认编辑
        confirmBtn?.addEventListener('click', () => {
            const newName = nameInput.value.trim();
            if (newName) {
                this.renameCurrentSession(newName);
            }
            displayMode.style.display = 'flex';
            editMode.style.display = 'none';
        });

        // 取消编辑
        cancelBtn?.addEventListener('click', () => {
            displayMode.style.display = 'flex';
            editMode.style.display = 'none';
        });

        // 按 Enter 确认，按 Escape 取消
        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });

        // 导出当前 session
        document.getElementById('exportCurrentBtn')?.addEventListener('click', () => {
            this.exportCurrentSession();
        });

        // 导出所有 sessions
        document.getElementById('exportAllBtn')?.addEventListener('click', () => {
            this.exportAllSessions();
        });

        // 导入
        const importBtn = document.getElementById('importBtn');
        const importInput = document.getElementById('importFileInput');

        importBtn?.addEventListener('click', () => {
            importInput.click();
        });

        importInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importSessions(file);
                e.target.value = ''; // 重置以便可以重复导入同一文件
            }
        });

        // 清空所有数据
        document.getElementById('clearAllBtn')?.addEventListener('click', () => {
            this.clearAllSessions();
        });

        // 重命名session
        document.getElementById('renameSessionBtn')?.addEventListener('click', () => {
            this.enterRenameMode();
        });

        // 删除session
        document.getElementById('deleteSessionBtn')?.addEventListener('click', () => {
            this.deleteCurrentSession();
        });

        // 菜单按钮切换
        const menuBtn = document.getElementById('sessionMenuBtn');
        const menu = document.getElementById('sessionMenu');
        if (menuBtn && menu) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (menu.style.display === 'none') {
                    // 显示菜单
                    const rect = menuBtn.getBoundingClientRect();
                    menu.style.top = (rect.bottom + 5) + 'px';
                    menu.style.left = (rect.right - 160) + 'px'; // 菜单由右对齐
                    menu.style.display = 'block';
                } else {
                    menu.style.display = 'none';
                }
            });

            // 点击菜单项后关闭菜单
            menu.querySelectorAll('.session-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    menu.style.display = 'none';
                });
            });

            // 点击别的地方关闭菜单
            document.addEventListener('click', (e) => {
                if (!menuBtn.contains(e.target) && !menu.contains(e.target)) {
                    menu.style.display = 'none';
                }
            });
        }

        this.renderSessionList();
    }

    /**
     * 格式化日期为相对时间或日期字符串
     */
    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        // 超过7天显示日期
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /**
     * 格式化完整日期（ISO 8601 格式）
     */
    formatFullDate(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 渲染 session 列表
     */
    renderSessionList() {
        const listContainer = document.getElementById('sessionList');
        if (!listContainer) return;

        const sessionIds = Object.keys(this.sessions).sort((a, b) => {
            // 按创建时间排序（最新创建的在前）
            return this.sessions[b].createdAt - this.sessions[a].createdAt;
        });

        if (sessionIds.length === 0) {
            listContainer.innerHTML = '<p class="empty-message">No sessions</p>';
            return;
        }

        listContainer.innerHTML = sessionIds.map(id => {
            const session = this.sessions[id];
            const isActive = id === this.currentSessionId;

            // 计算统计信息
            const itemCount = Object.keys(session.transcripts || {}).length || 0;
            const createdDate = this.formatFullDate(session.createdAt);
            const lastModified = this.formatRelativeTime(session.lastModified || session.createdAt);

            return `
                <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${id}">
                    <div class="session-main">
                        <div class="session-name">${session.name}</div>
                        <div class="session-brief">
                            <span class="brief-item">${createdDate}</span>
                            <span class="brief-item">${itemCount} items</span>
                        </div>
                    </div>
                    <div class="session-time">${lastModified}</div>
                </div>
            `;
        }).join('');

        // 绑定点击事件
        listContainer.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const sessionId = item.dataset.sessionId;
                this.switchSession(sessionId);
            });
        });
    }

    /**
     * 进入重命名模式 - 在当前session项上进行inline编辑
     */
    enterRenameMode() {
        const currentSessionId = this.currentSessionId;
        if (!currentSessionId) {
            alert('No session selected');
            return;
        }

        const session = this.sessions[currentSessionId];
        const sessionItem = document.querySelector(`[data-session-id="${currentSessionId}"]`);
        if (!sessionItem) return;

        const sessionNameDiv = sessionItem.querySelector('.session-name');
        const currentName = session.name;

        // 创建编辑输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'session-name-input-inline';
        input.value = currentName;
        input.style.flex = '1';
        input.style.padding = '4px 8px';
        input.style.border = '1px solid var(--color-primary)';
        input.style.borderRadius = '4px';
        input.style.fontSize = '1em';
        input.style.fontWeight = '600';

        // 替换原来的名称div
        sessionNameDiv.replaceWith(input);

        // 保存函数
        const saveRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                this.renameCurrentSession(newName);
            }
            this.renderSessionList();
        };

        // 取消编辑函数
        const cancelEdit = () => {
            this.renderSessionList();
        };

        // Enter键保存
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        // 失焦自动保存
        input.addEventListener('blur', () => {
            saveRename();
        });

        // 自动获焦并全选
        input.focus();
        input.select();
    }

    /**
     * 删除当前选中的session
     */
    deleteCurrentSession() {
        const currentSessionId = this.currentSessionId;
        if (!currentSessionId) {
            alert('No session selected');
            return;
        }

        const session = this.sessions[currentSessionId];
        if (confirm(`Delete session "${session.name}"?`)) {
            this.deleteSession(currentSessionId);
        }
    }
}
