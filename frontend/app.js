class StreamNote {
    constructor() {
        // Session 管理器
        this.sessionManager = null;

        // 关键词管理器
        this.keywordManager = null;
        this.currentTranscriptText = "";

        // 高亮ID映射
        this.highlightIdMap = {};

        // 翻译管理器
        this.translationManager = null;
        this.translationEnabled = true;

        // 设置面板
        this.settingsPanel = null;

        // 高亮管理器
        this.highlightManager = null;

        // 语言设置（分别用于翻译和解释）
        this.language = "Chinese";
        this.explanationLanguage = "Chinese";

        // 总结缓存
        this.summaryCache = {};

        // 全局转录状态（跨 session）
        this.recordingSessionId = null;  // 记录当前正在转录的 session
        this.displaySessionId = null;    // 当前显示的 session（用户看到的）

        // 文本选中菜单
        this.selectedText = "";
        this.selectedTextElement = null;

        // 用户选择状态管理
        this.hasActiveSelection = false;
        this.pendingUpdates = false;

        // 模态窗口状态
        this.openModals = new Set();  // 跟踪打开的模态窗口

        // 状态消息超时ID
        this.statusMessageTimeout = null;

        // === 初始化管理器 ===
        this.initSessionManager();
        this.initRecordingManager();
        this.initPanelManager();
        this.initTranslationManager();
        this.initSettingsPanel();
        this.initKeywordManager();
        this.initHighlightManager();
        this.setupUIListeners();
        this.initVisibilityHandlers();

        // 初始化录制按钮状态
        this.updateRecordingButtonState();

        // 在读取 session 前，先加载全局面板状态（作为默认值）
        this.panelManager.loadPanelState();

        // 加载 session 时会覆盖全局设置为 session 特定设置
        this.loadCurrentSession();

        // 延迟设置同步滚动，确保元素已加载
        setTimeout(() => {
            this.panelManager.setupSyncScroll();
            this.initializeVisibility();
            // 设置容器为 auto 滚动行为（而不是 smooth）
            const transcript = document.getElementById("transcript");
            const translation = document.getElementById("translation");
            if (transcript) {
                transcript.style.scrollBehavior = 'auto';
            }
            if (translation) {
                translation.style.scrollBehavior = 'auto';
            }
        }, 100);
    }

    /**
     * 初始化录音管理器
     */
    initRecordingManager() {
        this.recordingManager = new RecordingManager({
            transcribeApiUrl: "/api/transcribe",
            onTranscribeProgress: (data) => this.onTranscribeProgress(data),
            onStatusUpdate: (status) => this.updateStatus(status),
            onRecordingStateChange: (isRecording) => {
                this.updateRecordingIndicator();
                // 停止录音时刷新UI，移除转录状态占位符
                if (!isRecording) {
                    this.updateDisplay();
                }
            }
        });
        // 为新session设置初始的sessionStartTime
        this.recordingManager.setSessionStartTime(Date.now());
    }

    /**
     * 初始化面板管理器
     */
    initPanelManager() {
        this.panelManager = new PanelManager({
            onLayoutChange: (layout) => {
                const wasTranslationDisabled = !this.translationEnabled;
                this.translationEnabled = layout.translationEnabled;
                if (this.translationManager) {
                    this.translationManager.setEnabled(this.translationEnabled);
                    // 如果翻译从禁用改为启用，翻译缺失的内容
                    if (wasTranslationDisabled && this.translationEnabled) {
                        this.translationManager.translateMissingContent();
                    }
                }
                this.saveSettingsToSession();
                // 布局改变打全局，影响所有 session（由 panelManager.savePanelState() 处理）
                this.updateDisplay();
            },
            onStatusUpdate: (status) => this.updateStatus(status)
        });
    }

    /**
     * 初始化翻译管理器
     */
    initTranslationManager() {
        this.translationManager = new TranslationManager({
            translateApiUrl: "/api/translate",
            onTranslationProgress: (data) => {
                // 翻译进度更新
            },
            onStatusUpdate: (status) => this.updateStatus(status),
            onDisplayUpdate: () => this.updateDisplay(),
            getSessionData: () => this.sessionManager.getCurrentSession(),
            getPreciseResults: () => this.recordingManager.getTranscriptData(),
            saveToSession: (sessionId) => this.saveToSession(sessionId)
        });
        // 设置初始语言
        this.translationManager.setLanguage(this.language);
        this.translationManager.setEnabled(this.translationEnabled);
    }

    /**
     * 初始化设置面板
     */
    initSettingsPanel() {
        this.settingsPanel = new SettingsPanel({
            sessionManager: this.sessionManager,
            onStatusUpdate: (status) => this.showStatusMessage(status, 2000),
            onLanguageChange: (language) => {
                this.language = language;
            }
        });
    }

    /**
     * 初始化高亮管理器
     */
    initHighlightManager() {
        this.highlightManager = new HighlightManager({
            keywordManager: this.keywordManager,
            translationManager: this.translationManager,
            recordingManager: this.recordingManager,
            sessionManager: this.sessionManager,
            onStatusMessage: (message, duration) => this.showStatusMessage(message, duration),
            getTranscriptData: () => this.recordingManager.getTranscriptData(),
            highlightIdMap: this.highlightIdMap
        });

        // 将 highlightManager 引用传递给 keywordManager
        if (this.keywordManager) {
            this.keywordManager.highlightManager = this.highlightManager;
        }
    }

    /**
     * 获取当前转录数据（快捷方法）
     */
    get preciseResults() {
        return this.recordingManager.getTranscriptData();
    }

    /**
     * 转录进度回调
     */
    onTranscribeProgress(data) {
        const { index, text, timestamp, sessionId } = data;

        // 如果sessionId是录制中的session，则更新本地显示（只在当前显示该session时）
        const isCurrentSession = sessionId === this.sessionManager.currentSessionId;

        if (isCurrentSession) {
            // 数据已经由 recordingManager.submitForTranscription 保存
            // 直接更新显示（不要修改副本，避免数据不一致）
            this.updateDisplay();

            // 自动翻译 - 使用转录的上下文来改进翻译
            if (this.translationEnabled) {
                const translationContext = this.recordingManager.getTranscriptionContext();
                this.translationManager.translateText(text, index, sessionId, translationContext);
            }

            // 更新转录上下文 - 新转录的内容会被加入上下文
            this.updateTranscriptionContext();
        }

        // 无论是否当前显示该session，都要保存到正确的session
        // sessionId是录制开始时的session，转录内容应该持久化到那个session
        this.saveToSession(sessionId);
    }

    /**
     * 更新转录上下文 - 自动从现有转录内容生成
     * 用于提高Whisper的转录准确率
     */
    updateTranscriptionContext() {
        const transcriptData = this.recordingManager.getTranscriptData();
        const indices = Object.keys(transcriptData).map(Number).sort((a, b) => a - b);

        // 获取最近的转录内容作为上下文（最多保留最后5句）
        const recentTranscripts = indices.slice(-5).map(idx => {
            const item = transcriptData[idx];
            // 安全地获取文本，处理可能不存在的数据
            return (item && item.text) ? item.text : '';
        }).filter(text => text && text.length > 0);

        // 组合成上下文字符串
        const context = recentTranscripts.join(' ');

        // 设置上下文，限制长度防止超过API限制
        const maxContextLength = 200;
        const contextToUse = context.length > maxContextLength
            ? context.substring(context.length - maxContextLength)
            : context;

        this.recordingManager.setTranscriptionContext(contextToUse);
    }

    /**
     * 初始化显示/隐藏状态
     */
    initializeVisibility() {
        // 应用高亮重新渲染
        this.highlightManager.reapplyAllHighlights();
    }

    /**
     * 初始化 Session 管理器
     */
    initSessionManager() {
        this.sessionManager = new SessionManager();

        // 监听 session 切换事件
        window.addEventListener('sessionChanged', (e) => {
            this.loadCurrentSession();
        });
    }

    /**
     * 加载当前 session 的数据
     */
    loadCurrentSession() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 设置当前显示的 session
        this.displaySessionId = this.sessionManager.currentSessionId;

        // 更新 header 中的 session 信息
        this.updateSessionInfo();

        // 不再自动停止转录，保持全局转录状态
        if (this.recordingSessionId !== null && this.recordingSessionId !== this.sessionManager.currentSessionId) {
            const recordingSession = this.sessionManager.getSession(this.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            this.showStatusMessage(`Recording in "${recordingSessionName}" will continue in background`, 3000);
        }

        // 更新录制指示器UI
        this.updateRecordingIndicator();

        // 更新录制按钮状态
        this.updateRecordingButtonState();

        // 重置转录状态（切换 session 意味着当前的转录已停止）
        this.recordingManager.isTranscribing = false;

        // 恢复功能设置，如果没有的话使用全局默认设置
        const defaultSettings = this.sessionManager.getDefaultSettings();

        // 加载翻译语言
        if (session.settings && session.settings.language) {
            this.language = session.settings.language;
        } else {
            this.language = defaultSettings.defaultLanguage || "Chinese";
        }

        // 加载解释语言
        if (session.settings && session.settings.explanationLanguage) {
            this.explanationLanguage = session.settings.explanationLanguage;
        } else {
            this.explanationLanguage = defaultSettings.defaultExplanationLanguage || "Chinese";
        }

        // 更新翻译语言选择器
        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.value = this.language;
        }

        // 更新总结语言选择器
        const summaryLanguageSelector = document.getElementById("summary-language");
        if (summaryLanguageSelector) {
            summaryLanguageSelector.value = this.explanationLanguage;
        }

        // 更新关键词解释语言选择器
        const keywordExplanationLangSelector = document.getElementById("keyword-explanation-language");
        if (keywordExplanationLangSelector) {
            keywordExplanationLangSelector.value = this.explanationLanguage;
        }

        // 加载转录内容到 RecordingManager，并设置session开始时间用于时间戳计算
        this.recordingManager.setTranscriptData(session.transcripts || {});
        this.recordingManager.setSessionStartTime(session.startTime);
        this.panelManager.setTranscriptData(session.transcripts || {});

        // 更新转录上下文 - 从之前的转录内容生成
        this.updateTranscriptionContext();

        // 加载当前语言的翻译内容到 TranslationManager，并同步session开始时间
        const translationsForLanguage = (session.translations && session.translations[this.language])
            ? { ...session.translations[this.language] }
            : {};
        this.translationManager.setLanguage(this.language);
        this.translationManager.setTranslationData(translationsForLanguage);
        this.translationResults = translationsForLanguage; // 保留兼容性

        // 同步session开始时间到translationManager（用于时间戳显示）
        if (this.translationManager && session.startTime) {
            this.translationManager.sessionStartTime = session.startTime;
        }

        // 加载缓存数据
        this.summaryCache = session.summaryCache ? { ...session.summaryCache } : {};

        // 恢复高亮ID映射（如果存在）
        if (session.highlightIdMap) {
            this.highlightIdMap = { ...session.highlightIdMap };
            if (this.highlightManager) {
                this.highlightManager.setHighlightIdMap(this.highlightIdMap);
            }
        }
        // 清空解释面板显示（在恢复 keywordManager 数据前清空，避免显示前一个 session 的解释）
        const explanationContent = document.getElementById("explanation-content");
        const currentExplanationWord = document.getElementById("current-explanation-word");
        const wordContext = document.getElementById("word-context");
        const explanationHeader = document.querySelector(".explanation-header");

        if (explanationContent) {
            explanationContent.innerHTML = '<p class="placeholder">Select a word to view its explanation</p>';
        }
        if (currentExplanationWord) {
            currentExplanationWord.textContent = "";
        }
        if (wordContext) {
            wordContext.style.display = 'none';
        }
        if (explanationHeader) {
            explanationHeader.classList.add("hidden");
        }

        if (this.keywordManager) {
            this.keywordManager.reset();

            // 恢复自动提取的关键词（去重，防止列表中有重复词）
            if (session.keywords && session.keywords.length > 0) {
                this.keywordManager.extracts = [...new Set(session.keywords)];
            }

            // 恢复用户高亮的关键词（去重，防止列表中有重复词）
            if (session.highlights && session.highlights.length > 0) {
                this.keywordManager.highlights = [...new Set(session.highlights)];
            } else {
                this.keywordManager.highlights = [];
            }

            // 恢复高亮位置信息（用于精确提取上下文）
            if (session.highlightPositions && Object.keys(session.highlightPositions).length > 0) {
                this.keywordManager.setHighlightPositions({ ...session.highlightPositions });
                if (this.highlightManager) {
                    this.highlightManager.highlightPositions = { ...session.highlightPositions };
                }
            }

            // 恢复解释历史
            // 新格式：explanationHistory（包含完整信息）
            // 旧格式兼容：explanations（只有单词列表，不再使用）
            if (session.explanationHistory && session.explanationHistory.length > 0) {
                this.keywordManager.explanationHistory = [...session.explanationHistory];
            } else {
                this.keywordManager.explanationHistory = [];
            }

            // 恢复三个解释缓存
            this.keywordManager.extractsCache = session.keywordCache ? { ...session.keywordCache } : {};
            this.keywordManager.highlightCache = session.highlightCache ? { ...session.highlightCache } : {};
            this.keywordManager.explanationCache = session.explanationCache ? { ...session.explanationCache } : {};

            // 为所有高亮词生成highlightId（如果还没有）
            if (this.highlightIdMap === undefined) {
                this.highlightIdMap = {};
            }
            this.keywordManager.highlights.forEach(text => {
                if (!this.highlightIdMap[text]) {
                    this.highlightIdMap[text] = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
                }
            });

            // 更新显示
            this.keywordManager.displayExplanations();

            // 切换 session 时，自动恢复最后查询过的解释（按当前语言查找）
            if (this.keywordManager.explanationHistory && this.keywordManager.explanationHistory.length > 0) {
                // 优先查找与当前语言匹配的最新记录
                const currentLanguage = this.explanationLanguage || "English";
                const lastRecordForLanguage = this.keywordManager.explanationHistory.find(
                    record => record.language === currentLanguage
                );

                // 如果没有找到当前语言的记录，使用最新记录
                const recordToRestore = lastRecordForLanguage || this.keywordManager.explanationHistory[0];

                setTimeout(() => {
                    this.keywordManager.restoreExplanationHistoryRecord(recordToRestore);
                }, 100);
            }
        }

        // 应用全局布局和翻译状态（而不是session特定的）
        // panelManager 会自动从 localStorage 加载全局设置
        // 所有 session 共享同一个当前布局
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            // 确保应用当前的全局布局
            this.panelManager.setLayout(this.panelManager.currentLayout, true);
        }

        // 清空 Summary 显示
        const summaryDisplay = document.getElementById("summary-display");
        if (summaryDisplay) {
            // 检查当前语言和风格是否有缓存，有就直接显示
            const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");
            const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
            const cacheKey = `${this.explanationLanguage}-${selectedStyle}`;
            if (this.summaryCache && this.summaryCache[cacheKey]) {
                const cachedSummary = this.summaryCache[cacheKey];
                summaryDisplay.innerHTML = this.formatSummaryDisplay(cachedSummary, selectedStyle);
            } else {
                summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Generate to create a summary</p>';
            }
        }

        // 恢复用户保存的自动滚动偏好（已在 panelManager 构造中通过 loadPanelState 加载）
        // 不再硬编码为 true，以保持用户之前的选择
        this.panelManager.updateAutoScrollButton();

        this.updateDisplay();

        // 更新关键词显示（高亮已在updateDisplay内的reapplyAllHighlights中应用）
        if (this.keywordManager) {
            this.keywordManager.updateAllKeywordDisplays();
        }

        // 刷新页面后，如果翻译面板打开且翻译启用，检查是否需要翻译缺失的内容
        if (this.panelManager && this.panelManager.isTranslationEnabled() && this.translationEnabled) {
            // 延迟执行，确保 DOM 已更新
            setTimeout(() => {
                if (this.translationManager) {
                    this.translationManager.translateMissingContent();
                }
            }, 200);
        }

        this.updateStatus(`Loaded: ${session.name}`);
    }

    /**
     * 更新 header 中的 session 信息显示
     */
    updateSessionInfo() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 更新 session 名称
        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = session.name || 'Untitled Session';
        }

        // 更新 session 统计信息
        this.updateSessionStats();
    }

    /**
     * 更新 session 的统计信息（时长、字数、关键词数等）
     */
    updateSessionStats() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 显示最后一条转录的时间 (ISO 8601 format: YYYY-MM-DD HH:MM:SS)
        // lastTextModified 是相对秒数，需要转换为实际时间戳（毫秒）
        let displayTime;
        if (session.lastTextModified !== null && session.lastTextModified !== undefined) {
            const sessionStartTime = session.startTime || Date.now();
            displayTime = sessionStartTime + (session.lastTextModified * 1000);
        } else {
            displayTime = session.startTime || Date.now();
        }

        const dateDisplay = document.getElementById('sessionDateDisplay');
        if (dateDisplay) {
            const date = new Date(displayTime);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            dateDisplay.textContent = dateStr;
        }

        // 计算 items 数量
        let itemCount = 0;
        if (session.transcripts) {
            itemCount = Object.keys(session.transcripts).length;
        }
        const itemCountDisplay = document.getElementById('sessionItemCountDisplay');
        if (itemCountDisplay) {
            itemCountDisplay.textContent = itemCount;
        }

        // 计算关键词数
        let keywordCount = 0;
        if (session.keywords && Array.isArray(session.keywords)) {
            keywordCount = session.keywords.length;
        }
        const keywordCountDisplay = document.getElementById('sessionKeywordCountDisplay');
        if (keywordCountDisplay) {
            keywordCountDisplay.textContent = keywordCount;
        }

        // 显示翻译语言
        if (this.translationEnabled && this.language) {
            const translationStatusDisplay = document.getElementById('translationStatusDisplay');
            const translationLangDisplay = document.getElementById('translationLangDisplay');
            if (translationStatusDisplay) {
                translationStatusDisplay.style.display = 'flex';
            }
            if (translationLangDisplay) {
                const langNames = {
                    'Chinese': '中文',
                    'English': 'English',
                    'Spanish': 'Español',
                    'French': 'Français',
                    'Japanese': '日本語',
                    'Korean': '한국어'
                };
                translationLangDisplay.textContent = langNames[this.language] || this.language;
            }
        } else {
            const translationStatusDisplay = document.getElementById('translationStatusDisplay');
            if (translationStatusDisplay) {
                translationStatusDisplay.style.display = 'none';
            }
        }
    }

    /**
     * 保存当前数据到 session
     */
    saveToSession(targetSessionId = null) {
        if (!this.sessionManager) return;

        // 如果没有指定目标session，则使用当前session
        // 如果正在录制，优先保存到录制中的session
        const sessionId = targetSessionId || this.recordingSessionId || this.sessionManager.currentSessionId;
        const session = this.sessionManager.getSession(sessionId);

        if (!session) {
            console.error(`[ERROR] Session ${sessionId} not found`);
            return;
        }

        // 保存转录内容
        const transcripts = this.recordingManager.getTranscriptData();
        this.sessionManager.updateTranscriptsForSession(sessionId, transcripts);

        // 分别保存词列表和缓存
        if (this.keywordManager) {
            this.sessionManager.updateCurrentKeywords(this.keywordManager.extracts);
            this.sessionManager.updateCurrentHighlights(this.keywordManager.highlights);
            this.sessionManager.updateCurrentExplanationHistory(this.keywordManager.explanationHistory);

            // 保存缓存
            this.sessionManager.updateCurrentKeywordCache(this.keywordManager.extractsCache);
            this.sessionManager.updateCurrentHighlightCache(this.keywordManager.highlightCache);
            this.sessionManager.updateCurrentExplanationCache(this.keywordManager.explanationCache);
        }

        // 保存翻译（按当前语言保存）
        const translationData = this.translationManager.getTranslationData();
        if (translationData && Object.keys(translationData).length > 0) {
            this.sessionManager.updateCurrentTranslations(translationData, this.language);
        }

        // 保存总结缓存
        this.sessionManager.updateCurrentSummaryCache(this.summaryCache);

        // 保存设置
        const settings = {
            translationEnabled: this.translationEnabled,
            language: this.language
        };
        this.sessionManager.updateCurrentSettings(settings);
    }

    /**
     * 单独保存设置到 session（用于UI控件修改时）
     */
    saveSettingsToSession() {
        if (!this.sessionManager) return;

        const settings = {
            language: this.language,
            explanationLanguage: this.explanationLanguage
        };
        this.sessionManager.updateCurrentSettings(settings);

        // 保存总结缓存到session
        if (this.summaryCache && Object.keys(this.summaryCache).length > 0) {
            const session = this.sessionManager.getCurrentSession();
            if (session) {
                session.summaryCache = { ...this.summaryCache };
                this.sessionManager.saveSessions();
            }
        }

        // 保存解释历史到 session
        if (this.keywordManager && this.keywordManager.explanationHistory) {
            this.sessionManager.updateCurrentExplanationHistory(this.keywordManager.explanationHistory);
        }
    }

    /**
     * 保存当前布局和翻译设置到会话
     */
    savePanelState() {
        if (this.currentSession) {
            this.sessionManager.updateCurrentSettings({
                layout: this.panelManager.currentLayout,
                translationEnabled: this.panelManager.translationEnabled,
                translationLayout: this.panelManager.translationLayout
            });
        }
        // 同时保存到 localStorage 
        this.panelManager.savePanelState();
    }

    /**
     * 加载布局和翻译状态（由 panelManager 处理）
     */
    loadPanelState() {
        // 布局加载已由 panelManager 处理
    }

    /**
     * 初始化关键词提取器
     */
    initKeywordManager() {
        this.keywordManager = new KeywordManager({
            apiUrl: "/api/extract-keywords",
            transcriptElement: document.getElementById("transcript"),
            keywordElement: document.getElementById("keywords-display"),
            topK: 5,
            panelManager: this.panelManager,
            recordingManager: this.recordingManager,
            getTranscriptData: () => this.recordingManager.getTranscriptData(),
            translationManager: this.translationManager,
            onStatusMessage: (message, duration) => this.showStatusMessage(message, duration)
        });

        // 使 KeywordManager 全局可访问
        window.keywordManagerInstance = this.keywordManager;
    }

    setupUIListeners() {
        // 工具栏按钮点击时关闭模态窗口（除了打开 modal 的按钮）
        const controlPanel = document.querySelector(".control-panel");
        if (controlPanel) {
            controlPanel.addEventListener("click", (e) => {
                const btn = e.target.classList.contains("control-btn") ? e.target : e.target.closest(".control-btn");
                if (btn) {
                    // 这些按钮会打开模态窗口，不要在这里关闭
                    const modalBtnIds = ['openSessionPanel', 'quickAccessSettings'];
                    if (!modalBtnIds.includes(btn.id)) {
                        // 其他按钮点击时，关闭所有打开的模态
                        this.closeAllModals();
                    }
                }
            });
        }

        document.getElementById("recordBtn").addEventListener("click", () => this.toggleRecording());

        // 布局切换已由 PanelManager 处理

        // 添加翻译语言选择
        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.addEventListener("change", async (e) => {
                this.language = e.target.value;
                this.translationManager.setLanguage(this.language);

                // 语言改变，重新翻译全部
                if (this.translationEnabled) {
                    // 如果正在录制，提示用户
                    if (this.isRecording) {
                    }
                    await this.translationManager.retranslateAll();
                }

                // 保存设置到 session
                this.saveSettingsToSession();
            });
        }

        // 添加解释语言选择
        const keywordExplanationLangSelector = document.getElementById("keyword-explanation-language");
        if (keywordExplanationLangSelector) {
            keywordExplanationLangSelector.addEventListener("change", (e) => {
                this.explanationLanguage = e.target.value;

                // 保存设置到 session
                this.saveSettingsToSession();

                // 同步总结语言选择器的值
                const summaryLanguageSelector = document.getElementById("summary-language");
                if (summaryLanguageSelector) {
                    summaryLanguageSelector.value = this.explanationLanguage;
                }

                // 同步设置面板的默认解释语言选择器
                const defaultExplanationLanguageSelector = document.getElementById("defaultExplanationLanguage");
                if (defaultExplanationLanguageSelector) {
                    defaultExplanationLanguageSelector.value = this.explanationLanguage;
                }

                // 如果keyword manager存在，刷新显示
                if (this.keywordManager) {
                    this.keywordManager.displayExplanations();
                    // 刷新所有已展开的解释（用新语言重新生成）
                    this.keywordManager.refreshExpandedExplanations();
                }

                // 更新 Summary 显示 - 检查是否有该语言的缓存
                const summaryDisplay = document.getElementById("summary-display");
                const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");
                if (summaryDisplay) {
                    const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                    const cacheKey = `${this.explanationLanguage}-${selectedStyle}`;
                    if (this.summaryCache && this.summaryCache[cacheKey]) {
                        const cachedSummary = this.summaryCache[cacheKey];
                        summaryDisplay.innerHTML = this.formatSummaryDisplay(cachedSummary, selectedStyle);
                    } else {
                        summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Generate to create a summary</p>';
                    }
                }
            });
        }


        // 自动提取关键词按钮（在Keywords面板中）
        const autoExtractKeywordsBtn = document.getElementById("autoExtractKeywordsBtn");
        if (autoExtractKeywordsBtn) {
            autoExtractKeywordsBtn.addEventListener("click", async () => {
                if (!this.keywordManager) {
                    this.showStatusMessage("Keyword extractor not initialized", 2000);
                    return;
                }

                if (Object.keys(this.preciseResults).length === 0) {
                    this.showStatusMessage("No transcript available to extract keywords from", 2000);
                    return;
                }

                autoExtractKeywordsBtn.disabled = true;
                const originalTitle = autoExtractKeywordsBtn.title;
                autoExtractKeywordsBtn.title = "Extracting...";

                try {
                    await this.processKeywords(this.recordingSessionId || this.sessionManager.currentSessionId);
                    this.showStatusMessage("Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    this.showStatusMessage("Failed to extract keywords", 2000);
                } finally {
                    autoExtractKeywordsBtn.disabled = false;
                    autoExtractKeywordsBtn.title = originalTitle;
                }
            });
        }

        // 初始化文本选中菜单功能
        this.initTextSelectionMenu();

        // ===== Simplified Side Panel Control =====
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const closeSidePanelBtn = document.getElementById("closeSidePanelBtn");
        const sidePanelTitle = document.getElementById("sidePanelTitle");
        const keywordsContent = document.getElementById("keywordsContent");
        const summaryContent = document.getElementById("summaryContent");
        const highlightsContent = document.getElementById("highlightsContent");
        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessSummary = document.getElementById("quickAccessSummary");
        const quickAccessSettings = document.getElementById("quickAccessSettings");
        const quickAccessHighlights = document.getElementById("quickAccessHighlights");

        // Hide all content
        const hideAllContent = () => {
            keywordsContent.classList.remove("active");
            summaryContent.classList.remove("active");
            highlightsContent.classList.remove("active");
            // Clear active state from all quick access buttons
            quickAccessKeywords.classList.remove("active");
            quickAccessSummary.classList.remove("active");
            quickAccessSettings.classList.remove("active");
            quickAccessHighlights.classList.remove("active");
        };

        // Show specific content
        const showContent = (contentEl, title) => {
            hideAllContent();
            contentEl.classList.add("active");
            sidePanelTitle.textContent = title;

            // Update corresponding button active state
            if (contentEl === keywordsContent) {
                quickAccessKeywords.classList.add("active");
            } else if (contentEl === summaryContent) {
                quickAccessSummary.classList.add("active");
            } else if (contentEl === highlightsContent) {
                quickAccessHighlights.classList.add("active");
            }



            // Set flag to prevent resize-induced scroll from closing autoScroll
            this.isUpdatingUI = true;
            sidePanelsContainer.classList.add("expanded");
            setTimeout(() => {
                this.isUpdatingUI = false;
            }, 350); // Match the 0.3s transition + buffer
        };

        // Close panel button
        if (closeSidePanelBtn) {
            closeSidePanelBtn.addEventListener("click", () => {
                // Set flag to prevent resize-induced scroll from closing autoScroll
                this.isUpdatingUI = true;
                sidePanelsContainer.classList.remove("expanded");
                // Remove active state from all quick access buttons
                quickAccessKeywords.classList.remove("active");
                quickAccessSummary.classList.remove("active");
                quickAccessSettings.classList.remove("active");
                quickAccessHighlights.classList.remove("active");
                setTimeout(() => {
                    this.isUpdatingUI = false;
                }, 350); // Match the 0.3s transition + buffer
            });
        }

        // Quick access buttons
        if (quickAccessKeywords) {
            quickAccessKeywords.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = keywordsContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessKeywords.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(keywordsContent, "Auto Keywords");
                }
            });
        }

        if (quickAccessSummary) {
            quickAccessSummary.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = summaryContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessSummary.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(summaryContent, "Summary");
                }
            });
        }

        if (quickAccessSettings) {
            quickAccessSettings.addEventListener("click", () => {
                // 初始化设置面板的默认值
                this.settingsPanel.initialize();
                this.toggleModal("settingsModal");
            });
        }

        if (quickAccessHighlights) {
            quickAccessHighlights.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = highlightsContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessHighlights.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(highlightsContent, "Highlights");
                }
            });
        }

        // ===== Summary Feature =====
        const regenerateSummaryBtn = document.getElementById("regenerateSummaryBtn");
        const summaryDisplay = document.getElementById("summary-display");
        const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");

        if (regenerateSummaryBtn) {
            regenerateSummaryBtn.addEventListener("click", async () => {
                // 从当前session获取转录文本
                const session = this.sessionManager.getCurrentSession();
                let textToSummarize = "";

                if (session && session.transcripts) {
                    // session.transcripts 是一个对象，key 是 chunk index，value 是 {text, timestamp} 等
                    textToSummarize = Object.values(session.transcripts)
                        .map(item => item && item.text ? item.text : "")
                        .filter(text => text.trim().length > 0)
                        .join(" ");
                }

                if (!textToSummarize || textToSummarize.trim().length === 0) {
                    alert("No transcript text to summarize");
                    return;
                }

                regenerateSummaryBtn.disabled = true;
                regenerateSummaryBtn.textContent = "Generating...";

                try {
                    // 获取选中的总结风格
                    const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                    const summary = await this.summarizeText(textToSummarize, true, selectedStyle);  // forceRefresh=true
                    if (summary) {
                        summaryDisplay.innerHTML = this.formatSummaryDisplay(summary, selectedStyle);
                    } else {
                        summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
                    }
                } catch (error) {
                    console.error("[SUMMARY] Error:", error);
                    summaryDisplay.innerHTML = `<p class="placeholder">Error: ${error.message}</p>`;
                } finally {
                    regenerateSummaryBtn.disabled = false;
                    regenerateSummaryBtn.textContent = "Generate";
                }
            });
        }

        // Summary style selector - load cached summary or show placeholder
        if (summarizeStyleSelect) {
            summarizeStyleSelect.addEventListener("change", () => {
                const session = this.sessionManager.getCurrentSession();
                const language = this.explanationLanguage;
                const selectedStyle = summarizeStyleSelect.value;
                const cacheKey = `${language}-${selectedStyle}`;

                // 如果有缓存，显示缓存的总结
                if (this.summaryCache[cacheKey]) {
                    summaryDisplay.innerHTML = this.formatSummaryDisplay(this.summaryCache[cacheKey], selectedStyle);
                } else {
                    // 没有缓存，显示提示需要重新生成
                    summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Generate to create a summary</p>';
                }
            });
        }

        // Summary language selector
        const summaryLanguageSelector = document.getElementById("summary-language");
        if (summaryLanguageSelector) {
            summaryLanguageSelector.addEventListener("change", (e) => {
                this.explanationLanguage = e.target.value;
                const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                const cacheKey = `${this.explanationLanguage}-${selectedStyle}`;

                // 如果有缓存，显示缓存的总结
                if (this.summaryCache[cacheKey]) {
                    summaryDisplay.innerHTML = this.formatSummaryDisplay(this.summaryCache[cacheKey], selectedStyle);
                } else {
                    // 没有缓存，显示提示需要重新生成
                    summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Generate to create a summary</p>';
                }

                // 更新其他地方的explanationLanguage选择器
                const explanationLanguageSelector = document.getElementById("keyword-explanation-language");
                if (explanationLanguageSelector) {
                    explanationLanguageSelector.value = this.explanationLanguage;
                }
                const defaultExplanationLanguageSelector = document.getElementById("defaultExplanationLanguage");
                if (defaultExplanationLanguageSelector) {
                    defaultExplanationLanguageSelector.value = this.explanationLanguage;
                }

                // 保存设置到session
                this.saveSettingsToSession();
            });
        }

        // ===== Panel Toolbar Buttons =====

        // Re-extract keywords button
        const reExtractKeywordsBtn = document.getElementById("reExtractKeywordsBtn");
        if (reExtractKeywordsBtn) {
            reExtractKeywordsBtn.addEventListener("click", async () => {
                if (!this.keywordManager) {
                    this.showStatusMessage("Keyword extractor not initialized", 2000);
                    return;
                }

                if (Object.keys(this.preciseResults).length === 0) {
                    this.showStatusMessage("No transcript available to extract keywords from", 2000);
                    return;
                }

                reExtractKeywordsBtn.disabled = true;
                const originalText = reExtractKeywordsBtn.textContent;
                reExtractKeywordsBtn.textContent = 'Extracting...';

                try {
                    await this.processKeywords(this.recordingSessionId || this.sessionManager.currentSessionId);
                    this.showStatusMessage("Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    this.showStatusMessage("Failed to extract keywords", 2000);
                } finally {
                    reExtractKeywordsBtn.disabled = false;
                    reExtractKeywordsBtn.textContent = originalText;
                }
            });
        }

        // Clear keywords button
        const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
        if (clearKeywordsBtn) {
            clearKeywordsBtn.addEventListener("click", () => {
                if (!this.keywordManager || this.keywordManager.extracts.length === 0) {
                    this.showStatusMessage("No keywords to clear", 1500);
                    return;
                }

                if (confirm("Clear all auto-extracted keywords? This cannot be undone.")) {
                    this.keywordManager.extracts = [];
                    this.keywordManager.extractsCache = {};
                    this.keywordManager.displayExtracts();
                    this.saveToSession();
                    this.showStatusMessage("Keywords cleared", 1500);
                }
            });
        }

        // Clear highlights button
        const clearHighlightsBtn = document.getElementById("clearHighlightsBtn");
        if (clearHighlightsBtn) {
            clearHighlightsBtn.addEventListener("click", () => {
                if (!this.keywordManager || this.keywordManager.highlights.length === 0) {
                    this.showStatusMessage("No highlights to clear", 1500);
                    return;
                }

                if (confirm("Clear all highlights? This cannot be undone.")) {
                    this.keywordManager.highlights = [];
                    this.keywordManager.highlightCache = {};
                    this.highlightManager.reapplyAllHighlights();
                    this.keywordManager.displayHighlights();
                    this.saveToSession();
                    this.showStatusMessage("Highlights cleared", 1500);
                }
            });
        }

        // Highlight current explanation word button
        const highlightCurrentWordBtn = document.getElementById("highlight-current-word-btn");
        if (highlightCurrentWordBtn) {
            highlightCurrentWordBtn.addEventListener("click", () => {
                const currentWordEl = document.getElementById("current-explanation-word");
                if (currentWordEl && currentWordEl.textContent) {
                    const word = currentWordEl.textContent.trim();

                    // 检查词是否已被高亮
                    const isHighlighted = this.keywordManager?.highlights.includes(word);

                    if (isHighlighted) {
                        // 词已被高亮，执行移除操作
                        const isHighlightedAfter = this.highlightManager?.toggleHighlight(word);
                        this.updateHighlightButtonState(word, isHighlightedAfter);
                    } else {
                        // 词未被高亮，从临时高亮转移到永久高亮
                        const isCommitted = this.highlightManager?.commitTemporaryHighlight(word);
                        if (isCommitted) {
                            this.updateHighlightButtonState(word, true);
                        } else {
                            // 如果没有临时高亮，使用降级方案
                            const isAdded = this.highlightManager?.toggleHighlight(word);
                            this.updateHighlightButtonState(word, isAdded);
                        }
                    }
                }
            });
        }

        const reexplainExplanationBtn = document.getElementById("reexplain-explanation-btn");
        if (reexplainExplanationBtn) {
            reexplainExplanationBtn.addEventListener("click", () => {
                this.keywordManager?.reexplainCurrentExplanation();
            });
        }

        // Clear explanation display button
        const clearExplanationsBtn = document.getElementById("clearExplanationsBtn");
        if (clearExplanationsBtn) {
            clearExplanationsBtn.addEventListener("click", () => {
                const currentWordEl = document.getElementById("current-explanation-word");
                const contentEl = document.getElementById("explanation-content");
                const contextDiv = document.getElementById("word-context");
                const headerDiv = document.querySelector(".explanation-header");
                const regenerateBtn = document.getElementById("regenerate-explanation-btn");
                const pronounceBtn = document.getElementById("pronounce-current-word-btn");

                // 停止发音
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }

                if (currentWordEl) currentWordEl.textContent = "";
                if (contentEl) contentEl.innerHTML = '<p class="placeholder">Select a word to view its explanation</p>';
                if (contextDiv) contextDiv.style.display = 'none';
                if (headerDiv) headerDiv.classList.add("hidden");
                if (regenerateBtn) regenerateBtn.disabled = true;
                if (pronounceBtn) pronounceBtn.disabled = true;

                this.showStatusMessage("Explanation cleared", 1500);
            });
        }

        const clearSummaryBtn = document.getElementById("clearSummaryBtn");
        if (clearSummaryBtn) {
            clearSummaryBtn.addEventListener("click", () => {
                const summaryDisplay = document.getElementById("summary-display");
                if (summaryDisplay) {
                    // 清空显示
                    summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Generate to create a summary</p>';

                    // 获取当前的style和language，清除对应的缓存
                    const styleSelect = document.getElementById("summarizeStyleSelect");
                    const selectedStyle = styleSelect ? styleSelect.value : "paragraph";
                    const cacheKey = `${this.explanationLanguage}-${selectedStyle}`;
                    if (this.summaryCache[cacheKey]) {
                        delete this.summaryCache[cacheKey];
                    }

                    this.showStatusMessage("Summary cleared", 1500);
                }
            });
        }

        // Auto Scroll Toggle Button (Floating)
        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            floatingAutoScrollBtn.addEventListener("click", () => {
                // Enable Auto Scroll
                if (!this.autoScroll) {
                    this.autoScroll = true;

                    // Scroll to bottom immediately
                    this.isTogglingAutoScroll = true;
                    this.isUpdatingUI = true;  // 防止scroll事件触发同步逻辑
                    const transcript = document.getElementById("transcript");
                    const translation = document.getElementById("translation");

                    // 获取最后一行的索引并滚动到底部
                    const keys = Object.keys(this.preciseResults);
                    if (keys.length > 0) {
                        const lastIndex = keys[keys.length - 1];

                        if (transcript) {
                            transcript.style.scrollBehavior = 'auto';
                            this.scrollToLineBottom(transcript, lastIndex);
                            transcript.style.scrollBehavior = 'smooth';
                        }
                        if (translation) {
                            translation.style.scrollBehavior = 'auto';
                            this.scrollToLineBottom(translation, lastIndex);
                            translation.style.scrollBehavior = 'smooth';
                        }
                    }

                    setTimeout(() => {
                        this.isTogglingAutoScroll = false;
                        this.isUpdatingUI = false;
                    }, 200);
                }

                this.updateAutoScrollButton();
            });
            // Set initial state
            this.updateAutoScrollButton();
        }

        // 初始化关键词标签页切换
        this.initKeywordsTabSwitcher();

        // 监听用户选择变化
        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            this.hasActiveSelection = selection.toString().length > 0;

            // 当选择被取消且有待更新，立即刷新显示
            if (!this.hasActiveSelection && this.pendingUpdates) {
                this.pendingUpdates = false;
                this.updateDisplay();
            }
        });

        // === 模态窗口关闭按钮处理 ===
        // Session Modal 关闭按钮
        const closeSessionModalBtn = document.getElementById("closeSessionModal");
        if (closeSessionModalBtn) {
            closeSessionModalBtn.addEventListener("click", () => {
                this.closeModal("sessionModal");
            });
        }

        // Settings Modal 关闭按钮
        const closeSettingsModalBtn = document.getElementById("closeSettingsModal");
        if (closeSettingsModalBtn) {
            closeSettingsModalBtn.addEventListener("click", () => {
                this.closeModal("settingsModal");
            });
        }

        // === 模式切换功能 ===
        // 合并的 Add Content 按钮（文件导入 + 手动输入）
        const addContentBtn = document.getElementById("addContentBtn");
        const contentMenu = document.getElementById("contentMenu");
        const importFromFileOption = document.getElementById("importFromFileOption");
        const importFromTextOption = document.getElementById("importFromTextOption");
        const textFileInput = document.getElementById("textFileInput");

        // 菜单显示/隐藏逻辑
        if (addContentBtn && contentMenu) {
            addContentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const isVisible = contentMenu.style.display !== "none";

                if (!isVisible) {
                    // 计算菜单位置
                    const rect = addContentBtn.getBoundingClientRect();
                    contentMenu.style.left = rect.left + "px";
                    contentMenu.style.top = (rect.bottom + 4) + "px";
                    contentMenu.style.display = "block";
                    addContentBtn.classList.add("active");
                } else {
                    contentMenu.style.display = "none";
                    addContentBtn.classList.remove("active");
                }
            });

            // 点击菜单外关闭菜单
            document.addEventListener("click", (e) => {
                if (!addContentBtn.contains(e.target) && !contentMenu.contains(e.target)) {
                    contentMenu.style.display = "none";
                    addContentBtn.classList.remove("active");
                }
            });
        }

        // 从文件导入
        if (importFromFileOption && textFileInput) {
            importFromFileOption.addEventListener("click", () => {
                contentMenu.style.display = "none";
                addContentBtn.classList.remove("active");
                textFileInput.click();
            });

            textFileInput.addEventListener("change", async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const session = this.sessionManager.getCurrentSession();
                        const sessionStart = session && session.startTime ? session.startTime : Date.now();
                        const result = await TextProcessor.processFile(file, sessionStart);
                        this.importTextContent(result.preciseResults, file.name, "file");
                        this.showStatusMessage(`Imported ${file.name}`, 2000);
                    } catch (error) {
                        console.error("Error processing file:", error);
                        this.showStatusMessage(`Failed to import file: ${error.message}`, 2000);
                    }
                }
                // 重置 input 以便重新选择同一文件
                textFileInput.value = "";
            });
        }

        // 从文本导入
        if (importFromTextOption) {
            importFromTextOption.addEventListener("click", () => {
                contentMenu.style.display = "none";
                addContentBtn.classList.remove("active");
                this.showAddTextDialog();
            });
        }

        // 文本编辑功能 - 使用预定义的 editModal
        const editTextBtn = document.getElementById("editTextBtn");
        if (editTextBtn) {
            editTextBtn.addEventListener("click", () => {
                this.showEditTranscriptDialog();
            });
        }

        // 编辑 modal 关闭处理
        const editModalBackdrop = document.getElementById("editModalBackdrop");
        const editModal = document.getElementById("editModal");
        const closeEditModalBtn = document.getElementById("closeEditModal");

        const closeEditModal = () => {
            if (editModalBackdrop) editModalBackdrop.style.display = "none";
            if (editModal) editModal.style.display = "none";
            if (editTextBtn) editTextBtn.classList.remove("active");
        };

        if (closeEditModalBtn) {
            closeEditModalBtn.addEventListener("click", closeEditModal);
        }
        if (editModalBackdrop) {
            editModalBackdrop.addEventListener("click", (e) => {
                if (e.target === editModalBackdrop) {
                    closeEditModal();
                }
            });
        }
    }

    /**
     * 导入文本内容到当前 session
     * @param {Object} preciseResults - 精确结果对象 {index: {text, timestamp, source}}
     * @param {string} sourceFile - 文件名或来源标识
     * @param {string} sourceType - 'file' 或 'edit'
     */
    importTextContent(preciseResults, sourceFile, sourceType) {
        // 获取当前 session 并合并新内容（追加而不是覆盖）
        const currentSession = this.sessionManager.getCurrentSession();
        const sessionId = this.sessionManager.currentSessionId;
        const newIndices = [];  // 追踪新导入的索引

        if (currentSession) {
            // 找到现有转录中的最大索引
            const existingIndices = Object.keys(currentSession.transcripts || {})
                .map(k => parseInt(k))
                .filter(k => !isNaN(k));
            const maxIndex = existingIndices.length > 0 ? Math.max(...existingIndices) : -1;

            // 重新编号新内容的索引（接在现有内容后面）
            const mergedTranscripts = { ...(currentSession.transcripts || {}) };
            Object.entries(preciseResults).forEach(([key, value], idx) => {
                const newIndex = maxIndex + 1 + idx;
                mergedTranscripts[newIndex] = value;
                newIndices.push(newIndex);
            });

            currentSession.transcripts = mergedTranscripts;
            currentSession.contentMetadata = {
                source: 'mixed',
                sourceFile: sourceFile,
                sourceType: sourceType,
                uploadTime: new Date().toISOString(),
                paragraphCount: Object.keys(mergedTranscripts).length
            };
            this.sessionManager.saveSessions();
            // 更新 lastTextModified
            this.sessionManager.updateLastTextModified(sessionId);
        }

        // 更新所有工具的数据（使用合并后的完整数据）
        const mergedData = currentSession?.transcripts || preciseResults;
        if (this.recordingManager) {
            this.recordingManager.setTranscriptData(mergedData);
        }
        if (this.panelManager) {
            this.panelManager.setTranscriptData(mergedData);
        }

        // 刷新转录显示（会自动在正确的位置渲染）
        this.updateDisplay();

        // 自动翻译新导入的内容 - 类似 onTranscribeProgress 中的处理
        if (this.translationEnabled && newIndices.length > 0) {
            const translationContext = this.recordingManager.getTranscriptionContext();
            newIndices.forEach(index => {
                const item = mergedData[index];
                if (item && item.text) {
                    this.translationManager.translateText(item.text, index, sessionId, translationContext);
                }
            });
        }

        // 自动生成数据以供关键词提取
        this.saveToSession();
    }

    /**
     * 显示添加纯文本的对话框
     */
    showAddTextDialog() {
        // 创建模态框遮罩
        const backdrop = document.createElement("div");
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9999;
        `;

        // 创建模态框
        const modal = document.createElement("div");
        modal.className = "add-content-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 900px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            max-height: 70vh;
        `;

        // 模态框头
        const header = document.createElement("div");
        header.className = "floating-modal-header input-group-modal-header";
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        const title = document.createElement("h3");
        title.textContent = "Add Content from Text";
        title.style.cssText = `margin: 0;`;
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.className = "panel-close-btn toggle-btn";
        closeBtn.textContent = "✕";
        header.appendChild(closeBtn);

        // 工具栏（按钮）
        const toolbar = document.createElement("div");
        toolbar.className = "floating-modal-toolbar";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "toolbar-btn";
        cancelBtn.textContent = "Cancel";

        const addBtn = document.createElement("button");
        addBtn.className = "toolbar-btn";
        addBtn.textContent = "Add";
        addBtn.style.marginLeft = "auto";

        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(addBtn);

        // 模态框内容
        const content = document.createElement("div");
        content.style.cssText = `
            padding: 16px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
        `;

        // 文本输入框
        const textArea = document.createElement("textarea");
        textArea.placeholder = "Each line becomes a timestamped item";
        textArea.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 13px;
            font-family: inherit;
            resize: none;
            flex: 1;
            min-height: 200px;
            line-height: 1.4;
            box-sizing: border-box;
        `;
        content.appendChild(textArea);

        modal.appendChild(header);
        modal.appendChild(toolbar);
        modal.appendChild(content);

        // 关闭对话框函数
        const closeDialog = () => {
            backdrop.remove();
            modal.remove();
            const addContentBtn = document.getElementById("addContentBtn");
            if (addContentBtn) addContentBtn.classList.remove("active");
        };

        // 事件监听
        closeBtn.addEventListener("click", closeDialog);
        cancelBtn.addEventListener("click", closeDialog);
        backdrop.addEventListener("click", (e) => {
            // 只在点击背景本身时关闭，不是点击 modal 内容
            if (e.target === backdrop) {
                closeDialog();
            }
        });

        // 添加按钮逻辑
        addBtn.addEventListener("click", () => {
            const inputText = textArea.value.trim();
            if (!inputText) {
                this.showStatusMessage("Please enter some text", 1500);
                return;
            }

            // 按换行符分割文本
            const lines = inputText.split('\n').filter(line => line.trim().length > 0);

            if (lines.length === 0) {
                this.showStatusMessage("Please enter some text", 1500);
                return;
            }

            // 生成 preciseResults
            const preciseResults = {};
            const session = this.sessionManager.getCurrentSession();
            const sessionStart = session && session.startTime ? session.startTime : Date.now();
            const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
            const timestamp = relativeSeconds;

            lines.forEach((line, idx) => {
                preciseResults[idx] = {
                    text: line.trim(),
                    timestamp: timestamp,
                    source: 'text'
                };
            });

            // 导入文本
            this.importTextContent(preciseResults, "manual", "text");
            this.showStatusMessage(`Added ${lines.length} items`, 2000);

            closeDialog();
        });

        // 添加到页面
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        // 自动focus文本框
        setTimeout(() => {
            textArea.focus();
        }, 100);
    }

    /**
     * 显示编辑转录对话框
     */
    showEditTranscriptDialog() {
        const transcriptData = this.recordingManager.getTranscriptData();

        if (!transcriptData || Object.keys(transcriptData).length === 0) {
            this.showStatusMessage("No transcript to edit", 1500);
            return;
        }

        // Add active class to edit button
        const editTextBtn = document.getElementById("editTextBtn");
        if (editTextBtn) editTextBtn.classList.add("active");

        const editRowsContainer = document.getElementById("editRowsContainer");
        if (!editRowsContainer) return;

        // 清空容器
        editRowsContainer.innerHTML = "";

        // 创建工具栏
        const toolbar = document.createElement("div");
        toolbar.className = "floating-modal-toolbar edit-modal-toolbar";
        toolbar.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 10px 16px;
            border-bottom: 1px solid #e9ecef;
            flex-shrink: 0;
            background: #f5f5f5;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
        `;

        // 左侧按钮区域（Cancel）
        const leftGroup = document.createElement("div");
        leftGroup.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "toolbar-btn";
        cancelBtn.textContent = "Cancel";

        leftGroup.appendChild(cancelBtn);

        // 右侧按钮区域（Clear 和 Save）
        const buttonGroup = document.createElement("div");
        buttonGroup.style.cssText = `
            display: flex;
            gap: 8px;
            margin-left: auto;
        `;

        const clearAllBtn = document.createElement("button");
        clearAllBtn.className = "toolbar-btn danger";
        clearAllBtn.textContent = "Clear";

        const saveBtn = document.createElement("button");
        saveBtn.className = "toolbar-btn";
        saveBtn.textContent = "Save";

        buttonGroup.appendChild(clearAllBtn);
        buttonGroup.appendChild(saveBtn);

        toolbar.appendChild(leftGroup);
        toolbar.appendChild(buttonGroup);
        editRowsContainer.appendChild(toolbar);

        // 创建编辑项容器
        const itemsContainer = document.createElement("div");
        itemsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 12px 0;
            width: 100%;
        `;
        editRowsContainer.appendChild(itemsContainer);

        // 保存编辑数据
        this.editInputs = {};
        this.editTimestamps = {};

        // 初始化行
        const indices = Object.keys(transcriptData).map(Number).sort((a, b) => a - b);
        indices.forEach(idx => {
            const item = transcriptData[idx];
            const text = item?.text || '';
            const timestamp = item?.timestamp || '';
            this._createEditItem(itemsContainer, idx, text, timestamp);
        });

        // Clear All 按钮
        clearAllBtn.addEventListener("click", () => {
            if (confirm("Clear all items?")) {
                // 直接调用内置的 clear 方法
                this.clear();

                // 关闭模态窗口
                const backdrop = document.getElementById("editModalBackdrop");
                const modal = document.getElementById("editModal");
                if (backdrop && modal) {
                    backdrop.style.display = "none";
                    modal.style.display = "none";
                }
            }
        });

        // Save 按钮
        saveBtn.addEventListener("click", () => {
            this.saveEditedTranscript();
        });

        // Cancel 按钮
        cancelBtn.addEventListener("click", () => {
            const backdrop = document.getElementById("editModalBackdrop");
            const modal = document.getElementById("editModal");
            if (backdrop && modal) {
                backdrop.style.display = "none";
                modal.style.display = "none";
            }
        });

        // 显示 modal
        const backdrop = document.getElementById("editModalBackdrop");
        const modal = document.getElementById("editModal");
        if (backdrop && modal) {
            backdrop.style.display = "block";
            modal.style.display = "flex";
        }
    }

    /**
     * 创建编辑项
     */
    _createEditItem(container, idx, text, timestamp) {
        const item = document.createElement("div");
        item.className = "edit-item";
        item.id = `edit-item-${idx}`;
        item.style.cssText = `
            display: flex;
            gap: 10px;
            padding: 10px 12px;
            align-items: flex-start;
            overflow: visible;
            margin: 0 12px;
        `;

        // 时间戳输入框 - 分为日期和时间两个输入框
        const session = this.sessionManager.getCurrentSession();
        const sessionStartMs = session && session.startTime ? session.startTime : Date.now();
        const sessionStartDate = new Date(sessionStartMs);

        // 计算初始日期和时间
        let displayDate = "2000-01-01";
        let displayTime = "00:00:00";

        // 检查 timestamp 是否有效（包括 0，0 表示 session 开始时间），而不是只检查 truthy 值
        if (timestamp !== null && timestamp !== undefined && timestamp !== '') {
            const relativeSeconds = typeof timestamp === 'number' ? timestamp :
                (typeof timestamp === 'string' && /^\d+$/.test(timestamp) ? parseInt(timestamp) : null);

            if (relativeSeconds !== null && relativeSeconds >= 0) {
                // 转换为实际时间
                const actualTimeMs = sessionStartMs + relativeSeconds * 1000;
                const date = new Date(actualTimeMs);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                displayDate = `${year}-${month}-${day}`;

                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                displayTime = `${hours}:${minutes}:${seconds}`;
            }
            else if (typeof timestamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
                displayTime = timestamp;
                displayDate = `${sessionStartDate.getFullYear()}-${String(sessionStartDate.getMonth() + 1).padStart(2, '0')}-${String(sessionStartDate.getDate()).padStart(2, '0')}`;
            }
        } else {
            // 默认为session开始日期时间
            displayDate = `${sessionStartDate.getFullYear()}-${String(sessionStartDate.getMonth() + 1).padStart(2, '0')}-${String(sessionStartDate.getDate()).padStart(2, '0')}`;
            displayTime = `${String(sessionStartDate.getHours()).padStart(2, '0')}:${String(sessionStartDate.getMinutes()).padStart(2, '0')}:${String(sessionStartDate.getSeconds()).padStart(2, '0')}`;
        }

        // 日期输入框
        const dateInput = document.createElement("input");
        dateInput.type = "text";
        dateInput.value = displayDate;
        dateInput.placeholder = "YYYY-MM-DD";
        dateInput.style.cssText = `
            width: 110px;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: "Monaco", "Menlo", monospace;
            font-size: 13px;
            text-align: center;
            box-sizing: border-box;
            flex-shrink: 0;
            line-height: 1.4;
            height: 32px;
        `;
        dateInput.addEventListener("blur", (e) => {
            const val = e.target.value.trim();
            if (!val) {
                e.target.value = displayDate;
                e.target.style.borderColor = "#ddd";
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                e.target.style.borderColor = "#d32f2f";
                e.target.value = displayDate;
                this.showStatusMessage("Invalid date format (use YYYY-MM-DD, e.g., 2026-03-16)", 2000);
            } else {
                const [y, m, d] = val.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                // 检查日期有效性
                if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
                    e.target.style.borderColor = "#d32f2f";
                    e.target.value = displayDate;
                    this.showStatusMessage("Invalid date", 2000);
                } else {
                    e.target.style.borderColor = "#ddd";
                }
            }
        });
        dateInput.addEventListener("focus", (e) => {
            e.target.style.borderColor = "#5a7c99";
        });

        // 时间输入框
        const timeInput = document.createElement("input");
        timeInput.type = "text";
        timeInput.value = displayTime;
        timeInput.placeholder = "HH:MM:SS";
        timeInput.style.cssText = `
            width: 100px;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: "Monaco", "Menlo", monospace;
            font-size: 13px;
            text-align: center;
            box-sizing: border-box;
            flex-shrink: 0;
            line-height: 1.4;
            height: 32px;
        `;
        timeInput.addEventListener("blur", (e) => {
            const val = e.target.value.trim();
            if (!val) {
                e.target.value = displayTime;
                e.target.style.borderColor = "#ddd";
            } else if (!/^\d{2}:\d{2}:\d{2}$/.test(val)) {
                e.target.style.borderColor = "#d32f2f";
                e.target.value = displayTime;
                this.showStatusMessage("Invalid timestamp format (use HH:MM:SS, e.g., 12:34:56)", 2000);
            } else {
                const [h, m, s] = val.split(':').map(Number);
                if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
                    e.target.style.borderColor = "#d32f2f";
                    e.target.value = displayTime;
                    this.showStatusMessage("Invalid time: hours 00-23, minutes 00-59, seconds 00-59", 2500);
                } else {
                    e.target.style.borderColor = "#ddd";
                }
            }
        });
        timeInput.addEventListener("focus", (e) => {
            e.target.style.borderColor = "#5a7c99";
        });

        // 创建日期时间容器
        const timestampContainer = document.createElement("div");
        timestampContainer.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
        `;
        timestampContainer.appendChild(dateInput);
        timestampContainer.appendChild(timeInput);

        // 文本编辑框
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.placeholder = "Edit text";
        textarea.rows = "1";
        textarea.style.cssText = `
            flex: 1;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: inherit;
            font-size: 13px;
            resize: none;
            line-height: 1.4;
            min-height: 32px;
            box-sizing: border-box;
            overflow: hidden;
            height: auto;
        `;

        // 自动调整高度的函数
        const adjustHeight = () => {
            // 使用setTimeout确保DOM布局完全完成
            setTimeout(() => {
                textarea.style.height = "auto";
                // scrollHeight包含了padding和border，直接用就是正确的高度
                const newHeight = Math.max(textarea.scrollHeight, 32);
                textarea.style.height = newHeight + "px";
            }, 0);
        };

        // 监听输入变化以调整高度
        textarea.addEventListener("input", adjustHeight);
        textarea.addEventListener("change", adjustHeight);

        // 处理键盘事件：Enter 插入新 item，上下键切换 item
        textarea.addEventListener("keydown", (e) => {
            // Enter：创建新 item
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();

                let currentItem = textarea.closest('[id^="edit-item-"]');
                if (!currentItem) return;

                const itemsContainer = currentItem.parentElement;

                // 找到最大的 idx
                const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                const indices = items.map(el => parseInt(el.id.replace('edit-item-', '')));
                const newIdx = Math.max(...indices, -1) + 1;

                // 计算相对于session开始时间的秒数
                const session = this.sessionManager.getCurrentSession();
                const sessionStart = session && session.startTime ? session.startTime : Date.now();
                const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
                const timestamp = relativeSeconds;

                // 创建新 item（会被添加到末尾）
                this._createEditItem(itemsContainer, newIdx, '', timestamp);

                // 找到新创建的 item 并插入到当前 item 后面
                const newItem = itemsContainer.children[itemsContainer.children.length - 1];
                newItem.remove();
                currentItem.insertAdjacentElement('afterend', newItem);

                // 焦点移到新 item 的 textarea
                const newTextarea = newItem.querySelector('textarea');
                if (newTextarea) newTextarea.focus();
            }

            // ArrowUp：如果在第一行则移到上一个 item
            if (e.key === "ArrowUp") {
                const beforeCursor = textarea.value.substring(0, textarea.selectionStart);
                // 如果光标前面没有\n，说明在第一行
                if (!beforeCursor.includes('\n')) {
                    let currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    // 只有有上一个item时才切换
                    if (currentIndex > 0) {
                        e.preventDefault();
                        const prevItem = items[currentIndex - 1];
                        const prevTextarea = prevItem.querySelector('textarea');
                        if (prevTextarea) {
                            prevTextarea.focus();
                            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
                        }
                    }
                }
            }

            // ArrowDown：如果在最后一行则移到下一个 item
            if (e.key === "ArrowDown") {
                const afterCursor = textarea.value.substring(textarea.selectionStart);
                // 如果光标后面没有\n，说明在最后一行
                if (!afterCursor.includes('\n')) {
                    let currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    // 只有有下一个item时才切换
                    if (currentIndex < items.length - 1) {
                        e.preventDefault();
                        const nextItem = items[currentIndex + 1];
                        const nextTextarea = nextItem.querySelector('textarea');
                        if (nextTextarea) {
                            nextTextarea.focus();
                            nextTextarea.setSelectionRange(0, 0);
                        }
                    }
                }
            }

            // ArrowLeft：如果在开头则移到上一个 item 的末尾，否则在 textarea 内移动
            if (e.key === "ArrowLeft") {
                // 检查光标是否在开头
                if (textarea.selectionStart === 0) {
                    let currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    // 只有当有上一个item时才切换
                    if (currentIndex > 0) {
                        e.preventDefault();
                        const prevItem = items[currentIndex - 1];
                        const prevTextarea = prevItem.querySelector('textarea');
                        if (prevTextarea) {
                            prevTextarea.focus();
                            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
                        }
                    }
                }
            }

            // ArrowRight：如果在结尾则移到下一个 item 的开头，否则在 textarea 内移动
            if (e.key === "ArrowRight") {
                // 检查光标是否在结尾
                if (textarea.selectionStart === textarea.value.length) {
                    let currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    // 只有当有下一个item时才切换
                    if (currentIndex < items.length - 1) {
                        e.preventDefault();
                        const nextItem = items[currentIndex + 1];
                        const nextTextarea = nextItem.querySelector('textarea');
                        if (nextTextarea) {
                            nextTextarea.focus();
                            nextTextarea.setSelectionRange(0, 0);
                        }
                    }
                }
            }
        });

        // 删除按钮
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "item-delete-btn";
        deleteBtn.textContent = "✕";
        deleteBtn.addEventListener("click", () => {
            item.remove();
            delete this.editInputs[idx];
            delete this.editTimestamps[idx];
        });

        // 保存引用
        this.editInputs[idx] = textarea;
        this.editTimestamps[idx] = { date: dateInput, time: timeInput };

        // 组装
        item.appendChild(timestampContainer);
        item.appendChild(textarea);
        item.appendChild(deleteBtn);
        container.appendChild(item);

        // 初始化高度（必须在添加到DOM后）
        adjustHeight();
    }

    /**
     * 保存编辑后的转录
     */
    saveEditedTranscript() {
        // 直接从 DOM 中读取所有编辑项，而不依赖 this.editInputs
        const editItems = document.querySelectorAll('[id^="edit-item-"]');

        const updatedData = {};
        const transcriptData = this.recordingManager.getTranscriptData();
        const session = this.sessionManager.getCurrentSession();
        const sessionStartTime = session && session.startTime ? session.startTime : Date.now();
        const sessionStartDate = new Date(sessionStartTime);

        let hasError = false;
        let errorMsg = "";

        // 辅助函数：将日期+时间格式转换为相对秒数（基于session.startTime）
        const dateTimeToSeconds = (dateStr, timeStr) => {
            if (!dateStr || !timeStr) return 0;

            const [y, m, d] = dateStr.split('-').map(Number);
            const [h, mi, s] = timeStr.split(':').map(Number);

            // 构建用户输入的实际日期时间
            const inputDate = new Date(y, m - 1, d, h, mi, s);

            // 计算相对秒数
            const relativeSeconds = Math.floor((inputDate.getTime() - sessionStartTime) / 1000);
            return Math.max(0, relativeSeconds);  // 确保不为负
        };

        // 第一步：验证所有时间戳格式和范围
        editItems.forEach((item) => {
            const timestampContainer = item.querySelector('div[style*="display: flex"]');
            if (timestampContainer) {
                const inputs = timestampContainer.querySelectorAll('input[type="text"]');
                if (inputs.length >= 2) {
                    const dateInput = inputs[0];
                    const timeInput = inputs[1];
                    const dateStr = dateInput.value.trim();
                    const timeStr = timeInput.value.trim();

                    // 检查日期格式
                    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        hasError = true;
                        errorMsg = `Invalid date format: "${dateStr}". Use YYYY-MM-DD`;
                        dateInput.style.borderColor = "#d32f2f";
                        return;
                    }

                    // 检查日期有效性
                    if (dateStr) {
                        const [y, m, d] = dateStr.split('-').map(Number);
                        const date = new Date(y, m - 1, d);
                        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
                            hasError = true;
                            errorMsg = `Invalid date: "${dateStr}"`;
                            dateInput.style.borderColor = "#d32f2f";
                            return;
                        }
                    }

                    // 检查时间格式
                    if (timeStr && !/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
                        hasError = true;
                        errorMsg = `Invalid time format: "${timeStr}". Use HH:MM:SS`;
                        timeInput.style.borderColor = "#d32f2f";
                        return;
                    }

                    // 检查时间范围
                    if (timeStr) {
                        const [h, m, s] = timeStr.split(':').map(Number);
                        if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
                            hasError = true;
                            errorMsg = `Invalid time: hours 00-23, minutes 00-59, seconds 00-59`;
                            timeInput.style.borderColor = "#d32f2f";
                            return;
                        }
                    }
                }
            }
        });

        if (hasError) {
            this.showStatusMessage(errorMsg, 2500);
            return;
        }

        // 第二步：收集数据并转换时间戳为秒数
        let itemIndex = 0;
        editItems.forEach((item) => {
            const textarea = item.querySelector('textarea');
            const timestampContainer = item.querySelector('div[style*="display: flex"]');

            const text = textarea ? textarea.value.trim() : '';
            if (text.length > 0) {
                let timestamp = 0;

                if (timestampContainer) {
                    const inputs = timestampContainer.querySelectorAll('input[type="text"]');
                    if (inputs.length >= 2) {
                        const dateStr = inputs[0].value.trim();
                        const timeStr = inputs[1].value.trim();
                        timestamp = dateTimeToSeconds(dateStr, timeStr);
                    }
                }

                updatedData[itemIndex] = {
                    text: text,
                    timestamp: timestamp,
                    source: 'edited'
                };
                itemIndex++;
            }
        });

        if (Object.keys(updatedData).length === 0) {
            this.showStatusMessage("Transcript cannot be empty", 1500);
            return;
        }

        // 更新数据
        this.recordingManager.setTranscriptData(updatedData);
        const currentSession = this.sessionManager.getCurrentSession();
        if (currentSession) {
            currentSession.transcripts = updatedData;
            this.sessionManager.saveSessions();
            // 更新 lastTextModified
            this.sessionManager.updateLastTextModified(this.sessionManager.currentSessionId);
        }
        if (this.panelManager) {
            this.panelManager.setTranscriptData(updatedData);
        }

        // 刷新显示
        this.updateDisplay();

        // 重新翻译所有编辑后的内容（如果翻译启用）
        if (this.translationEnabled && this.translationManager) {
            this.translationManager.retranslateAll();
        }

        this.saveToSession();
        this.showStatusMessage("Transcript updated", 1500);

        // 关闭 modal
        const backdrop = document.getElementById("editModalBackdrop");
        const modal = document.getElementById("editModal");
        if (backdrop && modal) {
            backdrop.style.display = "none";
            modal.style.display = "none";
        }

        // 清理
        this.editInputs = null;
        this.editTimestamps = null;
        this.editItems = null;
    }

    /**
     * 初始化关键词标签页切换功能
     */
    initKeywordsTabSwitcher() {
        const tabBtns = document.querySelectorAll(".keywords-tab-btn");
        const tabContents = document.querySelectorAll(".keywords-tab-content");
        const autoExtractBtn = document.getElementById("autoExtractKeywordsBtn");

        if (!tabBtns.length) return;

        // 设置初始状态：刷新按钮禁用（因为默认显示手动标签页）
        if (autoExtractBtn) {
            autoExtractBtn.style.opacity = "0.3";
            autoExtractBtn.style.pointerEvents = "none";
        }

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const tabName = btn.getAttribute("data-tab");

                // 移除所有活跃状态
                tabBtns.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));

                // 激活当前标签页
                btn.classList.add("active");
                const activeContent = document.getElementById(`${tabName}-keywords-display`);
                if (activeContent) {
                    activeContent.classList.add("active");
                }

                // 根据标签页控制刷新按钮显示
                if (autoExtractBtn) {
                    autoExtractBtn.style.opacity = tabName === "auto" ? "1" : "0.3";
                    autoExtractBtn.style.pointerEvents = tabName === "auto" ? "auto" : "none";
                }
            });
        });
    }

    /**
     * 初始化文本选中菜单功能（浮动菜单）
     */
    initTextSelectionMenu() {
        const floatingMenu = document.getElementById("textSelectionMenu");
        const floatingExplainBtn = document.getElementById("floatingExplainBtn");
        const floatingHighlightBtn = document.getElementById("floatingHighlightBtn");

        const keywordsContent = document.getElementById("keywordsContent");
        const highlightsContent = document.getElementById("highlightsContent");

        if (!floatingMenu || !floatingExplainBtn || !floatingHighlightBtn) return;

        // 保存当前的选中range对象，用于菜单按钮点击时使用
        let currentSelectedRange = null;
        let rangeInfo = null;  // 保存range的详细信息以便重建

        /**
         * 计算并显示浮动菜单
         */
        const showFloatingMenu = () => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (!selectedText || selectedText.length === 0) {
                floatingMenu.classList.add("hidden");
                return;
            }

            // 检查选中内容是否在转录或翻译区域
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (!range) {
                floatingMenu.classList.add("hidden");
                return;
            }

            const transcriptDiv = document.getElementById("transcript");
            const translationDiv = document.getElementById("translation");

            const inTranscript = transcriptDiv?.contains(range.commonAncestorContainer);
            const inTranslation = translationDiv?.contains(range.commonAncestorContainer);

            if (inTranscript || inTranslation) {
                this.selectedText = selectedText;
                this.selectedTextElement = range.commonAncestorContainer;

                // 保存当前的range和其详细信息
                currentSelectedRange = range.cloneRange();
                rangeInfo = {
                    startContainer: range.startContainer,
                    startOffset: range.startOffset,
                    endContainer: range.endContainer,
                    endOffset: range.endOffset,
                    commonAncestorContainer: range.commonAncestorContainer
                };

                // 先显示菜单，以便计算实际尺寸
                floatingMenu.classList.remove("hidden");

                // 获取选区和菜单的位置
                const rangeRect = range.getBoundingClientRect();

                // 使用requestAnimationFrame确保菜单已渲染
                requestAnimationFrame(() => {
                    // 获取菜单的实际尺寸
                    const menuWidth = floatingMenu.offsetWidth || 180;
                    const menuHeight = floatingMenu.offsetHeight || 100;

                    // 计算菜单位置：显示在选中文本的右下方
                    let menuX = rangeRect.right + 10;  // 选区右侧 + 10px间距
                    let menuY = rangeRect.top;          // 选区顶部对齐

                    // 检查菜单是否超出屏幕右边界，如果超出则显示在左边
                    if (menuX + menuWidth > window.innerWidth - 10) {
                        menuX = rangeRect.left - menuWidth - 10;  // 显示在左边
                    }

                    // 检查菜单是否超出屏幕底部，如果超出则显示在上方
                    const viewportHeight = window.innerHeight;

                    if (menuY + menuHeight > viewportHeight - 10) {
                        menuY = rangeRect.bottom - menuHeight;  // 显示在上方
                    }

                    // 保证菜单不会超出屏幕顶部
                    if (menuY < 10) {
                        menuY = rangeRect.bottom + 10;
                    }

                    // 设置菜单位置
                    floatingMenu.style.left = Math.max(10, menuX) + "px";
                    floatingMenu.style.top = Math.max(10, menuY) + "px";
                });
            } else {
                floatingMenu.classList.add("hidden");
            }
        };

        // 仅在鼠标抬起时显示菜单，提供更流畅的选择体验
        // 避免在拖动选择过程中菜单频繁闪现
        document.addEventListener("mouseup", () => {
            showFloatingMenu();
        });

        // 当选择被取消时立即隐藏菜单
        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            if (selection.toString().trim().length === 0) {
                floatingMenu.classList.add("hidden");
            }
        });

        // 点击文档其他地方时隐藏菜单
        document.addEventListener("click", (e) => {
            // 如果点击的是菜单内部，不要隐藏
            if (floatingMenu.contains(e.target)) {
                return;
            }

            // 检查是否点击了选中的文本，如果是，不隐藏菜单
            const selection = window.getSelection();
            if (selection.toString().trim().length > 0) {
                return;
            }

            floatingMenu.classList.add("hidden");
        });

        // 解释按钮点击事件
        floatingExplainBtn.addEventListener("click", async () => {
            if (this.selectedText.trim()) {
                const term = this.selectedText.trim();

                // 检测选中文本的来源面板
                let sourcePanel = 'transcript'; // 默认
                if (currentSelectedRange) {
                    const transcriptDiv = document.getElementById("transcript");
                    const translationDiv = document.getElementById("translation");

                    if (translationDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                        sourcePanel = 'translation';
                    } else if (transcriptDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                        sourcePanel = 'transcript';
                    }
                }

                // 获取Range的位置信息（如果可用）
                let positionInfo = null;
                if (currentSelectedRange) {
                    positionInfo = this.highlightManager.extractPositionFromRangePublic(currentSelectedRange);
                }

                // 通过 KeywordManager 统一处理显示解释面板的逻辑，并传入位置信息和源面板
                this.keywordManager.openExplanationForWord(term, positionInfo, sourcePanel);
            }
            floatingMenu.classList.add("hidden");
            // 清除选中文本
            window.getSelection().removeAllRanges();
        });

        // 高亮按钮点击事件
        floatingHighlightBtn.addEventListener("click", () => {
            // 使用保存的选中文本和range
            if (!this.selectedText || !this.selectedText.trim()) {
                this.showStatusMessage("No text selected", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            if (!currentSelectedRange && !rangeInfo) {
                this.showStatusMessage("Cannot highlight: selection lost", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            const selectedText = this.selectedText.trim();

            // 检测选中文本的来源面板
            let sourcePanel = 'transcript'; // 默认
            if (currentSelectedRange) {
                const transcriptDiv = document.getElementById("transcript");
                const translationDiv = document.getElementById("translation");

                if (translationDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                    sourcePanel = 'translation';
                } else if (transcriptDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                    sourcePanel = 'transcript';
                }
            }

            // 尝试使用保存的range，如果失效则尝试重建
            let rangeToUse = currentSelectedRange;

            if (!rangeToUse && rangeInfo) {
                // 尝试从保存的信息重建range
                try {
                    rangeToUse = document.createRange();
                    rangeToUse.setStart(rangeInfo.startContainer, rangeInfo.startOffset);
                    rangeToUse.setEnd(rangeInfo.endContainer, rangeInfo.endOffset);
                } catch (e) {
                    this.showStatusMessage("Cannot highlight: range invalid", 1500);
                    floatingMenu.classList.add("hidden");
                    return;
                }
            }

            // 添加高亮，并记录源面板
            const highlightResult = this.highlightManager.addSelectedTextAsHighlightWithRange(selectedText, rangeToUse);

            if (!highlightResult) {
                this.showStatusMessage("Add highlight failed", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            // 记录这个高亮词的源面板
            if (this.keywordManager) {
                this.keywordManager.wordSourcePanel[selectedText] = sourcePanel;
            }

            // 直接打开Highlights面板（复制showContent的逻辑）
            const sidePanelsContainer = document.querySelector(".side-panels-container");
            const sidePanelTitle = document.getElementById("sidePanelTitle");
            const quickAccessHighlights = document.getElementById("quickAccessHighlights");
            const quickAccessKeywords = document.getElementById("quickAccessKeywords");
            const quickAccessSummary = document.getElementById("quickAccessSummary");
            const quickAccessHistory = document.getElementById("quickAccessHistory");
            const quickAccessSettings = document.getElementById("quickAccessSettings");

            // 隐藏所有内容
            const keywordsContent = document.getElementById("keywordsContent");
            const historyContent = document.getElementById("historyContent");
            const summaryContent = document.getElementById("summaryContent");
            const settingsContent = document.getElementById("settingsContent");

            [keywordsContent, historyContent, summaryContent, highlightsContent].forEach(el => {
                if (el) el.classList.remove("active");
            });

            // 移除所有按钮的 active 状态
            if (quickAccessKeywords) quickAccessKeywords.classList.remove("active");
            if (quickAccessSummary) quickAccessSummary.classList.remove("active");
            if (quickAccessHistory) quickAccessHistory.classList.remove("active");
            if (quickAccessSettings) quickAccessSettings.classList.remove("active");
            if (quickAccessHighlights) quickAccessHighlights.classList.remove("active");

            // 显示高亮面板
            highlightsContent.classList.add("active");
            sidePanelTitle.textContent = "Highlights";

            // 更新按钮状态
            if (quickAccessHighlights) {
                quickAccessHighlights.classList.add("active");
            }



            // 展开侧面板
            this.isUpdatingUI = true;
            sidePanelsContainer.classList.add("expanded");
            setTimeout(() => {
                this.isUpdatingUI = false;
            }, 350);

            floatingMenu.classList.add("hidden");
            // 清除选中文本
            window.getSelection().removeAllRanges();
        });
    }

    /**
     * 初始化窗口可见性处理器
     * 当窗口重新获得焦点或文档变为可见时，如果自动滚动启用，重新滚动到底部
     */
    initVisibilityHandlers() {
        // 监听窗口获得焦点
        window.addEventListener('focus', () => {
            // 如果自动滚动启用，重新滚动到底部
            if (this.panelManager && this.panelManager.autoScroll) {
                setTimeout(() => {
                    const transcript = document.getElementById("transcript");
                    const translation = document.getElementById("translation");
                    const keys = Object.keys(this.recordingManager.getTranscriptData());

                    if (keys.length > 0) {
                        const lastIndex = keys[keys.length - 1];
                        if (transcript) {
                            this.panelManager.scrollToLineBottom(transcript, lastIndex);
                        }
                        if (translation) {
                            this.panelManager.scrollToLineBottom(translation, lastIndex);
                        }
                    }
                }, 0);
            }
        });

        // 监听文档可见性变化
        document.addEventListener('visibilitychange', () => {
            // 当文档变为可见且自动滚动启用时，重新滚动到底部
            if (!document.hidden && this.panelManager && this.panelManager.autoScroll) {
                setTimeout(() => {
                    const transcript = document.getElementById("transcript");
                    const translation = document.getElementById("translation");
                    const keys = Object.keys(this.recordingManager.getTranscriptData());

                    if (keys.length > 0) {
                        const lastIndex = keys[keys.length - 1];
                        if (transcript) {
                            this.panelManager.scrollToLineBottom(transcript, lastIndex);
                        }
                        if (translation) {
                            this.panelManager.scrollToLineBottom(translation, lastIndex);
                        }
                    }
                }, 0);
            }
        });
    }

    /**
     * 切换录音状态（开始或停止）
     */
    async toggleRecording() {
        if (this.recordingManager && this.recordingManager.isRecording) {
            // 正在录制，停止
            this.stop();
        } else {
            // 未录制，开始
            await this.start();
        }
    }

    async start() {
        try {
            // 检查是否已有其他 session 在录制
            if (this.recordingSessionId !== null && this.recordingSessionId !== this.sessionManager.currentSessionId) {
                const recordingSession = this.sessionManager.getSession(this.recordingSessionId);
                const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
                this.showStatusMessage(`⚠️ Stop recording in "${recordingSessionName}" first!`, 3000);
                return;
            }

            // 设置全局录制状态
            this.recordingSessionId = this.sessionManager.currentSessionId;
            this.updateRecordingIndicator();

            // 禁用 Sessions 按鎘
            const sessionBtn = document.getElementById('openSessionPanel');
            if (sessionBtn) {
                sessionBtn.disabled = true;
                sessionBtn.title = 'Cannot switch sessions while recording';
                sessionBtn.style.opacity = '0.5';
            }

            // 禁用 Add Content 按钮
            const addContentBtn = document.getElementById('addContentBtn');
            if (addContentBtn) {
                addContentBtn.disabled = true;
                addContentBtn.title = 'Cannot add content while recording';
                addContentBtn.style.opacity = '0.5';
            }

            // 禁用 Edit 按钮
            const editBtn = document.getElementById('editTextBtn');
            if (editBtn) {
                editBtn.disabled = true;
                editBtn.title = 'Cannot edit while recording';
                editBtn.style.opacity = '0.5';
            }

            // 确保上下文已更新
            this.updateTranscriptionContext();

            // 为当前session设置sessionStartTime，然后开始录音
            const currentSession = this.sessionManager.getCurrentSession();
            if (currentSession) {
                this.recordingManager.setSessionStartTime(currentSession.startTime);
            }

            await this.recordingManager.start(this.recordingSessionId);

            this.updateRecordingButtonState();

            // 立即显示"Listening..."状态
            this.updateDisplay();

            // 每秒更新 session 统计信息和显示状态
            let statsInterval = setInterval(() => {
                if (!this.recordingManager.isRecording) {
                    clearInterval(statsInterval);
                    return;
                }
                this.updateSessionStats();
                this.updateDisplay(); // 定期更新显示，确保"Listening..."/"Transcripting..."始终可见
            }, 1000);

        } catch (error) {
            console.error("[ERROR] Microphone access:", error);
            this.updateStatus("Microphone access denied");
        }
    }

    stop() {
        if (this.recordingManager && this.recordingManager.isRecording) {
            this.recordingManager.stop();

            // 清除全局录制状态
            this.recordingSessionId = null;
            this.updateRecordingIndicator();

            // 启用 Sessions 按鎈
            const sessionBtn = document.getElementById('openSessionPanel');
            if (sessionBtn) {
                sessionBtn.disabled = false;
                sessionBtn.title = 'Open Sessions';
                sessionBtn.style.opacity = '1';
            }

            // 启用 Add Content 按钮
            const addContentBtn = document.getElementById('addContentBtn');
            if (addContentBtn) {
                addContentBtn.disabled = false;
                addContentBtn.title = 'Add content from file or text';
                addContentBtn.style.opacity = '1';
            }

            // 启用 Edit 按钮（如果有内容的话）
            const editBtn = document.getElementById('editTextBtn');
            if (editBtn && Object.keys(this.recordingManager.preciseResults).length > 0) {
                editBtn.disabled = false;
                editBtn.title = 'Edit transcript';
                editBtn.style.opacity = '1';
            }

            this.updateRecordingButtonState();

            // 停止时更新一次统计信息和 lastTextModified
            this.updateSessionStats();
            // 更新 lastTextModified 以反映最后一条转录的时间
            if (this.recordingSessionId !== null) {
                this.sessionManager.updateLastTextModified(this.recordingSessionId);
            } else if (this.sessionManager.currentSessionId) {
                this.sessionManager.updateLastTextModified(this.sessionManager.currentSessionId);
            }
        }
    }

    /**
     * 更新录制按钮的状态和外观
     */
    updateRecordingButtonState() {
        const recordBtn = document.getElementById("recordBtn");
        if (recordBtn) {
            if (this.recordingManager && this.recordingManager.isRecording) {
                recordBtn.textContent = "Stop";
                recordBtn.classList.add("active");
            } else {
                recordBtn.textContent = "Record";
                recordBtn.classList.remove("active");
            }
        }
    }

    clear() {
        this.recordingManager.clear();
        this.translationResults = {};
        this.translationManager.clear();
        this.chunkIndex = 0;
        this.currentTranscriptText = "";
        this.updateDisplay();
        if (this.keywordManager) {
            this.keywordManager.reset();
        }

        this.updateStatus("Cleared");
        this.updateSessionStats();

        // 直接覆盖当前 session 的转录内容为空（不使用合并逻辑）
        this.sessionManager.updateCurrentTranscripts({});
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        this.updateAutoScrollButton();
        // 如果开启自动滚动，立即滚动到底部
        if (this.autoScroll) {
            // 设置标志，防止滚动事件认为这是用户手动滚动
            this.isTogglingAutoScroll = true;
            this.isUpdatingUI = true;  // 防止scroll事件触发同步逻辑
            const transcript = document.getElementById("transcript");
            const translation = document.getElementById("translation");

            // 获取最后一行的索引并滚动到底部
            const keys = Object.keys(this.preciseResults);
            if (keys.length > 0) {
                const lastIndex = keys[keys.length - 1];

                // 临时改为 auto（直接跳转到底部）
                if (transcript) {
                    transcript.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(transcript, lastIndex);
                    transcript.style.scrollBehavior = 'smooth';
                }
                if (translation) {
                    translation.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(translation, lastIndex);
                    translation.style.scrollBehavior = 'smooth';
                }
            }

            // 200ms 后清除标志，足够长的时间来避免防抖和同步滚动的冲突
            setTimeout(() => {
                this.isTogglingAutoScroll = false;
                this.isUpdatingUI = false;
            }, 200);
        }
    }

    updateAutoScrollButton() {
        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            if (this.autoScroll) {
                // Hide button when auto scroll is ON
                floatingAutoScrollBtn.classList.add("hidden");
            } else {
                // Show button when auto scroll is OFF
                floatingAutoScrollBtn.classList.remove("hidden");
            }
        }
    }

    getVolume() {
        if (!this.analyser) return 0;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / dataArray.length);
    }

    async submitForTranscription() {
        if (this.audioChunks.length === 0) {
            return;
        }

        this.lastSendTime = Date.now();
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        // 记录请求时的 sessionId，用于后续保存到正确的 session
        // 如果正在录制，使用录制中的 session；否则使用当前显示的 session
        const sessionIdAtRequest = this.recordingSessionId || this.sessionManager.currentSessionId;
        const currentChunkIndex = this.chunkIndex;

        try {
            const response = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                console.error(`[ERROR] API error: ${response.status}`);
                return;
            }

            const result = await response.json();
            const text = result.text.trim();

            if (text) {
                const timestamp = new Date().toLocaleTimeString('zh-CN', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                // 直接保存到请求时的 session
                const transcriptData = { [currentChunkIndex]: { text, timestamp } };
                const saved = this.sessionManager.updateTranscriptsForSession(sessionIdAtRequest, transcriptData);

                if (saved) {
                    this.chunkIndex += 1;

                    // 只有在仍然在同一个 session 时，才更新本地显示
                    if (this.sessionManager.currentSessionId === sessionIdAtRequest) {
                        this.preciseResults[currentChunkIndex] = { text, timestamp };
                        this.updateDisplay();

                        // 自动翻译（保存到原来的录制session）
                        if (this.translationEnabled) {
                            const translationContext = this.recordingManager.getTranscriptionContext();
                            this.translationManager.translateText(text, currentChunkIndex, sessionIdAtRequest, translationContext);
                        }

                        // 关键词提取改为手动触发，注释掉自动调用
                        // this.processKeywords(sessionIdAtRequest);
                    } else {
                        // 如果已切换到其他 session，仅记录日志
                    }
                }
            }

        } catch (error) {
            console.error("[ERROR] Whisper request failed:", error);
        }
    }

    /**
     * 更新显示（使用RecordingManager的数据）
     */
    updateDisplay() {
        // 如果用户有活动选择，暂停更新（后台数据仍在更新）
        if (this.hasActiveSelection) {
            this.pendingUpdates = true;
            return;
        }

        // 重置待更新标志
        this.pendingUpdates = false;

        // 在DOM更新前设置标志，防止滚动事件改变autoScroll状态
        this.panelManager.isUpdatingUI = true;

        // 更新 session 统计信息
        this.updateSessionStats();

        const transcriptDiv = document.getElementById("transcript");
        const translationDiv = document.getElementById("translation");
        const preciseResults = this.recordingManager.getTranscriptData();
        const translationData = this.translationManager.getTranslationData();

        // 更新转录显示
        const formattedLines = Object.keys(preciseResults).map(key => {
            const item = preciseResults[key];
            if (!item || !item.text) return null;

            const text = item.text.trim();

            // 格式化时间戳为 HH:MM:SS
            let timestamp;
            if (item.timestamp) {
                let timeValue = item.timestamp;
                let timestamp_str = null;

                // 处理字符串格式的时间戳
                if (typeof timeValue === 'string') {
                    // 检查是否为 HH:MM:SS 格式
                    if (/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
                        timestamp_str = timeValue;
                    } else if (/^\d+$/.test(timeValue)) {
                        // 是纯数字字符串，当相对秒数处理
                        timeValue = parseInt(timeValue);
                    }
                }

                // 使用字符串格式或转换数字格式
                if (timestamp_str) {
                    timestamp = timestamp_str;
                } else if (typeof timeValue === 'number' && !isNaN(timeValue)) {
                    // timeValue 是相对秒数，需要根据session.startTime换算为实际时间
                    const session = this.sessionManager.getCurrentSession();
                    const sessionStartMs = session && session.startTime ? session.startTime : Date.now();
                    const actualTimeMs = sessionStartMs + timeValue * 1000;
                    const date = new Date(actualTimeMs);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    timestamp = `${hours}:${minutes}:${seconds}`;
                } else {
                    // 无法解析，使用当前时间
                    const now = new Date();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const seconds = String(now.getSeconds()).padStart(2, '0');
                    timestamp = `${hours}:${minutes}:${seconds}`;
                }
            } else {
                timestamp = new Date().toLocaleTimeString('zh-CN', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${text}</p>`;
        }).filter(line => line !== null);

        if (formattedLines.length > 0) {
            let displayHTML = formattedLines.join('');
            // 始终添加一个占位符行，用于显示状态或保持排版空间
            const statusText = (this.recordingManager.isRecording || this.recordingManager.isTranscribingActive())
                ? (this.recordingManager.isTranscribingActive() ? 'Transcripting...' : 'Listening...')
                : '';
            displayHTML += `<p class="placeholder">${statusText || '&nbsp;'}</p>`;
            transcriptDiv.innerHTML = displayHTML;
        } else if (this.recordingManager.isRecording) {
            // 正在录音但还没有转录内容
            transcriptDiv.innerHTML = '<p class="placeholder">Listening...</p>';
        } else if (this.recordingManager.isTranscribingActive()) {
            // 正在转录
            transcriptDiv.innerHTML = '<p class="placeholder">Transcripting...</p>';
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Start recording or add text</p>';
        }

        // 更新翻译显示（只在翻译面板可见时更新）
        this.updateTranslationDisplay();

        // 重新应用所有高亮
        this.highlightManager.reapplyAllHighlights();

        // 仅在自动滚动启用时滚动到底部
        if (this.panelManager.autoScroll) {
            const transcript = document.getElementById("transcript");
            const translation = document.getElementById("translation");

            const keys = Object.keys(preciseResults);
            if (keys.length > 0) {
                const lastIndex = keys[keys.length - 1];

                if (transcript) {
                    transcript.style.scrollBehavior = 'auto';
                    this.panelManager.scrollToLineBottom(transcript, lastIndex);
                }
                if (translation) {
                    translation.style.scrollBehavior = 'auto';
                    this.panelManager.scrollToLineBottom(translation, lastIndex);
                }
            }
        }

        // DOM更新完毕后，清除标志并重新检查滚动（确保autoScroll状态准确）
        setTimeout(() => {
            this.panelManager.isUpdatingUI = false;

            // 检查是否仍在底部，如果不在则确保autoScroll被正确禁用
            const transcript = document.getElementById("transcript");
            if (transcript && !this.panelManager.isScrolledToBottom(transcript)) {
                this.panelManager.autoScroll = false;
                this.panelManager.updateAutoScrollButton();
            }

            // 根据是否有内容来启用/禁用 edit 按钮（但录制时保持禁用）
            const editTextBtn = document.getElementById("editTextBtn");
            if (editTextBtn && this.recordingSessionId === null) {  // 只在不录制时更新状态
                const transcriptData = this.recordingManager.getTranscriptData();
                const hasContent = Object.keys(transcriptData).length > 0;
                editTextBtn.disabled = !hasContent;
                if (!hasContent) {
                    editTextBtn.style.opacity = "0.3";
                    editTextBtn.style.pointerEvents = "none";
                } else {
                    editTextBtn.style.opacity = "1";
                    editTextBtn.style.pointerEvents = "auto";
                }
            }
        }, 50);
    }

    /**
     * 更新翻译面板的显示（在翻译面板可见时调用）
     */
    updateTranslationDisplay() {
        const translationDiv = document.getElementById("translation");
        if (!translationDiv) return;

        // 检查翻译面板是否可见
        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.classList.contains('layout-full-transcript')) {
            // 翻译面板被隐藏，不需要更新
            return;
        }

        const preciseResults = this.recordingManager.getTranscriptData();
        const translationData = this.translationManager.getTranslationData();

        // 格式化翻译行
        const translationLines = Object.keys(preciseResults).map(key => {
            const item = preciseResults[key];
            if (!item || !item.text) return null;

            // 格式化时间戳为 HH:MM:SS
            let timestamp;
            if (item.timestamp) {
                let timeValue = item.timestamp;
                let timestamp_str = null;

                // 处理字符串格式的时间戳
                if (typeof timeValue === 'string') {
                    // 检查是否为 HH:MM:SS 格式
                    if (/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
                        timestamp_str = timeValue;
                    } else if (/^\d+$/.test(timeValue)) {
                        // 是纯数字字符串，当相对秒数处理
                        timeValue = parseInt(timeValue);
                    }
                }

                // 使用字符串格式或转换数字格式
                if (timestamp_str) {
                    timestamp = timestamp_str;
                } else if (typeof timeValue === 'number' && !isNaN(timeValue)) {
                    // timeValue 是相对秒数，需要根据session.startTime换算为实际时间
                    const session = this.sessionManager.getCurrentSession();
                    const sessionStartMs = session && session.startTime ? session.startTime : Date.now();
                    const actualTimeMs = sessionStartMs + timeValue * 1000;
                    const date = new Date(actualTimeMs);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    timestamp = `${hours}:${minutes}:${seconds}`;
                } else {
                    // 无法解析，使用当前时间
                    timestamp = new Date().toLocaleTimeString('zh-CN', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                }
            } else {
                timestamp = new Date().toLocaleTimeString('zh-CN', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }

            const translation = translationData[key];
            const translationText = translation || '<span class="placeholder">Translating...</span>';

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${translationText}</p>`;
        }).filter(line => line !== null);

        // 更新翻译面板内容
        if (translationLines.length > 0) {
            let translationHTML = translationLines.join('');
            // 始终添加一个占位符行，用于显示状态或保持排版空间
            const statusText = (this.recordingManager.isRecording || this.recordingManager.isTranscribingActive())
                ? (this.recordingManager.isTranscribingActive() ? 'Transcripting...' : 'Listening...')
                : '';
            translationHTML += `<p class="placeholder">${statusText || '&nbsp;'}</p>`;
            translationDiv.innerHTML = translationHTML;
        } else if (this.recordingManager.isRecording) {
            // 正在录音但还没有翻译内容
            translationDiv.innerHTML = '<p class="placeholder">Listening...</p>';
        } else if (this.recordingManager.isTranscribingActive()) {
            // 正在转录
            translationDiv.innerHTML = '<p class="placeholder">Transcripting...</p>';
        } else {
            translationDiv.innerHTML = '<p class="placeholder">Translations will appear here as you record</p>';
        }
    }

    /**
     * 在指定面板（转录或译文）中搜索词语并跳转到其位置
     * @param {string} word - 要搜索的词语
     * @param {string} sourcePanel - 源面板 ('transcript' 或 'translation')，默认 'transcript'
     */
    scrollToWord(word, sourcePanel = 'transcript') {
        if (!word) return;

        // 首先尝试使用已有的位置信息（如果有的话）
        if (this.keywordManager && this.keywordManager.highlightPositions[word]) {
            const positionInfo = this.keywordManager.highlightPositions[word];

            // 尝试使用 sourceIndices 或 startIndex 来定位
            if (positionInfo.sourceIndices && positionInfo.sourceIndices.length > 0) {
                // 检查是否跨越多行（多个sourceIndices表示跨行词）
                if (positionInfo.sourceIndices.length > 1) {
                    // 跨行词：需要高亮所有涉及的段落
                    if (this.scrollToWordByIndices(word, positionInfo.sourceIndices, sourcePanel)) {
                        return;
                    }
                } else {
                    // 单行词：使用第一个（也是唯一的）出现位置
                    const targetIndex = positionInfo.sourceIndices[0];
                    if (this.scrollToWordByIndex(word, targetIndex, sourcePanel)) {
                        return;
                    }
                }
            } else if (positionInfo.startIndex !== undefined) {
                // 使用 startIndex 来定位
                if (this.scrollToWordByIndex(word, positionInfo.startIndex, sourcePanel)) {
                    return;
                }
            }
        }

        // 如果没有位置信息，或位置信息定位失败，则回退到文本搜索
        this.scrollToWordByText(word, sourcePanel);
    }

    /**
     * 通过index在面板中定位词语
     * @param {string} word - 词语
     * @param {number} targetIndex - 目标片段的index
     * @param {string} sourcePanel - 源面板
     * @returns {boolean} 是否成功定位
     */
    scrollToWordByIndex(word, targetIndex, sourcePanel) {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        let primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        let secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) return false;

        // 查找指定index的段落元素
        const targetParagraph = primaryPanel.querySelector(`p[data-index="${targetIndex}"]`);

        if (!targetParagraph) {
            return false;
        }

        // 跳转到该段落
        targetParagraph.scrollIntoView({ behavior: 'auto', block: 'center' });

        // 高亮显示找到的词
        this.highlightWordInElement(targetParagraph, word);

        // 同时在另一个面板中高亮相同索引的段落（如果存在）
        if (secondaryPanel) {
            const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${targetIndex}"]`);
            if (secondaryParagraph) {
                this.highlightWordInElement(secondaryParagraph, word);
            }
        }

        this.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
        return true;
    }

    /**
     * 通过多个index在面板中定位跨行词语
     * @param {string} word - 词语
     * @param {Array<number>} targetIndices - 目标片段的index数组（用于跨行词）
     * @param {string} sourcePanel - 源面板
     * @returns {boolean} 是否成功定位
     */
    scrollToWordByIndices(word, targetIndices, sourcePanel) {
        if (!targetIndices || targetIndices.length === 0) {
            return false;
        }

        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        let primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        let secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) return false;

        // 获取第一个段落用于滚动
        const firstIndex = targetIndices[0];
        const firstParagraph = primaryPanel.querySelector(`p[data-index="${firstIndex}"]`);

        if (!firstParagraph) {
            return false;
        }

        // 滚动到第一个段落
        firstParagraph.scrollIntoView({ behavior: 'auto', block: 'center' });

        // 在所有涉及的段落中高亮显示词
        targetIndices.forEach(index => {
            const paragraph = primaryPanel.querySelector(`p[data-index="${index}"]`);
            if (paragraph) {
                this.highlightWordInElement(paragraph, word);
            }

            // 同时在另一个面板的相同索引段落中高亮（如果存在）
            if (secondaryPanel) {
                const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${index}"]`);
                if (secondaryParagraph) {
                    this.highlightWordInElement(secondaryParagraph, word);
                }
            }
        });

        this.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
        return true;
    }

    /**
     * 通过文本搜索在面板中定位词语（支持跨行搜索）
     * @param {string} word - 词语
     * @param {string} sourcePanel - 源面板
     */
    scrollToWordByText(word, sourcePanel = 'transcript') {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        // 根据源面板决定搜索和滚动位置
        let primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        let secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) {
            // 如果主面板不存在，尝试使用辅助面板
            primaryPanel = secondaryPanel;
            sourcePanel = sourcePanel === 'translation' ? 'transcript' : 'translation';
        }

        if (!primaryPanel) return;

        // 直接在每个段落中搜索词语，避免累计长度计算错误
        const lowerWord = word.toLowerCase();
        const paragraphs = primaryPanel.querySelectorAll("p");
        const paragraphArray = Array.from(paragraphs);
        let targetParagraphs = [];
        let targetIndices = [];

        // 首先尝试在单个段落中找到完整的词
        for (const p of paragraphArray) {
            const pText = p.innerText.toLowerCase();
            if (pText.includes(lowerWord)) {
                targetParagraphs = [p];
                targetIndices = [p.getAttribute("data-index")];
                break;
            }
        }

        // 如果单个段落中未找到，尝试跨行搜索（相邻段落）
        if (targetParagraphs.length === 0) {
            for (let i = 0; i < paragraphArray.length - 1; i++) {
                const p1 = paragraphArray[i];
                const p2 = paragraphArray[i + 1];
                const combinedText = (p1.innerText + " " + p2.innerText).toLowerCase();

                if (combinedText.includes(lowerWord)) {
                    // 找到跨行的词，添加两个段落
                    targetParagraphs = [p1, p2];
                    targetIndices = [p1.getAttribute("data-index"), p2.getAttribute("data-index")];
                    break;
                }
            }
        }

        if (targetParagraphs.length === 0) {
            this.showStatusMessage(`Word "${word}" not found in ${sourcePanel}`, 1500);
            return;
        }

        // 跳转到第一个段落
        targetParagraphs[0].scrollIntoView({ behavior: 'auto', block: 'center' });

        // 高亮显示找到的词 - 在目标面板的所有相关段落中
        targetParagraphs.forEach(p => {
            this.highlightWordInElement(p, word);
        });

        // 同时在另一个面板中高亮相同索引的段落（如果存在）
        if (secondaryPanel && targetIndices.length > 0) {
            targetIndices.forEach(index => {
                if (index !== null) {
                    const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${index}"]`);
                    if (secondaryParagraph) {
                        this.highlightWordInElement(secondaryParagraph, word);
                    }
                }
            });
        }

        this.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
    }

    /**
     * 在元素中高亮显示词语
     * @param {HTMLElement} element - 要搜索的元素
     * @param {string} word - 要高亮的词（可以是多词组合如"human events"）
     */
    highlightWordInElement(element, word) {
        if (!element || !word) {
            return;
        }

        // 清除之前的所有临时高亮
        const previousHighlights = element.querySelectorAll(".temp-word-highlight");
        previousHighlights.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
                parent.normalize();
            }
        });

        // 直接使用 innerHTML.replace() 处理高亮
        try {
            const originalHtml = element.innerHTML;
            let newHtml = originalHtml;
            let highlightCount = 0;

            // 首先尝试匹配完整的短语（带单词边界）
            const escapedWord = this.escapeRegex(word);
            const regex1 = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
            let tempHtml = originalHtml.replace(regex1, (match) => {
                highlightCount++;
                return `<span class="temp-word-highlight">${match}</span>`;
            });

            if (highlightCount > 0) {
                newHtml = tempHtml;
            } else {
                // 备用方法1：不使用单词边界尝试完整短语
                const regex2 = new RegExp(`(${escapedWord})`, 'gi');
                tempHtml = originalHtml.replace(regex2, (match) => {
                    highlightCount++;
                    return `<span class="temp-word-highlight">${match}</span>`;
                });

                if (highlightCount > 0) {
                    newHtml = tempHtml;
                } else {
                    // 备用方法2：如果是多词组合，尝试单独匹配每个词
                    // （用于处理跨行词，其中完整短语在单个段落中不存在）
                    const words = word.split(/\s+/);
                    if (words.length > 1) {
                        let multiWordHtml = originalHtml;
                        for (const singleWord of words) {
                            const escapedSingleWord = this.escapeRegex(singleWord);
                            // 先尝试词边界方式
                            const singleRegex1 = new RegExp(`\\b(${escapedSingleWord})\\b`, 'gi');
                            let singleHighlightCount = 0;
                            const tempHtml2 = multiWordHtml.replace(singleRegex1, (match) => {
                                singleHighlightCount++;
                                return `<span class="temp-word-highlight">${match}</span>`;
                            });

                            // 如果词边界方式有效，就用它
                            if (singleHighlightCount > 0) {
                                multiWordHtml = tempHtml2;
                                highlightCount += singleHighlightCount;
                            } else {
                                // 否则尝试不用词边界
                                const singleRegex2 = new RegExp(`(${escapedSingleWord})`, 'gi');
                                const tempHtml3 = multiWordHtml.replace(singleRegex2, (match) => {
                                    singleHighlightCount++;
                                    return `<span class="temp-word-highlight">${match}</span>`;
                                });
                                if (singleHighlightCount > 0) {
                                    multiWordHtml = tempHtml3;
                                    highlightCount += singleHighlightCount;
                                }
                            }
                        }
                        if (highlightCount > 0) {
                            newHtml = multiWordHtml;
                        }
                    }
                }
            }

            if (highlightCount > 0) {
                element.innerHTML = newHtml;
            }
        } catch (e) {
            return;
        }

        // 设置定时器，在4秒后移除高亮
        setTimeout(() => {
            const highlights = element.querySelectorAll(".temp-word-highlight");
            highlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    while (el.firstChild) {
                        parent.insertBefore(el.firstChild, el);
                    }
                    parent.removeChild(el);
                    parent.normalize();
                }
            });
        }, 4000);
    }

    /**
     * 转义正则表达式特殊字符
     * @param {string} str - 要转义的字符串
     * @returns {string} 转义后的字符串
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 格式化总结显示 - 根据不同风格进行HTML格式化
     * @param {string} summary - 总结文本
     * @param {string} style - 总结风格 (paragraph, key_takeaways, q&a)
     * @returns {string} 格式化后的HTML
     */
    formatSummaryDisplay(summary, style) {
        if (!summary) return '';

        switch (style) {
            case 'key_takeaways':
                return this.formatKeyTakeaways(summary);
            case 'q&a':
                return this.formatQAFormat(summary);
            case 'paragraph':
            default:
                return this.formatParagraph(summary);
        }
    }

    /**
     * 格式化段落风格
     */
    formatParagraph(summary) {
        return `<p>${summary.replace(/\n/g, '<br>')}</p>`;
    }

    /**
     * 格式化关键要点风格
     */
    formatKeyTakeaways(summary) {
        // 按 dash (-) 或数字列表分割
        const lines = summary.split(/\n/).filter(line => line.trim().length > 0);
        const items = lines
            .map(line => line.replace(/^[-•*]\s*/, '').trim())
            .filter(line => line.length > 0);

        if (items.length === 0) return `<p>${summary.replace(/\n/g, '<br>')}</p>`;

        const listHTML = items
            .map(item => `<li>${item.replace(/\n/g, '<br>')}</li>`)
            .join('');
        return `<ul>${listHTML}</ul>`;
    }

    /**
     * 格式化Q&A风格
     */
    formatQAFormat(summary) {
        const lines = summary.split(/\n/).filter(line => line.trim().length > 0);
        let html = '';
        let question = '';

        for (const line of lines) {
            if (line.trim().match(/^Q:|^问:|^Question:/i)) {
                if (question) {
                    html += `<div class="qa-pair"><div class="qa-question">${question}</div></div>`;
                }
                question = line.replace(/^Q:|^问:|^Question:/i, '').trim();
            } else if (line.trim().match(/^A:|^答:|^Answer:/i)) {
                if (question) {
                    const answer = line.replace(/^A:|^答:|^Answer:/i, '').trim();
                    html += `<div class="qa-pair"><div class="qa-question">${question}</div><div class="qa-answer">${answer.replace(/\n/g, '<br>')}</div></div>`;
                    question = '';
                }
            }
        }

        if (question) {
            html += `<div class="qa-pair"><div class="qa-question">${question}</div></div>`;
        }

        return html || `<p>${summary.replace(/\n/g, '<br>')}</p>`;
    }



    updateStatus(text) {
        document.getElementById("status").textContent = text;
        // 当status更新为"Listening..."或"Transcripting..."时，同步更新转录框显示
        if (text.includes("Listening") || text.includes("Transcripting")) {
            this.updateDisplay();
        }
    }

    /**
     * 切换模态窗口（打开或关闭）
     */
    toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modal.style.display === "none" || modal.style.display === "") {
            this.openModal(modalId);
        } else {
            this.closeModal(modalId);
        }
    }

    /**
     * 打开模态窗口
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = document.getElementById("modalOverlay");
        const button = this.getModalButton(modalId);

        if (!modal) return;

        // 如果有其他已打开的 modal，先关闭它们（一次只打开一个）
        if (this.openModals.size > 0) {
            this.openModals.forEach(id => {
                if (id !== modalId) {
                    const otherModal = document.getElementById(id);
                    const otherButton = this.getModalButton(id);
                    if (otherModal) {
                        otherModal.style.display = "none";
                        if (otherButton) {
                            otherButton.classList.remove("active");
                        }
                    }
                }
            });
            this.openModals.clear();
        }

        // 显示背景遮罩
        if (overlay) {
            overlay.style.display = "block";
            // 添加背景点击关闭功能
            overlay.onclick = () => this.closeModal(modalId);
        }

        // 显示模态窗口
        modal.style.display = "flex";
        this.openModals.add(modalId);

        // 更新按钮激活状态
        if (button) {
            button.classList.add("active");
        }

        // 禁用body滚动
        document.body.style.overflow = "hidden";
    }

    /**
     * 关闭模态窗口
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = document.getElementById("modalOverlay");
        const button = this.getModalButton(modalId);

        if (!modal) return;

        // 隐藏模态窗口
        modal.style.display = "none";
        this.openModals.delete(modalId);

        // 更新按钮激活状态
        if (button) {
            button.classList.remove("active");
        }

        // 如果没有其他打开的模态，隐藏背景遮罩
        if (this.openModals.size === 0) {
            if (overlay) {
                overlay.style.display = "none";
                overlay.onclick = null;
            }
            // 恢复body滚动
            document.body.style.overflow = "auto";
        }
    }

    /**
     * 关闭所有打开的模态窗口
     */
    closeAllModals() {
        const openModalsCopy = Array.from(this.openModals);
        openModalsCopy.forEach(modalId => {
            this.closeModal(modalId);
        });
    }

    /**
     * 获取模态对应的按钮
     */
    getModalButton(modalId) {
        if (modalId === "sessionModal") {
            return document.getElementById("openSessionPanel");
        } else if (modalId === "settingsModal") {
            return document.getElementById("quickAccessSettings");
        }
        return null;
    }

    /**
     * 显示临时状态消息（自动消失）
     * @param {String} message - 消息内容
     * @param {Number} duration - 消息显示时长（毫秒），默认 3000
     */
    showStatusMessage(message, duration = 3000) {
        const statusEl = document.getElementById("status");

        // 清除之前可能还在等待的状态消息超时
        if (this.statusMessageTimeout) {
            clearTimeout(this.statusMessageTimeout);
        }

        statusEl.textContent = message;

        this.statusMessageTimeout = setTimeout(() => {
            statusEl.textContent = "";
            this.statusMessageTimeout = null;
        }, duration);
    }

    /**
     * 更新highlight按钮的状态（文本和样式）
     * @param {string} word - 词条
     * @param {boolean} isHighlighted - 是否已高亮
     */
    updateHighlightButtonState(word, isHighlighted) {
        const btn = document.getElementById("highlight-current-word-btn");
        if (!btn) return;

        if (isHighlighted) {
            btn.textContent = "Remove";
            btn.classList.add("active");
        } else {
            btn.textContent = "Highlight";
            btn.classList.remove("active");
        }
    }

    /**
     * 更新录制指示器UI
     * 显示当前正在录制的session，并高亮session列表
     */
    updateRecordingIndicator() {
        const indicator = document.getElementById("recording-indicator");
        const sessionNameEl = document.getElementById("recording-session-name");

        if (this.recordingSessionId !== null) {
            // 显示录制指示器
            const recordingSession = this.sessionManager.getSession(this.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            sessionNameEl.textContent = recordingSessionName;
            indicator.style.display = "inline-block";

            // 高亮session列表中正在录制的session
            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                if (item.dataset.sessionId === this.recordingSessionId) {
                    item.classList.add("recording");
                } else {
                    item.classList.remove("recording");
                }
            });
        } else {
            // 隐藏录制指示器
            indicator.style.display = "none";

            // 移除所有session的录制高亮
            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                item.classList.remove("recording");
            });
        }
    }

    /**
     * 总结文本（使用用户选择的语言） - 流式版本
     */
    async summarizeText(text, forceRefresh = false, style = "paragraph") {
        if (!text || text.trim().length < 50) {
            return null;
        }

        try {
            const language = this.explanationLanguage;
            const cacheKey = `${language}-${style}`;

            // 检查该语言和风格组合的缓存（除非强制刷新）
            if (!forceRefresh && this.summaryCache[cacheKey]) {
                return this.summaryCache[cacheKey];
            }

            const response = await fetch("/api/summarize", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    language: language,
                    style: style
                })
            });

            if (!response.ok) {
                console.error(`[ERROR] Summarization API error: ${response.status}`);
                return null;
            }

            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let summary = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    summary += chunk;

                    // 实时更新显示
                    if (summary) {
                        // 按语言和风格缓存结果
                        this.summaryCache[cacheKey] = summary;
                        // 立即保存到session
                        this.saveSettingsToSession();
                        // 实时更新显示
                        const summaryDisplay = document.getElementById("summary-display");
                        if (summaryDisplay) {
                            summaryDisplay.innerHTML = this.formatSummaryDisplay(summary, style);
                        }
                    }
                }
                // 刷新解码器缓冲区，获取最后的字符
                const finalChunk = decoder.decode();
                summary += finalChunk;
                if (finalChunk) {
                    // 按语言和风格缓存结果
                    this.summaryCache[cacheKey] = summary;
                    // 立即保存到session
                    this.saveSettingsToSession();
                    // 实时更新显示
                    const summaryDisplay = document.getElementById("summary-display");
                    if (summaryDisplay) {
                        summaryDisplay.innerHTML = this.formatSummaryDisplay(summary, style);
                    }
                }
            } finally {
                reader.releaseLock();
            }

            if (summary) {
                return summary;
            }

            return null;

        } catch (error) {
            console.error("[ERROR] Summarization request failed:", error);
            throw error;
        }
    }

    /**
     * 处理关键词提取 - 基于整个转录文本
     */
    /**
     * 处理关键词提取 - 基于整个转录文本
     */
    async processKeywords(targetSessionId = null) {
        if (!this.keywordManager) return;

        // 收集所有转录文本（保证准确率）
        const preciseResults = this.recordingManager.getTranscriptData();
        this.currentTranscriptText = Object.values(preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.currentTranscriptText.length > 10) {

            // 基于整个文本提取关键词
            await this.keywordManager.processText(this.currentTranscriptText);

            // 更新所有显示
            this.keywordManager.updateAllKeywordDisplays();

            // 保存提取的关键词到当前 session
            const sessionId = targetSessionId || this.recordingSessionId || this.sessionManager.currentSessionId;
            if (sessionId && this.sessionManager) {
                this.sessionManager.updateKeywordsForSession(sessionId, this.keywordManager.extracts);
            }
        }
    }

    /**
     * 重新处理所有关键词（强度改变时使用）
     */
    async reprocessAllKeywords() {
        if (!this.keywordManager) return;

        // 获取当前的全文
        const preciseResults = this.recordingManager.getTranscriptData();
        this.currentTranscriptText = Object.values(preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.currentTranscriptText.length > 10) {

            // 清空自动提取的关键词（保留高亮的）
            this.keywordManager.extracts = [];

            // 重新提取
            await this.keywordManager.processText(this.currentTranscriptText);

            // 更新所有显示
            this.keywordManager.updateAllKeywordDisplays();
        }
    }


    /**
     * 获取视口中心对应的 data-index
     */
    getTopLineNumber(container) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return null;

        // 找首个完全或部分在视口内的元素
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const rect = p.getBoundingClientRect();
            // 如果元素的底部在视口顶端以下，说明这个元素在视口内或下方
            if (rect.bottom > 0) {
                return {
                    index: p.getAttribute('data-index'),
                    lineNumber: i
                };
            }
        }

        return null;
    }

    /**
     * 根据行号和偏移量将指定行滚动到顶端
     */
    scrollToLineNumberTop(container, lineNumber, offsetLines = 0) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return;

        // 计算目标行号，应用偏移
        let targetLineNumber = Math.max(0, Math.min(lineNumber + offsetLines, paragraphs.length - 1));

        const targetElement = paragraphs[targetLineNumber];
        const rect = targetElement.getBoundingClientRect();
        // 计算目标元素顶部位置
        const elementTop = container.scrollTop + rect.top;
        // 直接滚动使元素顶部对齐视口顶端
        container.scrollTop = elementTop;
    }

    /**
     * 根据行号和偏移量滚动到指定位置
     */
    scrollToLineNumberBottom(container, lineNumber, offsetLines = 0) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return;

        // 计算目标行号，应用偏移
        let targetLineNumber = Math.max(0, Math.min(lineNumber + offsetLines, paragraphs.length - 1));

        const targetElement = paragraphs[targetLineNumber];
        const rect = targetElement.getBoundingClientRect();
        // 计算目标元素底部位置
        const elementBottom = container.scrollTop + rect.bottom;
        // 计算视口底部位置
        const viewportBottom = container.scrollTop + container.clientHeight;
        // 计算需要滚动的距离，使元素底部接近视口底部（留20px边距）
        const scrollOffset = elementBottom - (viewportBottom - 20);

        container.scrollTop += scrollOffset;
    }

    /**
     * 滚动容器使指定 data-index 的元素居中
     */
    scrollToLineCenter(container, targetIndex) {
        const targetElement = container.querySelector(`p[data-index="${targetIndex}"]`);
        if (!targetElement) return;

        const rect = targetElement.getBoundingClientRect();
        const elementCenter = container.scrollTop + rect.top + rect.height / 2;
        const viewportCenter = container.scrollTop + container.clientHeight / 2;
        const scrollOffset = elementCenter - viewportCenter;

        container.scrollTop += scrollOffset;
    }

    /**
     * 滚动容器使指定 data-index 的元素靠近底部
     * 用于自动滚动模式，使最新内容总是显示在视口底部
     */
    scrollToLineBottom(container, targetIndex) {
        const targetElement = container.querySelector(`p[data-index="${targetIndex}"]`);
        if (!targetElement) return;

        const rect = targetElement.getBoundingClientRect();
        // 计算目标元素底部位置
        const elementBottom = container.scrollTop + rect.bottom;
        // 计算视口底部位置
        const viewportBottom = container.scrollTop + container.clientHeight;
        // 计算需要滚动的距离，使元素底部接近视口底部（留20px边距）
        const scrollOffset = elementBottom - (viewportBottom - 20);

        container.scrollTop += scrollOffset;
    }

    /**
     * 设置同步滚动 - 基于中心行对齐，原文框后移8个index
     */
    /**
     * 检测容器是否滑到底部
     */
    isScrolledToBottom(container, threshold = 10) {
        return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
    }

    setupSyncScroll() {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");
        const SCROLL_OFFSET = 8; // 原文框后移的行数

        if (!transcript || !translation) {
            return;
        }

        // 原文容器滚动时，同步译文容器
        transcript.addEventListener('scroll', () => {
            // 如果是用户手动滚动，关闭自动滚动（但不在 UI 更新期间）
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && this.autoScroll) {
                this.autoScroll = false;
                this.updateAutoScrollButton();
            }

            // 如果用户滑到底部，自动启用自动滚动（但不在 UI 更新期间）
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && !this.autoScroll && this.isScrolledToBottom(transcript)) {
                this.autoScroll = true;
                this.updateAutoScrollButton();
            }

            if (this.isSyncingScroll) return;

            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isSyncingScroll = true;

                // 获取原文顶端对应的行号
                const topInfo = this.getTopLineNumber(transcript);

                // 在译文中找到同样行号，但向前移SCROLL_OFFSET行
                // 这样原文比译文"后移"了SCROLL_OFFSET行
                if (topInfo) {
                    translation.style.scrollBehavior = 'auto';
                    this.scrollToLineNumberTop(translation, topInfo.lineNumber, -SCROLL_OFFSET);
                }

                setTimeout(() => {
                    this.isSyncingScroll = false;
                }, 200);
            }, 400); // 防抖 400ms
        });

        // 译文容器滚动时，同步原文容器
        translation.addEventListener('scroll', () => {
            // 如果是用户手动滚动，关闭自动滚动（但不在 UI 更新期间）
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && this.autoScroll) {
                this.autoScroll = false;
                this.updateAutoScrollButton();
            }

            // 如果用户滑到底部，自动启用自动滚动（但不在 UI 更新期间）
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && !this.autoScroll && this.isScrolledToBottom(translation)) {
                this.autoScroll = true;
                this.updateAutoScrollButton();
            }

            if (this.isSyncingScroll) return;

            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isSyncingScroll = true;

                // 获取译文顶端对应的行号
                const topInfo = this.getTopLineNumber(translation);

                // 在原文中找到同样行号，但向后移SCROLL_OFFSET行
                // 这样原文比译文"后移"了SCROLL_OFFSET行
                if (topInfo) {
                    transcript.style.scrollBehavior = 'auto';
                    this.scrollToLineNumberTop(transcript, topInfo.lineNumber, SCROLL_OFFSET);
                }

                setTimeout(() => {
                    this.isSyncingScroll = false;
                }, 200);
            }, 400); // 防抖 400ms
        });
    }
    /**
     * 删除关键词
     */
    deleteKeyword(keyword) {
        if (!this.keywordManager) return;

        // 检查该词是否正在解释面板中显示
        const currentWordEl = document.getElementById("current-explanation-word");
        const currentWord = currentWordEl?.textContent?.trim();
        const isCurrentlyExplaining = currentWord === keyword;

        // 从高亮或自动提取的关键词中删除
        const highlightIndex = this.keywordManager.highlights.indexOf(keyword);
        const extractIndex = this.keywordManager.extracts.indexOf(keyword);

        if (highlightIndex > -1) {
            this.keywordManager.highlights.splice(highlightIndex, 1);
            // 如果是高亮词，移除其高亮显示
            this.highlightManager.removeHighlightFromTranscript(keyword);
        } else if (extractIndex > -1) {
            this.keywordManager.extracts.splice(extractIndex, 1);
        } else {
            return;  // 关键词不存在
        }

        // 更新所有显示
        this.keywordManager.updateAllKeywordDisplays();

        // 如果被删除的词正在解释面板中显示，更新按钮状态
        if (isCurrentlyExplaining) {
            this.updateHighlightButtonState(keyword, false);
        }

        // 分别保存高亮和关键词
        this.sessionManager.updateCurrentHighlights(this.keywordManager.highlights);
        this.sessionManager.updateCurrentKeywords(this.keywordManager.extracts);

        this.showStatusMessage(`Removed "${keyword}"`, 1200);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.streamNoteInstance = new StreamNote();
});