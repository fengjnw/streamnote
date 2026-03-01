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

        this.loadSessions();
        this.setupUI();
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

                    // 兼容：将旧的单语言 translatedKeywords 转为多语言结构
                    if (Array.isArray(session.translatedKeywords)) {
                        const oldKeywords = [...session.translatedKeywords];
                        session.translatedKeywords = {
                            Chinese: oldKeywords,  // 假定旧数据是中文
                            English: [],
                            Spanish: [],
                            French: [],
                            Japanese: [],
                            Korean: []
                        };
                    }

                    if (!session.settings) {
                        session.settings = {
                            translationEnabled: true,
                            targetLanguage: "Chinese",
                            keywordEnabled: true
                        };
                    }
                });
            }

            const currentId = localStorage.getItem(this.CURRENT_SESSION_KEY);
            if (currentId && this.sessions[currentId]) {
                this.currentSessionId = currentId;
            } else {
                // 创建默认 session
                this.createNewSession("Default Session");
            }
        } catch (error) {
            console.error('[SessionManager] Load error:', error);
            this.createNewSession("Default Session");
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

        this.sessions[id] = {
            id: id,
            name: defaultName,
            transcripts: {},
            translations: {  // 改为多语言结构
                Chinese: {},
                English: {},
                Spanish: {},
                French: {},
                Japanese: {},
                Korean: {}
            },
            keywords: [],
            translatedKeywords: {  // 改为多语言结构
                Chinese: [],
                English: [],
                Spanish: [],
                French: [],
                Japanese: [],
                Korean: []
            },
            settings: {
                translationEnabled: true,
                targetLanguage: "Chinese",
                keywordEnabled: true
            },
            createdAt: Date.now(),
            lastModified: Date.now()
        };

        this.saveSessions();
        this.switchSession(id);
        console.log(`[SessionManager] Created session: ${defaultName}`);
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
        this.updateSessionNameInput();

        // 更新 header 中的 session 名称和信息
        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = this.sessions[sessionId].name;
        }

        // 触发自定义事件通知 StreamNote
        window.dispatchEvent(new CustomEvent('sessionChanged', {
            detail: { sessionId: sessionId }
        }));

        console.log(`[SessionManager] Switched to: ${this.sessions[sessionId].name}`);
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
            console.warn(`[SessionManager] Session ${sessionId} not found, discarding results`);
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
     * 更新当前 session 的译文关键词（指定语言）
     */
    updateCurrentTranslatedKeywords(translatedKeywords, language) {
        const session = this.getCurrentSession();
        if (session) {
            if (!session.translatedKeywords[language]) {
                session.translatedKeywords[language] = [];
            }
            session.translatedKeywords[language] = [...translatedKeywords];
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

            console.log(`[SessionManager] Renamed to: ${newName}`);
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
        console.log('[SessionManager] Exported current session');
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
        console.log('[SessionManager] Exported all sessions');
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
                console.log('[SessionManager] All sessions cleared');
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

        const sessionName = this.sessions[sessionId].name;
        delete this.sessions[sessionId];

        // 如果删除的是当前 session，切换到其他 session
        if (this.currentSessionId === sessionId) {
            const sessionIds = Object.keys(this.sessions);
            if (sessionIds.length > 0) {
                this.switchSession(sessionIds[0]);
            } else {
                // 没有 session 了，创建新的
                this.createNewSession("Default Session");
            }
        } else {
            this.saveSessions();
            this.renderSessionList();
        }

        console.log(`[SessionManager] Deleted session: ${sessionName}`);
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

        // Toggle session 面板
        const toggleBtn = document.getElementById('toggleSessionPanel');
        const openBtn = document.getElementById('openSessionPanel');
        const sessionPanel = document.querySelector('.session-panel');

        const togglePanel = () => {
            sessionPanel.classList.toggle('expanded');

            // Update button active state
            const isExpanded = sessionPanel.classList.contains('expanded');
            if (isExpanded) {
                openBtn.classList.add('active');
            } else {
                openBtn.classList.remove('active');
            }

            // Set flag to prevent resize-induced scroll from affecting auto-scroll/content
            if (window.streamNoteInstance) {
                window.streamNoteInstance.isSyncingScroll = true;
                setTimeout(() => {
                    window.streamNoteInstance.isSyncingScroll = false;
                }, 350); // Match the 0.3s transition + buffer
            }
        };

        if (toggleBtn && sessionPanel) {
            toggleBtn.addEventListener('click', togglePanel);
        }

        if (openBtn && sessionPanel) {
            openBtn.addEventListener('click', togglePanel);
        }

        // 初始化按钮状态
        if (sessionPanel && sessionPanel.classList.contains('expanded') && openBtn) {
            openBtn.classList.add('active');
        }

        // Session 名称输入框
        const nameInput = document.getElementById('sessionNameInput');
        if (nameInput) {
            // 实时保存（防抖）
            let timeout;
            nameInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.renameCurrentSession(e.target.value);
                }, 500);
            });
        }

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

        this.renderSessionList();
        this.updateSessionNameInput();
    }

    /**
     * 渲染 session 列表
     */
    renderSessionList() {
        const listContainer = document.getElementById('sessionList');
        if (!listContainer) return;

        const sessionIds = Object.keys(this.sessions).sort((a, b) => {
            return this.sessions[b].lastModified - this.sessions[a].lastModified;
        });

        if (sessionIds.length === 0) {
            listContainer.innerHTML = '<p class="empty-message">No sessions</p>';
            return;
        }

        listContainer.innerHTML = sessionIds.map(id => {
            const session = this.sessions[id];
            const isActive = id === this.currentSessionId;

            return `
                <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${id}">
                    <div class="session-info">
                        <div class="session-name">${session.name}</div>
                    </div>
                    <button class="delete-session-btn" data-session-id="${id}" title="Delete">×</button>
                </div>
            `;
        }).join('');

        // 绑定点击事件
        listContainer.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-session-btn')) return;
                const sessionId = item.dataset.sessionId;
                this.switchSession(sessionId);
            });
        });

        // 绑定删除按钮
        listContainer.querySelectorAll('.delete-session-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.sessionId;
                const session = this.sessions[sessionId];

                if (confirm(`Delete session "${session.name}"?`)) {
                    this.deleteSession(sessionId);
                }
            });
        });
    }

    /**
     * 更新 session 名称输入框
     */
    updateSessionNameInput() {
        const nameInput = document.getElementById('sessionNameInput');
        const session = this.getCurrentSession();
        if (nameInput && session) {
            nameInput.value = session.name;
        }
    }
}
