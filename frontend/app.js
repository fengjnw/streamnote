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

        // === 初始化管理器 ===
        this.initSessionManager();
        this.initRecordingManager();
        this.initPanelManager();
        this.initTranslationManager();
        this.initSettingsPanel();
        this.initHighlightManager();
        this.initKeywordManager();
        this.setupUIListeners();
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
            }
        });
    }

    /**
     * 初始化面板管理器
     */
    initPanelManager() {
        this.panelManager = new PanelManager({
            onLayoutChange: (layout) => {
                this.translationEnabled = layout.translationEnabled;
                if (this.translationManager) {
                    this.translationManager.setEnabled(this.translationEnabled);
                }
                this.saveSettingsToSession();
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

        // 获取当前 session
        const currentSession = this.sessionManager.getCurrentSession();
        const isCurrentSession = sessionId === this.sessionManager.currentSessionId;

        if (isCurrentSession) {
            // 只有在仍然在同一个 session 时，才更新本地显示
            const transcriptData = this.recordingManager.getTranscriptData();
            transcriptData[index] = { text, timestamp };
            this.updateDisplay();

            // 自动翻译
            if (this.translationEnabled) {
                this.translationManager.translateText(text, index, sessionId);
            }
        }
    }

    /**
     * 初始化显示/隐藏状态
     */
    initializeVisibility() {
        // 加载保存的布局偏好或使用默认的split view
        this.panelManager.loadPanelState();
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
            this.showStatusMessage(`💬 Recording in "${recordingSessionName}" will continue in background`, 3000);
        }

        // 更新录制指示器UI
        this.updateRecordingIndicator();

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

        // 更新解释语言选择器
        const keywordExplanationLangSelector = document.getElementById("keyword-explanation-language");
        if (keywordExplanationLangSelector) {
            keywordExplanationLangSelector.value = this.explanationLanguage;
        }

        // 加载转录内容到 RecordingManager
        this.recordingManager.setTranscriptData(session.transcripts || {});
        this.panelManager.setTranscriptData(session.transcripts || {});

        // 加载当前语言的翻译内容到 TranslationManager
        const translationsForLanguage = (session.translations && session.translations[this.language])
            ? { ...session.translations[this.language] }
            : {};
        this.translationManager.setLanguage(this.language);
        this.translationManager.setTranslationData(translationsForLanguage);
        this.translationResults = translationsForLanguage; // 保留兼容性

        // 加载缓存数据
        this.summaryCache = session.summaryCache ? { ...session.summaryCache } : {};

        // 恢复高亮ID映射（如果存在）
        if (session.highlightIdMap) {
            this.highlightIdMap = { ...session.highlightIdMap };
            if (this.highlightManager) {
                this.highlightManager.setHighlightIdMap(this.highlightIdMap);
            }
        }
        if (this.keywordManager) {
            this.keywordManager.reset();

            // 恢复自动提取的关键词
            if (session.keywords && session.keywords.length > 0) {
                this.keywordManager.extracts = [...session.keywords];
            }

            // 恢复用户高亮的关键词
            if (session.highlights && session.highlights.length > 0) {
                this.keywordManager.highlights = [...session.highlights];
            } else {
                this.keywordManager.highlights = [];
            }

            // 恢复在解释面板查询过的词
            if (session.explanations && session.explanations.length > 0) {
                this.keywordManager.explanations = [...session.explanations];
            } else {
                this.keywordManager.explanations = [];
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
        }

        // 更新显示（会应用当前的翻译开关状态和高亮）
        this.initializeVisibility();

        // 应用session保存的布局，或使用全局默认布局
        let layoutToApply = "split";
        if (session.settings && session.settings.layout) {
            layoutToApply = session.settings.layout;
        } else {
            // 向后兼容：如果session没有layout字段，使用全局默认
            const defaultSettings = this.sessionManager.getDefaultSettings();
            layoutToApply = defaultSettings.defaultLayout || "split";
        }

        this.panelManager.setLayout(layoutToApply);

        // 更新布局选择器的值
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            layoutSelector.value = layoutToApply;
        }

        // 清空 Summary 显示
        const summaryDisplay = document.getElementById("summary-display");
        if (summaryDisplay) {
            // 检查当前语言是否有缓存，有就直接显示
            if (this.summaryCache && this.summaryCache[this.language]) {
                const cachedSummary = this.summaryCache[this.language];
                summaryDisplay.innerHTML = `<p>${cachedSummary.replace(/\n/g, '<br>')}</p>`;
            } else {
                summaryDisplay.innerHTML = '<p class="placeholder">Click the button to generate summary</p>';
            }
        }

        this.updateDisplay();

        // 更新关键词显示（高亮已在updateDisplay内的reapplyAllHighlights中应用）
        if (this.keywordManager) {
            this.keywordManager.updateAllKeywordDisplays();
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

        // 显示 session 创建日期 (ISO 8601 format: YYYY-MM-DD HH:MM:SS)
        const startTime = session.startTime || Date.now();
        const dateDisplay = document.getElementById('sessionDateDisplay');
        if (dateDisplay) {
            const date = new Date(startTime);
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
            this.sessionManager.updateCurrentExplanations(this.keywordManager.explanations);

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
    }

    /**
     * 保存布局选择状态
     */
    savePanelState() {
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            localStorage.setItem('layoutPreference', layoutSelector.value);
        }
    }

    /**
     * 加载布局选择状态
     */
    loadPanelState() {
        const layoutPreference = localStorage.getItem('layoutPreference') || 'split';
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            layoutSelector.value = layoutPreference;
            this.setLayout(layoutPreference);
        }
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
            panelManager: this.panelManager
        });

        // 使 KeywordManager 全局可访问
        window.keywordManagerInstance = this.keywordManager;
    }

    setupUIListeners() {
        document.getElementById("startBtn").addEventListener("click", () => this.start());
        document.getElementById("stopBtn").addEventListener("click", () => this.stop());
        document.getElementById("clearBtn").addEventListener("click", () => this.clear());

        // 布局选择器已由 PanelManager 处理
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            layoutSelector.addEventListener("change", (e) => {
                // 保存布局选择到当前session的settings
                this.sessionManager.updateCurrentSettings({
                    layout: e.target.value
                });
            });
        }

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

                // 更新 Summary 显示
                const summaryDisplay = document.getElementById("summary-display");
                if (summaryDisplay) {
                    if (this.summaryCache && this.summaryCache[this.language]) {
                        const cachedSummary = this.summaryCache[this.language];
                        summaryDisplay.innerHTML = `<p>${cachedSummary.replace(/\n/g, '<br>')}</p>`;
                    } else {
                        summaryDisplay.innerHTML = '<p class="placeholder">Click the button to generate summary</p>';
                    }
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

                // 如果keyword manager存在，刷新显示
                if (this.keywordManager) {
                    this.keywordManager.displayExplanations();
                    // 刷新所有已展开的解释（用新语言重新生成）
                    this.keywordManager.refreshExpandedExplanations();
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
                    this.showStatusMessage("✓ Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    this.showStatusMessage("✗ Failed to extract keywords", 2000);
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
        const historyContent = document.getElementById("historyContent");
        const settingsContent = document.getElementById("settingsContent");
        const highlightsContent = document.getElementById("highlightsContent");
        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessSummary = document.getElementById("quickAccessSummary");
        const quickAccessHistory = document.getElementById("quickAccessHistory");
        const quickAccessSettings = document.getElementById("quickAccessSettings");
        const quickAccessHighlights = document.getElementById("quickAccessHighlights");

        // Hide all content
        const hideAllContent = () => {
            keywordsContent.classList.remove("active");
            summaryContent.classList.remove("active");
            historyContent.classList.remove("active");
            settingsContent.classList.remove("active");
            highlightsContent.classList.remove("active");
            // Clear active state from all quick access buttons
            quickAccessKeywords.classList.remove("active");
            quickAccessSummary.classList.remove("active");
            quickAccessHistory.classList.remove("active");
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
            } else if (contentEl === historyContent) {
                quickAccessHistory.classList.add("active");
            } else if (contentEl === settingsContent) {
                quickAccessSettings.classList.add("active");
            } else if (contentEl === highlightsContent) {
                quickAccessHighlights.classList.add("active");
            }

            // Show/hide language selector based on active tab
            const explanationLangSelector = document.getElementById("keyword-explanation-language");

            if (explanationLangSelector) {
                explanationLangSelector.style.display = (contentEl === keywordsContent || contentEl === historyContent || contentEl === summaryContent || contentEl === highlightsContent) ? 'block' : 'none';
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
                quickAccessHistory.classList.remove("active");
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

        if (quickAccessHistory) {
            quickAccessHistory.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = historyContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessHistory.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(historyContent, "Explanation");
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
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = settingsContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessSettings.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    // 初始化设置面板的默认值
                    this.settingsPanel.initialize();
                    showContent(settingsContent, "Settings");
                }
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
        const copySummaryBtn = document.getElementById("copySummaryBtn");
        const summaryDisplay = document.getElementById("summary-display");

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
                regenerateSummaryBtn.title = "Generating...";
                copySummaryBtn.disabled = true;

                try {
                    const summary = await this.summarizeText(textToSummarize, true);  // forceRefresh=true
                    if (summary) {
                        summaryDisplay.innerHTML = `<p>${summary.replace(/\n/g, '<br>')}</p>`;
                        copySummaryBtn.disabled = false;
                    } else {
                        summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
                    }
                } catch (error) {
                    console.error("[SUMMARY] Error:", error);
                    summaryDisplay.innerHTML = `<p class="placeholder">Error: ${error.message}</p>`;
                } finally {
                    regenerateSummaryBtn.disabled = false;
                    regenerateSummaryBtn.title = "Regenerate Summary";
                }
            });
        }

        if (copySummaryBtn) {
            copySummaryBtn.addEventListener("click", () => {
                const summaryText = summaryDisplay.innerText;
                if (summaryText && summaryText !== "Click the button to generate summary") {
                    navigator.clipboard.writeText(summaryText).then(() => {
                        const originalText = copySummaryBtn.textContent;
                        copySummaryBtn.textContent = '✓ Copied';
                        setTimeout(() => {
                            copySummaryBtn.textContent = originalText;
                        }, 2000);
                    }).catch(err => {
                        console.error("Failed to copy:", err);
                        alert("Failed to copy summary");
                    });
                } else {
                    alert("Please generate a summary first");
                }
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
                reExtractKeywordsBtn.textContent = '🔄 Extracting...';

                try {
                    await this.processKeywords(this.recordingSessionId || this.sessionManager.currentSessionId);
                    this.showStatusMessage("✓ Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    this.showStatusMessage("✗ Failed to extract keywords", 2000);
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
                    this.showStatusMessage("✓ Keywords cleared", 1500);
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
                    this.keywordManager.displayHighlights();
                    this.saveToSession();
                    this.showStatusMessage("✓ Highlights cleared", 1500);
                }
            });
        }

        // Clear explanations button
        const clearExplanationsBtn = document.getElementById("clearExplanationsBtn");
        if (clearExplanationsBtn) {
            clearExplanationsBtn.addEventListener("click", () => {
                if (!this.keywordManager || this.keywordManager.explanations.length === 0) {
                    this.showStatusMessage("No explanations to clear", 1500);
                    return;
                }

                if (confirm("Clear all explanation history? This cannot be undone.")) {
                    this.keywordManager.explanations = [];
                    this.keywordManager.explanationCache = {};
                    this.keywordManager.displayExplanations();
                    this.saveToSession();
                    this.showStatusMessage("✓ Explanation history cleared", 1500);
                }
            });
        }

        const clearSummaryBtn = document.getElementById("clearSummaryBtn");
        if (clearSummaryBtn) {
            clearSummaryBtn.addEventListener("click", () => {
                const summaryDisplay = document.getElementById("summary-display");
                if (summaryDisplay) {
                    summaryDisplay.innerHTML = '<p class="placeholder">Click the button to generate summary</p>';
                    this.showStatusMessage("✓ Summary cleared", 1500);
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

        // 监听选中变化（使用防抖避免频繁更新）
        let selectionTimeout;
        document.addEventListener("selectionchange", () => {
            clearTimeout(selectionTimeout);
            // 延迟更新，让浏览器完成选择后再响应
            selectionTimeout = setTimeout(showFloatingMenu, 50);
        });

        // 监听鼠标释放，确保选择完成后立即显示菜单
        document.addEventListener("mouseup", () => {
            showFloatingMenu();
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
                // 通过 KeywordManager 统一处理显示解释面板的逻辑
                this.keywordManager.showExplanationPanel(term);
            }
            floatingMenu.classList.add("hidden");
            // 清除选中文本
            window.getSelection().removeAllRanges();
        });

        // 高亮按钮点击事件
        floatingHighlightBtn.addEventListener("click", () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                this.showStatusMessage("No text selected", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            const range = selection.getRangeAt(0);
            const selectedText = selection.toString().trim();

            if (!selectedText) {
                this.showStatusMessage("No text selected", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            this.highlightManager.addSelectedTextAsHighlightWithRange(selectedText, range);

            // 使用统一的showContent逻辑打开Highlights面板
            showContent.call(this, highlightsContent, "Highlights");

            floatingMenu.classList.add("hidden");
            // 清除选中文本
            window.getSelection().removeAllRanges();
        });
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

            await this.recordingManager.start(this.recordingSessionId);

            document.getElementById("startBtn").disabled = true;
            document.getElementById("stopBtn").disabled = false;

            // 每秒更新 session 统计信息
            let statsInterval = setInterval(() => {
                if (!this.recordingManager.isRecording) {
                    clearInterval(statsInterval);
                    return;
                }
                this.updateSessionStats();
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

            document.getElementById("startBtn").disabled = false;
            document.getElementById("stopBtn").disabled = true;

            // 停止时更新一次统计信息
            this.updateSessionStats();
        }
    }

    clear() {
        this.preciseResults = {};
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

        // 保存到当前 session
        this.saveToSession();
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

    async sendToWhisper() {
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
                            this.translationManager.translateText(text, currentChunkIndex, sessionIdAtRequest);
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
            const timestamp = item.timestamp || new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${text}</p>`;
        }).filter(line => line !== null);

        if (formattedLines.length > 0) {
            transcriptDiv.innerHTML = formattedLines.join('');
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Click "Record" to begin transcription</p>';
        }

        // 更新翻译显示
        const translationLines = Object.keys(preciseResults).map(key => {
            const item = preciseResults[key];
            if (!item || !item.text) return null;

            const timestamp = item.timestamp || new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const translation = translationData[key];
            const translationText = translation || '<span class="placeholder">Translating...</span>';

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${translationText}</p>`;
        }).filter(line => line !== null);

        if (translationLines.length > 0) {
            translationDiv.innerHTML = translationLines.join('');
        } else {
            translationDiv.innerHTML = '<p class="placeholder">Click "Record" to begin translation</p>';
        }

        // 重新应用所有高亮
        this.highlightManager.reapplyAllHighlights();

        // 仅在自动滚动启用时滚动到底部
        if (this.panelManager.autoScroll) {
            this.panelManager.isUpdatingUI = true;
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

            setTimeout(() => {
                this.panelManager.isUpdatingUI = false;
            }, 100);
        }
    }

    updateStatus(text) {
        document.getElementById("status").textContent = text;
    }

    /**
     * 显示临时状态消息（自动消失）
     * @param {String} message - 消息内容
     * @param {Number} duration - 消息显示时长（毫秒），默认 3000
     */
    showStatusMessage(message, duration = 3000) {
        const statusEl = document.getElementById("status");
        const originalText = statusEl.textContent;
        statusEl.textContent = message;

        setTimeout(() => {
            if (statusEl.textContent === message) {
                statusEl.textContent = originalText;
            }
        }, duration);
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
    async summarizeText(text, forceRefresh = false) {
        if (!text || text.trim().length < 50) {
            return null;
        }

        try {
            const language = this.language;

            // 检查该语言的缓存（除非强制刷新）
            if (!forceRefresh && this.summaryCache[language]) {
                return this.summaryCache[language];
            }

            const response = await fetch("/api/summarize", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    language: language
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
                        // 按语言缓存结果
                        this.summaryCache[language] = summary;
                        // 立即保存到session
                        this.saveSettingsToSession();
                        // 实时更新显示
                        const summaryDisplay = document.getElementById("summary-display");
                        if (summaryDisplay) {
                            summaryDisplay.innerHTML = `<p>${summary.replace(/\n/g, '<br>')}</p>`;
                        }
                    }
                }
                // 刷新解码器缓冲区，获取最后的字符
                const finalChunk = decoder.decode();
                summary += finalChunk;
                if (finalChunk) {
                    // 按语言缓存结果
                    this.summaryCache[language] = summary;
                    // 立即保存到session
                    this.saveSettingsToSession();
                    // 实时更新显示
                    const summaryDisplay = document.getElementById("summary-display");
                    if (summaryDisplay) {
                        summaryDisplay.innerHTML = `<p>${summary.replace(/\n/g, '<br>')}</p>`;
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

        // 分别保存高亮和关键词
        this.sessionManager.updateCurrentHighlights(this.keywordManager.highlights);
        this.sessionManager.updateCurrentKeywords(this.keywordManager.extracts);

        this.showStatusMessage(`✓ Removed "${keyword}"`, 1200);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.streamNoteInstance = new StreamNote();
});