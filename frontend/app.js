class StreamNote {
    constructor() {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.preciseResults = {};
        this.chunkIndex = 0;
        this.startTime = null;
        this.audioChunks = [];
        this.durationInterval = null;
        this.statsUpdateInterval = null;

        // 停顿检测
        this.audioContext = null;
        this.analyser = null;
        this.silenceStart = null;
        this.voiceStart = null;
        this.lastSendTime = null;
        this.recordingStartTime = null;
        this.hasVoice = false;
        this.checkInterval = null;

        // 关键词提取器
        this.keywordExtractor = null;
        this.currentTranscriptText = "";

        // Session 管理器
        this.sessionManager = null;

        // 翻译功能
        this.translationResults = {};
        this.translationEnabled = true;
        this.targetLanguage = "Chinese";

        // 关键词解释功能
        this.keywordExplanationLanguage = "original";

        // 全局转录状态（跨 session）
        this.recordingSessionId = null;  // 记录当前正在转录的 session
        this.displaySessionId = null;    // 当前显示的 session（用户看到的）

        // 同步滚动
        this.isSyncingScroll = false;
        this.scrollTimeout = null;

        // 自动滚动开关
        this.autoScroll = true;
        this.isTogglingAutoScroll = false;  // 用户刚刚点击了自动滚动按钮

        // 文本选中菜单
        this.selectedText = "";
        this.selectedTextElement = null;

        this.initSessionManager();
        this.setupUIListeners();
        this.initKeywordExtractor();
        this.loadCurrentSession();

        // 延迟设置同步滚动，确保元素已加载
        setTimeout(() => {
            this.setupSyncScroll();
            this.initializeVisibility();
            // 设置容器为 auto 滚动行为（而不是 smooth）
            const transcriptContainer = document.querySelector(".transcript-container");
            const translationContainer = document.querySelector(".translation-container");
            if (transcriptContainer) {
                transcriptContainer.style.scrollBehavior = 'auto';
            }
            if (translationContainer) {
                translationContainer.style.scrollBehavior = 'auto';
            }
        }, 100);
    }

    /**
     * 初始化显示/隐藏状态
     */
    initializeVisibility() {
        // 根据翻译开关状态设置译文容器显示/隐藏
        const translationToggle = document.getElementById("translation-toggle");
        if (translationToggle) {
            const translationContainer = document.querySelector(".translation-container");

            if (translationContainer) {
                translationContainer.style.display = translationToggle.checked ? 'flex' : 'none';
            }
        }

        // 关键词不再在main-content中，现在在侧面板中，所以无需在这里处理显示/隐藏
        // 侧面板由打开/关闭按钮控制
    }

    /**
     * 初始化 Session 管理器
     */
    initSessionManager() {
        this.sessionManager = new SessionManager();

        // 监听 session 切换事件
        window.addEventListener('sessionChanged', (e) => {
            console.log('[StreamNote] Session changed:', e.detail.sessionId);
            this.loadCurrentSession();
        });

        console.log('[StreamNote] SessionManager initialized');
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
        // 如果有其他 session 在录制，显示提示
        if (this.recordingSessionId !== null && this.recordingSessionId !== this.sessionManager.currentSessionId) {
            const recordingSession = this.sessionManager.getSession(this.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            this.showStatusMessage(`💬 Recording in "${recordingSessionName}" will continue in background`, 3000);
        }

        // 更新录制指示器UI
        this.updateRecordingIndicator();

        // 恢复功能设置
        if (session.settings) {
            this.translationEnabled = session.settings.translationEnabled;
            this.targetLanguage = session.settings.targetLanguage;
            this.keywordExplanationLanguage = session.settings.keywordExplanationLanguage || "original";

            // 更新 UI 控件状态
            const translationToggle = document.getElementById("translation-toggle");
            if (translationToggle) {
                translationToggle.checked = this.translationEnabled;
            }

            const languageSelector = document.getElementById("target-language");
            if (languageSelector) {
                languageSelector.value = this.targetLanguage;
            }

            const explanationLanguageSelector = document.getElementById("keyword-explanation-language");
            if (explanationLanguageSelector) {
                explanationLanguageSelector.value = this.keywordExplanationLanguage;
            }

            const keywordToggle = document.getElementById("keyword-toggle");
            if (keywordToggle) {
                keywordToggle.checked = session.settings.keywordEnabled;
            }

            const intensitySlider = document.getElementById("keyword-intensity");
            const intensityValue = document.getElementById("intensity-value");
            if (intensitySlider) {
                intensitySlider.value = session.settings.keywordIntensity;
            }
            if (intensityValue) {
                intensityValue.textContent = session.settings.keywordIntensity;
            }

            // 更新关键词提取器的设置
            if (this.keywordExtractor) {
                this.keywordExtractor.setEnabled(session.settings.keywordEnabled);
                this.keywordExtractor.setIntensity(session.settings.keywordIntensity);

                // 恢复解释缓存
                if (session.settings.explanationCache) {
                    this.keywordExtractor.explanationCache = { ...session.settings.explanationCache };
                    console.log(`[StreamNote] Restored ${Object.keys(this.keywordExtractor.explanationCache).length} cached explanations`);
                }

                // 恢复查询历史
                if (session.settings.queryHistory && Array.isArray(session.settings.queryHistory)) {
                    this.keywordExtractor.queryHistory = [...session.settings.queryHistory];
                    console.log(`[StreamNote] Restored ${this.keywordExtractor.queryHistory.length} query history items`);
                    this.keywordExtractor.displayQueryHistory();
                } else {
                    this.keywordExtractor.queryHistory = [];
                    this.keywordExtractor.displayQueryHistory();
                }
            }
        }

        // 加载转录内容
        this.preciseResults = { ...session.transcripts };
        this.chunkIndex = Object.keys(this.preciseResults).length;

        // 加载当前语言的翻译内容
        const currentLang = this.targetLanguage || "Chinese";
        this.translationResults = (session.translations && session.translations[currentLang])
            ? { ...session.translations[currentLang] }
            : {};

        // 更新显示（会应用当前的翻译开关状态）
        this.initializeVisibility();
        this.updateDisplay();

        // 重置并恢复关键词
        if (this.keywordExtractor) {
            this.keywordExtractor.reset();

            // 如果关键词功能开启且有保存的关键词，恢复它们
            if (session.settings.keywordEnabled && session.keywords && session.keywords.length > 0) {
                this.keywordExtractor.allCollectedKeywords = [...session.keywords];

                // 显示关键词
                const keywordsDisplay = document.getElementById("keywords-display");
                if (keywordsDisplay) {
                    this.keywordExtractor.displayKeywordsList(session.keywords, keywordsDisplay);
                }
            } else {
                // 没有关键词，清空显示
                const keywordsDisplay = document.getElementById("keywords-display");
                if (keywordsDisplay) {
                    keywordsDisplay.innerHTML = '<p class="placeholder">Keywords will appear here...</p>';
                }
            }
        }

        console.log(`[StreamNote] Loaded session: ${session.name}`, session.settings);
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

        // 计算会话时长
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const durationDisplay = document.getElementById('sessionDurationDisplay');
        if (durationDisplay) {
            durationDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }

        // 计算转录字数
        let totalChars = 0;
        if (session.transcripts) {
            Object.values(session.transcripts).forEach(text => {
                totalChars += (text || '').length;
            });
        }
        const charCountDisplay = document.getElementById('sessionCharCountDisplay');
        if (charCountDisplay) {
            charCountDisplay.textContent = totalChars.toLocaleString();
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
        if (this.translationEnabled && this.targetLanguage) {
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
                translationLangDisplay.textContent = langNames[this.targetLanguage] || this.targetLanguage;
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
        this.sessionManager.updateTranscriptsForSession(sessionId, this.preciseResults);

        // 保存关键词
        if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords) {
            this.sessionManager.updateCurrentKeywords(this.keywordExtractor.allCollectedKeywords);
        }

        // 保存翻译（按当前语言保存）
        if (this.translationResults) {
            this.sessionManager.updateCurrentTranslations(this.translationResults, this.targetLanguage);
        }

        // 保存功能设置
        const settings = {
            translationEnabled: this.translationEnabled,
            targetLanguage: this.targetLanguage,
            keywordEnabled: this.keywordExtractor ? this.keywordExtractor.enabled : true,
            keywordIntensity: this.keywordExtractor ? this.keywordExtractor.intensity : 5,
            keywordExplanationLanguage: this.keywordExplanationLanguage,
            explanationCache: this.keywordExtractor ? this.keywordExtractor.explanationCache : {},
            queryHistory: this.keywordExtractor ? this.keywordExtractor.queryHistory : []
        };
        this.sessionManager.updateCurrentSettings(settings);
    }

    /**
     * 单独保存设置到 session（用于UI控件修改时）
     */
    saveSettingsToSession() {
        if (!this.sessionManager) return;

        const settings = {
            translationEnabled: this.translationEnabled,
            targetLanguage: this.targetLanguage,
            keywordEnabled: this.keywordExtractor ? this.keywordExtractor.enabled : true,
            keywordIntensity: this.keywordExtractor ? this.keywordExtractor.intensity : 5,
            keywordExplanationLanguage: this.keywordExplanationLanguage,
            explanationCache: this.keywordExtractor ? this.keywordExtractor.explanationCache : {},
            queryHistory: this.keywordExtractor ? this.keywordExtractor.queryHistory : []
        };
        this.sessionManager.updateCurrentSettings(settings);
    }

    /**
     * 初始化关键词提取器
     */
    initKeywordExtractor() {
        this.keywordExtractor = new KeywordExtractor({
            apiUrl: "http://localhost:5001/api/extract-keywords",
            transcriptElement: document.getElementById("transcript"),
            keywordElement: document.getElementById("keywords-display"),
            topK: 5
        });

        // 使 KeywordExtractor 全局可访问
        window.keywordExtractorInstance = this.keywordExtractor;

        // 绑定开关
        const toggleCheckbox = document.getElementById("keyword-toggle");
        if (toggleCheckbox) {
            toggleCheckbox.addEventListener("change", (e) => {
                this.keywordExtractor.setEnabled(e.target.checked);

                // 显示/隐藏关键词区域
                const keywordsSection = document.querySelector(".keywords-section");
                if (keywordsSection) {
                    keywordsSection.style.display = e.target.checked ? 'flex' : 'none';
                }

                if (e.target.checked) {
                    // 重新打开时，恢复已有的关键词显示和高亮
                    const keywordsDisplay = document.getElementById("keywords-display");
                    if (this.keywordExtractor.allCollectedKeywords.length > 0) {
                        // 恢复关键词显示
                        if (keywordsDisplay) {
                            this.keywordExtractor.displayKeywordsList(
                                this.keywordExtractor.allCollectedKeywords,
                                keywordsDisplay
                            );
                        }
                        // 恢复高亮
                        // 高亮功能已删除

                        // 恢复译文关键词（如果翻译功能开启）如果没有禁用，也保留这个调用
                        // 但我们已经删除了高亮，所以可以删除这一行
                        // 实际上这个代码段应该也被删掉，但让我检查一下上下文
                        // 重新看一遍第292行
                    } else {
                        // 如果没有缓存的关键词，显示占位文本
                        if (keywordsDisplay) {
                            keywordsDisplay.innerHTML = '<p class="placeholder">Keywords will appear here...</p>';
                        }
                    }
                }

                // 保存设置到 session
                this.saveSettingsToSession();
            });
        }

        // 绑定强度滑块
        const intensitySlider = document.getElementById("keyword-intensity");
        const intensityValue = document.getElementById("intensity-value");
        if (intensitySlider) {
            intensitySlider.addEventListener("input", async (e) => {
                const intensity = parseInt(e.target.value);
                this.keywordExtractor.setIntensity(intensity);
                if (intensityValue) {
                    intensityValue.textContent = intensity;
                }
                // 强度改变时，保持已有的全文，但用新强度重新提取关键词
                // 不清空 allCollectedKeywords，直接重新处理
                this.keywordExtractor.clearHighlights(document.getElementById("transcript"));
                await this.reprocessAllKeywords();

                // 保存设置到 session
                this.saveSettingsToSession();
            });
        }

        console.log("[StreamNote] KeywordExtractor initialized");
    }

    setupUIListeners() {
        document.getElementById("startBtn").addEventListener("click", () => this.start());
        document.getElementById("stopBtn").addEventListener("click", () => this.stop());
        document.getElementById("clearBtn").addEventListener("click", () => this.clear());

        // 添加翻译开关
        const translationToggle = document.getElementById("translation-toggle");
        if (translationToggle) {
            translationToggle.addEventListener("change", (e) => {
                this.translationEnabled = e.target.checked;

                // 显示/隐藏译文容器
                const translationContainer = document.querySelector(".translation-container");
                if (translationContainer) {
                    translationContainer.style.display = e.target.checked ? 'flex' : 'none';
                }

                // 如果禁用翻译，也要关闭"只显示译文"模式
                if (!e.target.checked) {
                    const showOnlyTranslationToggle = document.getElementById("show-only-translation");
                    if (showOnlyTranslationToggle && showOnlyTranslationToggle.checked) {
                        showOnlyTranslationToggle.checked = false;
                        const mainContent = document.querySelector(".main-content");
                        if (mainContent) {
                            mainContent.classList.remove("translation-only-view");
                        }
                    }
                }

                // 保存设置到 session
                this.saveSettingsToSession();
            });
        }

        // 添加语言选择
        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.addEventListener("change", async (e) => {
                const oldLanguage = this.targetLanguage;
                this.targetLanguage = e.target.value;

                console.log(`[LANGUAGE] Switching from ${oldLanguage} to ${this.targetLanguage}`);

                // 语言改变，重新翻译全部
                if (this.translationEnabled) {
                    // 如果正在录制，提示用户
                    if (this.isRecording) {
                        console.log(`[LANGUAGE] Recording in progress, translations will load in background`);
                    }
                    await this.retranslateAll();
                }

                // 保存设置到 session
                this.saveSettingsToSession();
            });
        }

        // 添加"只显示译文"开关
        const showOnlyTranslationToggle = document.getElementById("show-only-translation");
        if (showOnlyTranslationToggle) {
            showOnlyTranslationToggle.addEventListener("change", (e) => {
                if (e.target.checked) {
                    // 如果要打开"只显示译文"，必须先启用翻译
                    if (!this.translationEnabled) {
                        const translationToggle = document.getElementById("translation-toggle");
                        if (translationToggle) {
                            translationToggle.checked = true;
                            translationToggle.dispatchEvent(new Event("change"));
                        }
                    }
                }

                const mainContent = document.querySelector(".main-content");
                if (mainContent) {
                    if (e.target.checked) {
                        // 添加translation-only-view类
                        mainContent.classList.add("translation-only-view");
                    } else {
                        // 移除translation-only-view类
                        mainContent.classList.remove("translation-only-view");
                    }
                }
            });
        }

        // 添加关键词解释语言选择
        const explanationLanguageSelector = document.getElementById("keyword-explanation-language");
        if (explanationLanguageSelector) {
            explanationLanguageSelector.addEventListener("change", (e) => {
                this.keywordExplanationLanguage = e.target.value;
                console.log(`[KEYWORD EXPLANATION] Language changed to ${this.keywordExplanationLanguage}`);
                this.saveSettingsToSession();
            });
        }

        // 自动提取关键词按钮（在Keywords面板中）
        const autoExtractKeywordsBtn = document.getElementById("autoExtractKeywordsBtn");
        if (autoExtractKeywordsBtn) {
            autoExtractKeywordsBtn.addEventListener("click", async () => {
                if (!this.keywordExtractor || !this.keywordExtractor.enabled) {
                    this.showStatusMessage("Enable keywords first", 2000);
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
        const historyContent = document.getElementById("historyContent");
        const settingsContent = document.getElementById("settingsContent");
        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessHistory = document.getElementById("quickAccessHistory");
        const quickAccessSettings = document.getElementById("quickAccessSettings");

        // Hide all content
        const hideAllContent = () => {
            keywordsContent.classList.remove("active");
            historyContent.classList.remove("active");
            settingsContent.classList.remove("active");
        };

        // Show specific content
        const showContent = (contentEl, title) => {
            hideAllContent();
            contentEl.classList.add("active");
            sidePanelTitle.textContent = title;

            // Set flag to prevent resize-induced scroll from closing autoScroll
            this.isSyncingScroll = true;
            sidePanelsContainer.classList.add("expanded");
            setTimeout(() => {
                this.isSyncingScroll = false;
            }, 350); // Match the 0.3s transition + buffer
        };

        // Close panel button
        if (closeSidePanelBtn) {
            closeSidePanelBtn.addEventListener("click", () => {
                // Set flag to prevent resize-induced scroll from closing autoScroll
                this.isSyncingScroll = true;
                sidePanelsContainer.classList.remove("expanded");
                setTimeout(() => {
                    this.isSyncingScroll = false;
                }, 350); // Match the 0.3s transition + buffer
            });
        }

        // Quick access buttons
        if (quickAccessKeywords) {
            quickAccessKeywords.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = keywordsContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isSyncingScroll = true;
                    sidePanelsContainer.classList.remove("expanded");
                    setTimeout(() => {
                        this.isSyncingScroll = false;
                    }, 350);
                } else {
                    showContent(keywordsContent, "Keywords");
                }
            });
        }

        if (quickAccessHistory) {
            quickAccessHistory.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = historyContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isSyncingScroll = true;
                    sidePanelsContainer.classList.remove("expanded");
                    setTimeout(() => {
                        this.isSyncingScroll = false;
                    }, 350);
                } else {
                    showContent(historyContent, "History");
                }
            });
        }

        if (quickAccessSettings) {
            quickAccessSettings.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = settingsContent.classList.contains("active");

                if (isOpen && isActive) {
                    this.isSyncingScroll = true;
                    sidePanelsContainer.classList.remove("expanded");
                    setTimeout(() => {
                        this.isSyncingScroll = false;
                    }, 350);
                } else {
                    showContent(settingsContent, "Settings");
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
                    this.isSyncingScroll = true;  // 防止scroll事件触发同步逻辑
                    const transcriptContainer = document.querySelector(".transcript-container");
                    const translationContainer = document.querySelector(".translation-container");

                    // 获取最后一行的索引并滚动到底部
                    const keys = Object.keys(this.preciseResults);
                    if (keys.length > 0) {
                        const lastIndex = keys[keys.length - 1];

                        if (transcriptContainer) {
                            transcriptContainer.style.scrollBehavior = 'auto';
                            this.scrollToLineBottom(transcriptContainer, lastIndex);
                            transcriptContainer.style.scrollBehavior = 'smooth';
                        }
                        if (translationContainer) {
                            translationContainer.style.scrollBehavior = 'auto';
                            this.scrollToLineBottom(translationContainer, lastIndex);
                            translationContainer.style.scrollBehavior = 'smooth';
                        }
                    }

                    setTimeout(() => {
                        this.isTogglingAutoScroll = false;
                        this.isSyncingScroll = false;
                    }, 200);
                }

                this.updateAutoScrollButton();
            });
            // Set initial state
            this.updateAutoScrollButton();
        }
    }

    /**
     * 初始化文本选中菜单功能
     */
    /**
     * 初始化浮动按钮功能（替换菜单）
     */
    initTextSelectionMenu() {
        const floatingExplainBtn = document.getElementById("floatingExplainBtn");
        const floatingAddKeywordBtn = document.getElementById("floatingAddKeywordBtn");

        // 获取侧边栏相关元素
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const sidePanelTitle = document.getElementById("sidePanelTitle");
        const keywordsContent = document.getElementById("keywordsContent");
        const historyContent = document.getElementById("historyContent");
        const settingsContent = document.getElementById("settingsContent");

        if (!floatingExplainBtn || !floatingAddKeywordBtn) return;

        // Hide all content
        const hideAllContent = () => {
            keywordsContent.classList.remove("active");
            historyContent.classList.remove("active");
            settingsContent.classList.remove("active");
        };

        // 监听选中事件
        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (!selectedText || selectedText.length === 0) {
                floatingExplainBtn.style.display = "none";
                floatingAddKeywordBtn.style.display = "none";
                return;
            }

            // 检查选中内容是否在转录或翻译区域
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (!range) {
                floatingExplainBtn.style.display = "none";
                floatingAddKeywordBtn.style.display = "none";
                return;
            }

            const transcriptDiv = document.getElementById("transcript");
            const translationDiv = document.getElementById("translation");

            const inTranscript = transcriptDiv?.contains(range.commonAncestorContainer);
            const inTranslation = translationDiv?.contains(range.commonAncestorContainer);

            if (inTranscript || inTranslation) {
                this.selectedText = selectedText;
                this.selectedTextElement = range.commonAncestorContainer;

                // 显示按钮
                floatingExplainBtn.style.display = "inline-block";
                floatingAddKeywordBtn.style.display = "inline-block";
            } else {
                floatingExplainBtn.style.display = "none";
                floatingAddKeywordBtn.style.display = "none";
            }
        });

        // 解释按钮事件
        floatingExplainBtn.addEventListener("click", async () => {
            if (this.selectedText.trim()) {
                const term = this.selectedText.trim();
                // 如果不在历史中，先加入
                if (!this.keywordExtractor.queryHistory.includes(term)) {
                    this.keywordExtractor.addToQueryHistory(term);
                }

                // 打开 History 面板
                if (historyContent && sidePanelTitle && sidePanelsContainer) {
                    hideAllContent();
                    historyContent.classList.add("active");
                    sidePanelTitle.textContent = "History";
                    this.isSyncingScroll = true;
                    sidePanelsContainer.classList.add("expanded");
                    setTimeout(() => {
                        this.isSyncingScroll = false;
                    }, 350);

                    // 等待 DOM 更新后再展开
                    setTimeout(() => {
                        this.keywordExtractor.toggleExplanation(term);
                    }, 50);
                }

                // 隐藏浮动按钮
                floatingExplainBtn.style.display = "none";
                floatingAddKeywordBtn.style.display = "none";
            }
        });

        // 添加关键词按钮事件
        floatingAddKeywordBtn.addEventListener("click", () => {
            if (this.selectedText.trim()) {
                this.addSelectedTextAsKeyword();

                // 打开 Keywords 面板
                if (keywordsContent && sidePanelTitle && sidePanelsContainer) {
                    hideAllContent();
                    keywordsContent.classList.add("active");
                    sidePanelTitle.textContent = "Keywords";
                    this.isSyncingScroll = true;
                    sidePanelsContainer.classList.add("expanded");
                    setTimeout(() => {
                        this.isSyncingScroll = false;
                    }, 350);
                }

                // 隐藏浮动按钮
                floatingExplainBtn.style.display = "none";
                floatingAddKeywordBtn.style.display = "none";
            }
        });
    }

    /**
     * 将选中的文本添加为关键词
     */
    addSelectedTextAsKeyword() {
        if (!this.selectedText || !this.keywordExtractor) return;

        const keyword = this.selectedText.trim();

        // 检查是否已存在
        if (this.keywordExtractor.allCollectedKeywords.includes(keyword)) {
            this.showStatusMessage("This keyword already exists", 1500);
            return;
        }

        // 添加关键词
        this.keywordExtractor.allCollectedKeywords.push(keyword);

        // 更新显示
        const keywordsOriginalDisplay = document.getElementById("keywords-display");
        if (keywordsOriginalDisplay) {
            this.keywordExtractor.displayKeywordsList(
                this.keywordExtractor.allCollectedKeywords,
                keywordsOriginalDisplay
            );
        }

        // 保存到 session
        this.sessionManager.updateCurrentKeywords(this.keywordExtractor.allCollectedKeywords);

        this.showStatusMessage(`✓ Added "${keyword}" to keywords`, 1500);
        this.selectedText = "";
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

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 设置音量检测
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 2048;

            this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            this.startTime = Date.now();
            this.lastSendTime = Date.now();
            this.recordingStartTime = Date.now();
            // 只在第一次或清空后重置 chunkIndex，继续录制时保留
            if (Object.keys(this.preciseResults).length === 0) {
                this.chunkIndex = 0;
            } else {
                // 继续录制：chunkIndex 继续从上次结束的地方开始
                this.chunkIndex = Math.max(...Object.keys(this.preciseResults).map(Number)) + 1;
            }
            this.isRecording = true;
            this.audioChunks = [];
            this.silenceStart = null;
            this.voiceStart = null;
            this.hasVoice = false;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    // 立即发送这个完整的音频块
                    this.sendToWhisper();
                    this.audioChunks = [];
                }
            };

            this.mediaRecorder.onstop = () => {
                // 停止时直接丢弃最后一段（通常是静音）
                if (!this.isRecording) {
                    console.log('[STOP] Discarding final chunk');
                    this.audioChunks = [];
                }
            };

            // 开始录制
            this.mediaRecorder.start();

            // 每 100ms 检测音量，停顿 600ms 或超过 10秒 就发送
            this.checkInterval = setInterval(() => {
                if (!this.isRecording) return;

                const volume = this.getVolume();
                const now = Date.now();
                const timeSinceLastSend = now - this.lastSendTime;
                const recordingDuration = now - this.recordingStartTime;

                console.log(`[VOLUME] ${volume.toFixed(3)} | Duration: ${(recordingDuration / 1000).toFixed(1)}s | HasVoice: ${this.hasVoice}`);

                if (volume < 0.015) {  // 沉默（降低阈值，避免噪音干扰）
                    this.voiceStart = null;

                    if (!this.silenceStart) {
                        this.silenceStart = now;
                        console.log('[SILENCE] Started');
                    } else if (now - this.silenceStart > 600 && recordingDuration > 1000 && this.hasVoice) {
                        // 沉默 >600ms + 录制 >1s + 有真实语音 → 发送
                        console.log('[SILENCE] 600ms detected with voice, sending...');
                        this.mediaRecorder.stop();
                        this.mediaRecorder.start();
                        this.recordingStartTime = Date.now();
                        this.lastSendTime = Date.now();
                        this.hasVoice = false;
                        this.voiceStart = null;
                        this.silenceStart = null;
                    }
                } else {  // 有声音
                    this.silenceStart = null;

                    if (!this.voiceStart) {
                        this.voiceStart = now;
                        console.log('[VOICE] Start detecting...');
                    } else if (!this.hasVoice && now - this.voiceStart > 600) {
                        // 持续声音 >600ms → 确认为真实语音
                        this.hasVoice = true;
                        console.log('[VOICE] Confirmed! (>600ms)');
                    }
                }

                // 超过 10秒 + 有真实语音 → 强制发送
                if (timeSinceLastSend > 10000 && this.hasVoice) {
                    console.log('[TIMEOUT] 10s reached with voice, force sending...');
                    this.mediaRecorder.stop();
                    this.mediaRecorder.start();
                    this.recordingStartTime = Date.now();
                    this.lastSendTime = Date.now();
                    this.hasVoice = false;
                    this.voiceStart = null;
                    this.silenceStart = null;
                }
            }, 100);

            document.getElementById("startBtn").disabled = true;
            document.getElementById("stopBtn").disabled = false;
            this.updateStatus("Recording...");
            this.startDurationUpdate();

            // 每秒更新 session 统计信息
            if (this.statsUpdateInterval) clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = setInterval(() => this.updateSessionStats(), 1000);

        } catch (error) {
            console.error("[ERROR] Microphone access:", error);
            this.updateStatus("Microphone access denied");
        }
    }

    stop() {
        if (this.mediaRecorder && this.isRecording) {
            this.isRecording = false;

            // 清除全局录制状态
            this.recordingSessionId = null;
            this.updateRecordingIndicator();

            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            // 清除 stats 更新定时器
            if (this.statsUpdateInterval) {
                clearInterval(this.statsUpdateInterval);
                this.statsUpdateInterval = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
            }

            this.mediaRecorder.stop();

            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }

            document.getElementById("startBtn").disabled = false;
            document.getElementById("stopBtn").disabled = true;
            this.updateStatus("Stopped");

            // 停止时更新一次统计信息
            this.updateSessionStats();

            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
        }
    }

    clear() {
        this.preciseResults = {};
        this.translationResults = {};
        this.chunkIndex = 0;
        this.currentTranscriptText = "";
        this.updateDisplay();
        if (this.keywordExtractor) {
            this.keywordExtractor.reset();
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
            this.isSyncingScroll = true;  // 防止scroll事件触发同步逻辑
            const transcriptContainer = document.querySelector(".transcript-container");
            const translationContainer = document.querySelector(".translation-container");

            // 获取最后一行的索引并滚动到底部
            const keys = Object.keys(this.preciseResults);
            if (keys.length > 0) {
                const lastIndex = keys[keys.length - 1];

                // 临时改为 auto（直接跳转到底部）
                if (transcriptContainer) {
                    transcriptContainer.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(transcriptContainer, lastIndex);
                    transcriptContainer.style.scrollBehavior = 'smooth';
                }
                if (translationContainer) {
                    translationContainer.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(translationContainer, lastIndex);
                    translationContainer.style.scrollBehavior = 'smooth';
                }
            }

            // 200ms 后清除标志，足够长的时间来避免防抖和同步滚动的冲突
            setTimeout(() => {
                this.isTogglingAutoScroll = false;
                this.isSyncingScroll = false;
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
            const response = await fetch("http://localhost:5001/api/transcribe", {
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
                console.log("[WHISPER]", text);
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
                            this.translateText(text, currentChunkIndex, sessionIdAtRequest);
                        }

                        // 关键词提取改为手动触发，注释掉自动调用
                        // this.processKeywords(sessionIdAtRequest);
                    } else {
                        // 如果已切换到其他 session，仅记录日志
                        console.log(`[TRANSCRIBE] Saved to session ${sessionIdAtRequest}, but user is now in session ${this.sessionManager.currentSessionId}`);
                    }
                }
            }

        } catch (error) {
            console.error("[ERROR] Whisper request failed:", error);
        }
    }

    updateDisplay() {
        // 更新 session 统计信息
        this.updateSessionStats();

        const transcriptDiv = document.getElementById("transcript");
        const translationDiv = document.getElementById("translation");

        // 更新转录显示
        const formattedLines = Object.keys(this.preciseResults).map(key => {
            const item = this.preciseResults[key];
            if (!item || !item.text) return null;

            const text = item.text.trim();
            const timestamp = item.timestamp || new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return `<p data-index="${key}">[${timestamp}] ${text}</p>`;
        }).filter(line => line !== null);

        if (formattedLines.length > 0) {
            transcriptDiv.innerHTML = formattedLines.join('');
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Press "Start Recording" to begin...</p>';
        }

        // 更新翻译显示
        const translationLines = Object.keys(this.preciseResults).map(key => {
            const item = this.preciseResults[key];
            if (!item || !item.text) return null;

            const timestamp = item.timestamp || new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const translation = this.translationResults[key];
            const translationText = translation || '<span class="placeholder">Translating...</span>';

            return `<p data-index="${key}">[${timestamp}] ${translationText}</p>`;
        }).filter(line => line !== null);

        if (translationLines.length > 0) {
            translationDiv.innerHTML = translationLines.join('');
        } else {
            translationDiv.innerHTML = '<p class="placeholder">Translation will appear here...</p>';
        }

        // 仅在自动滚动启用时滚动到底部（阻止同步滚动触发）
        // 注意：要滚动外层容器，不是内容 div
        if (this.autoScroll) {
            this.isSyncingScroll = true;
            const transcriptContainer = document.querySelector(".transcript-container");
            const translationContainer = document.querySelector(".translation-container");

            // 获取最后一行的索引，用于对齐滚动
            const keys = Object.keys(this.preciseResults);
            if (keys.length > 0) {
                const lastIndex = keys[keys.length - 1];

                // 使用 scrollToLineBottom 确保两个容器同步滚动到同一行
                if (transcriptContainer) {
                    transcriptContainer.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(transcriptContainer, lastIndex);
                }
                if (translationContainer) {
                    translationContainer.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(translationContainer, lastIndex);
                }
            }

            setTimeout(() => {
                this.isSyncingScroll = false;
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
     * 翻译文本
     */
    async translateText(text, index, targetSessionId = null) {
        if (!text || !this.translationEnabled) return;

        try {
            const response = await fetch("http://localhost:5001/api/translate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    target_lang: this.targetLanguage
                })
            });

            if (!response.ok) {
                console.error(`[ERROR] Translation API error: ${response.status}`);
                return;
            }

            const result = await response.json();
            const translation = result.translation.trim();

            if (translation) {
                console.log("[TRANSLATE]", translation);
                this.translationResults[index] = translation;
                this.updateDisplay();
                // 保存翻译到正确的session（录制中的session或当前session）
                this.saveToSession(targetSessionId);
            }

        } catch (error) {
            console.error("[ERROR] Translation request failed:", error);
        }
    }

    /**
     * 重新翻译所有内容（仅在语言切换或强制刷新时使用）
     */
    async retranslateAll() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 检查当前语言的缓存是否完整
        const currentLangCache = session.translations[this.targetLanguage] || {};
        let hasMissingTranslations = false;

        // 检查是否所有转录都已翻译
        const totalSegments = Object.keys(this.preciseResults).length;
        const cachedSegments = Object.keys(currentLangCache).length;
        const missingSegments = [];

        for (const index of Object.keys(this.preciseResults)) {
            if (!currentLangCache[index]) {
                hasMissingTranslations = true;
                missingSegments.push(index);
            }
        }

        if (!hasMissingTranslations && cachedSegments > 0) {
            // 缓存完整，直接使用
            console.log(`[TRANSLATE] Using cached translations for ${this.targetLanguage} (${cachedSegments} segments)`);
            this.translationResults = { ...currentLangCache };
            this.updateDisplay();

            // 恢复或翻译关键词
            if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords.length > 0) {
                // 关键词翻译已删除
            }
            return;
        }

        // 缓存不完整，只翻译缺失的部分
        const missingCount = missingSegments.length;
        console.log(`[TRANSLATE] Translating ${missingCount}/${totalSegments} segments to ${this.targetLanguage}`);

        // 显示翻译进度提示
        if (missingCount > 5) {
            this.updateStatus(`Translating to ${this.targetLanguage}... (${missingCount} segments)`);
        }

        this.translationResults = { ...currentLangCache };  // 保留已有的翻译
        this.updateDisplay();

        // 翻译缺失的部分
        let translated = 0;
        for (const [index, item] of Object.entries(this.preciseResults)) {
            if (item && item.text && !this.translationResults[index]) {
                await this.translateText(item.text, index);
                translated++;

                // 更新进度（避免过于频繁）
                if (missingCount > 5 && translated % 5 === 0) {
                    this.updateStatus(`Translating... ${translated}/${missingCount}`);
                }
            }
        }

        // 翻译完成提示
        if (missingCount > 5) {
            this.updateStatus(`Translation complete (${this.targetLanguage})`);
            setTimeout(() => {
                if (!this.isRecording) {
                    this.updateStatus("Ready");
                }
            }, 2000);
        }

        // 重新翻译关键词（保存到当前session）
        if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords.length > 0) {
            // 关键词翻译已删除
        }
    }

    /**
     * 只翻译缺失的内容（用于翻译开关重新打开时）
     */
    async translateMissingContent() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 加载当前语言的缓存
        const currentLangCache = session.translations[this.targetLanguage] || {};
        this.translationResults = { ...currentLangCache };

        // 检查是否有未翻译的内容
        let hasUntranslated = false;
        for (const [index, item] of Object.entries(this.preciseResults)) {
            if (item && item.text && !this.translationResults[index]) {
                hasUntranslated = true;
                await this.translateText(item.text, index);
            }
        }

        // 如果没有未翻译的内容，只需要更新显示即可
        if (!hasUntranslated) {
            this.updateDisplay();
        }

        // 翻译并显示关键词（如果有）
        if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords.length > 0) {
            // 关键词翻译已删除
        }
    }

    /**
     * 处理关键词提取 - 基于整个转录文本
     */
    async processKeywords(targetSessionId = null) {
        if (!this.keywordExtractor || !this.keywordExtractor.enabled) return;

        // 收集所有转录文本（保证准确率）
        this.currentTranscriptText = Object.values(this.preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.currentTranscriptText.length > 10) {
            console.log(`[StreamNote] Processing full text for keywords: "${this.currentTranscriptText.substring(0, 50)}..."`);

            // 基于整个文本提取关键词
            await this.keywordExtractor.processText(this.currentTranscriptText);

            // 显示原文关键词
            const keywordsOriginalDisplay = document.getElementById("keywords-display");
            if (keywordsOriginalDisplay && this.keywordExtractor.allCollectedKeywords.length > 0) {
                this.keywordExtractor.displayKeywordsList(this.keywordExtractor.allCollectedKeywords, keywordsOriginalDisplay);
            }

            // 翻译并显示译文关键词
            if (this.translationEnabled && this.keywordExtractor.allCollectedKeywords.length > 0) {
                // 关键词翻译已删除
            }
        }
    }

    /**
     * 重新处理所有关键词（强度改变时使用）
     */
    async reprocessAllKeywords() {
        if (!this.keywordExtractor || !this.keywordExtractor.enabled) return;

        // 获取当前的全文
        this.currentTranscriptText = Object.values(this.preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.currentTranscriptText.length > 10) {
            console.log(`[StreamNote] Reprocessing keywords with new intensity: ${this.keywordExtractor.intensity}`);

            // 清空旧的关键词
            this.keywordExtractor.allCollectedKeywords = [];

            // 重新提取
            await this.keywordExtractor.processText(this.currentTranscriptText);

            // 显示原文关键词
            const keywordsOriginalDisplay = document.getElementById("keywords-display");
            if (keywordsOriginalDisplay && this.keywordExtractor.allCollectedKeywords.length > 0) {
                this.keywordExtractor.displayKeywordsList(this.keywordExtractor.allCollectedKeywords, keywordsOriginalDisplay);
            }

            // 翻译并显示译文关键词（缓存已清除，会重新翻译）
            if (this.translationEnabled && this.keywordExtractor.allCollectedKeywords.length > 0) {
                // 关键词翻译已删除
            }
        }
    }


    /**
     * 获取视口中心对应的 data-index
     */
    getCenterLineIndex(container) {
        const viewportCenterY = container.scrollTop + container.clientHeight / 2;
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return null;

        let closestElement = paragraphs[0];
        let closestDistance = Math.abs(
            (container.scrollTop + paragraphs[0].getBoundingClientRect().top +
                paragraphs[0].getBoundingClientRect().height / 2) - viewportCenterY
        );

        // 找最接近视口中心的元素
        for (let p of paragraphs) {
            const rect = p.getBoundingClientRect();
            const elementCenter = container.scrollTop + rect.top + rect.height / 2;
            const distance = Math.abs(elementCenter - viewportCenterY);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestElement = p;
            }
        }

        return closestElement.getAttribute('data-index');
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
     * 设置同步滚动 - 基于中心行对齐，使用 data-index 精确对应
     */
    setupSyncScroll() {
        const transcriptContainer = document.querySelector(".transcript-container");
        const translationContainer = document.querySelector(".translation-container");

        if (!transcriptContainer || !translationContainer) {
            console.warn('[StreamNote] Sync scroll containers not found');
            return;
        }

        // 原文容器滚动时，同步译文容器
        transcriptContainer.addEventListener('scroll', () => {
            // 记录滚动前的自动滚动状态，用于决定同步时的对齐方式
            const wasAutoScrolling = this.autoScroll;

            // 如果是用户手动滚动，关闭自动滚动
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && this.autoScroll) {
                this.autoScroll = false;
                this.updateAutoScrollButton();
            }

            if (this.isSyncingScroll) return;

            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isSyncingScroll = true;

                // 获取原文中心对应的行索引
                const centerIndex = this.getCenterLineIndex(transcriptContainer);

                // 在译文中找到同样的行，根据滚动模式选择对齐方式
                if (centerIndex) {
                    translationContainer.style.scrollBehavior = 'auto';
                    // 自动滚动模式用底部对齐，否则用中心对齐
                    if (wasAutoScrolling) {
                        this.scrollToLineBottom(translationContainer, centerIndex);
                    } else {
                        this.scrollToLineCenter(translationContainer, centerIndex);
                    }
                }

                setTimeout(() => {
                    this.isSyncingScroll = false;
                }, 50);
            }, 300); // 防抖 300ms
        });

        // 译文容器滚动时，同步原文容器
        translationContainer.addEventListener('scroll', () => {
            // 记录滚动前的自动滚动状态，用于决定同步时的对齐方式
            const wasAutoScrolling = this.autoScroll;

            // 如果是用户手动滚动，关闭自动滚动
            if (!this.isSyncingScroll && !this.isTogglingAutoScroll && this.autoScroll) {
                this.autoScroll = false;
                this.updateAutoScrollButton();
            }

            if (this.isSyncingScroll) return;

            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isSyncingScroll = true;

                // 获取译文中心对应的行索引
                const centerIndex = this.getCenterLineIndex(translationContainer);

                // 在原文中找到同样的行，根据滚动模式选择对齐方式
                if (centerIndex) {
                    transcriptContainer.style.scrollBehavior = 'auto';
                    // 自动滚动模式用底部对齐，否则用中心对齐
                    if (wasAutoScrolling) {
                        this.scrollToLineBottom(transcriptContainer, centerIndex);
                    } else {
                        this.scrollToLineCenter(transcriptContainer, centerIndex);
                    }
                }

                setTimeout(() => {
                    this.isSyncingScroll = false;
                }, 50);
            }, 300); // 防抖 300ms
        });
    }

    startDurationUpdate() {
        this.durationInterval = setInterval(() => {
            if (this.isRecording) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                document.getElementById("duration").textContent =
                    `Duration: ${minutes}:${seconds.toString().padStart(2, "0")}`;
            }
        }, 1000);
    }
    /**
     * 删除关键词
     */
    deleteKeyword(keyword) {
        if (!this.keywordExtractor) return;

        const index = this.keywordExtractor.allCollectedKeywords.indexOf(keyword);
        if (index > -1) {
            this.keywordExtractor.allCollectedKeywords.splice(index, 1);

            // 更新显示
            const keywordsDisplay = document.getElementById("keywords-display");
            if (keywordsDisplay) {
                this.keywordExtractor.displayKeywordsList(
                    this.keywordExtractor.allCollectedKeywords,
                    keywordsDisplay
                );
            }

            // 保存到 session
            this.sessionManager.updateCurrentKeywords(this.keywordExtractor.allCollectedKeywords);

            this.showStatusMessage(`✓ Removed "${keyword}"`, 1200);
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.streamNoteInstance = new StreamNote();
});