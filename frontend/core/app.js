class StreamNote {
    getElement(id) {
        return document.getElementById(id);
    }

    setScrollBehaviorAuto(elementIds) {
        elementIds.forEach((id) => {
            const element = this.getElement(id);
            if (element) {
                element.style.scrollBehavior = 'auto';
            }
        });
    }

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

        // API 客户端
        this.apiClient = window.StreamNoteApiClient ? new window.StreamNoteApiClient() : null;

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

        // === 执行上下文管理 ===
        // 版本号：每当会话/语言/格式等关键状态变更时递增
        // 用于防止竞态条件：并发操作可以通过检查版本号来判断上下文是否已变更
        this.executionContextVersion = 0;

        // 全局操作管理器：管理所有正在进行的异步操作（解释、翻译、摘要等）
        this.operationManager = new OperationManager();

        // 文本选中菜单
        this.selectedText = "";
        this.selectedTextElement = null;

        // 用户选择状态管理
        this.hasActiveSelection = false;
        this.pendingUpdates = false;

        // 模态窗口管理器
        this.modalManager = null;

        // 文本导入管理器
        this.contentImportManager = null;

        // 转录编辑弹窗管理器
        this.transcriptEditDialogManager = null;

        // 文本选中菜单与关键词标签管理器
        this.selectionMenuManager = null;

        // 窗口可见性管理器
        this.visibilityManager = null;

        // 词定位与临时高亮管理器
        this.wordNavigationManager = null;

        // 显示渲染管理器
        this.displayManager = null;

        // 录制控制流程管理器
        this.recordingControlManager = null;

        // 会话信息显示管理器
        this.sessionInfoManager = null;

        // 会话持久化管理器
        this.sessionPersistenceManager = null;

        // AI 流程管理器（总结/关键词提取）
        this.aiWorkflowManager = null;

        // 应用 UI 状态管理器
        this.appUiStateManager = null;

        // 会话加载管理器
        this.sessionLoadManager = null;

        // UI 事件监听管理器
        this.uiListenersManager = null;

        // 转录流程管理器
        this.transcriptionFlowManager = null;

        // 状态消息超时ID
        this.statusMessageTimeout = null;

        this.initDelegatedManagers();

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
            this.setScrollBehaviorAuto(["transcript", "translation"]);
        }, 100);
    }

    /**
     * 初始化模态窗口管理器
     */
    initModalManager() {
        this.modalManager = new ModalManager({
            buttonResolver: (modalId) => this.getModalButton(modalId)
        });
    }

    /**
     * 初始化文本导入管理器
     */
    initContentImportManager() {
        this.contentImportManager = new ContentImportManager(this);
    }

    /**
     * 初始化转录编辑弹窗管理器
     */
    initTranscriptEditDialogManager() {
        this.transcriptEditDialogManager = new TranscriptEditDialogManager(this);
    }

    /**
     * 初始化文本选中菜单与关键词标签管理器
     */
    initSelectionMenuManager() {
        this.selectionMenuManager = new SelectionMenuManager(this);
    }

    /**
     * 初始化窗口可见性管理器
     */
    initVisibilityManager() {
        this.visibilityManager = new VisibilityManager(this);
    }

    /**
     * 初始化词定位与临时高亮管理器
     */
    initWordNavigationManager() {
        this.wordNavigationManager = new WordNavigationManager(this);
    }

    /**
     * 初始化显示渲染管理器
     */
    initDisplayManager() {
        this.displayManager = new DisplayManager(this);
    }

    /**
     * 初始化录制控制流程管理器
     */
    initRecordingControlManager() {
        this.recordingControlManager = new RecordingControlManager(this);
    }

    /**
     * 初始化会话信息显示管理器
     */
    initSessionInfoManager() {
        this.sessionInfoManager = new SessionInfoManager(this);
    }

    /**
     * 初始化会话持久化管理器
     */
    initSessionPersistenceManager() {
        this.sessionPersistenceManager = new SessionPersistenceManager(this);
    }

    /**
     * 初始化 AI 流程管理器
     */
    initAiWorkflowManager() {
        this.aiWorkflowManager = new AiWorkflowManager(this);
    }

    /**
     * 初始化应用 UI 状态管理器
     */
    initAppUiStateManager() {
        this.appUiStateManager = new AppUiStateManager(this);
    }

    /**
     * 初始化会话加载管理器
     */
    initSessionLoadManager() {
        this.sessionLoadManager = new SessionLoadManager(this);
    }

    /**
     * 初始化 UI 事件监听管理器
     */
    initUiListenersManager() {
        this.uiListenersManager = new UiListenersManager(this);
    }

    /**
     * 初始化转录流程管理器
     */
    initTranscriptionFlowManager() {
        this.transcriptionFlowManager = new TranscriptionFlowManager(this);
    }

    /**
     * 统一初始化所有委托管理器（保持构造顺序）
     */
    initDelegatedManagers() {
        this.initModalManager();
        this.initContentImportManager();
        this.initTranscriptEditDialogManager();
        this.initSelectionMenuManager();
        this.initVisibilityManager();
        this.initWordNavigationManager();
        this.initDisplayManager();
        this.initRecordingControlManager();
        this.initSessionInfoManager();
        this.initSessionPersistenceManager();
        this.initAiWorkflowManager();
        this.initAppUiStateManager();
        this.initSessionLoadManager();
        this.initUiListenersManager();
        this.initTranscriptionFlowManager();
    }

    /**
     * 初始化录音管理器
     */
    initRecordingManager() {
        this.recordingManager = new RecordingManager({
            transcribeApiUrl: "/api/transcribe",
            apiClient: this.apiClient,
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
            apiClient: this.apiClient,
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
        this.transcriptionFlowManager?.onTranscribeProgress(data);
    }

    /**
     * 更新转录上下文 - 自动从现有转录内容生成
     * 用于提高Whisper的转录准确率
     */
    updateTranscriptionContext() {
        this.transcriptionFlowManager?.updateTranscriptionContext();
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
        this.sessionLoadManager?.loadCurrentSession();
    }

    /**
     * 更新 header 中的 session 信息显示
     */
    updateSessionInfo() {
        this.sessionInfoManager?.updateSessionInfo();
    }

    /**
     * 更新 session 的统计信息（时长、字数、关键词数等）
     */
    updateSessionStats() {
        this.sessionInfoManager?.updateSessionStats();
    }

    /**
     * 保存当前数据到 session
     */
    saveToSession(targetSessionId = null) {
        this.sessionPersistenceManager?.saveToSession(targetSessionId);
    }

    /**
     * 单独保存设置到 session（用于UI控件修改时）
     */
    saveSettingsToSession() {
        this.sessionPersistenceManager?.saveSettingsToSession();
    }

    /**
     * 保存当前布局和翻译设置到会话
     */
    savePanelState() {
        this.sessionPersistenceManager?.savePanelState();
    }

    /**
     * 加载布局和翻译状态（由 panelManager 处理）
     */
    loadPanelState() {
        this.sessionPersistenceManager?.loadPanelState();
    }

    /**
     * 初始化关键词提取器
     */
    initKeywordManager() {
        this.keywordManager = new KeywordManager({
            apiUrl: "/api/extract-keywords",
            apiClient: this.apiClient,
            transcriptElement: this.getElement("transcript"),
            keywordElement: this.getElement("keywords-display"),
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
        this.uiListenersManager?.setupUIListeners();
    }

    /**
     * 导入文本内容到当前 session
     * @param {Object} preciseResults - 精确结果对象 {index: {text, timestamp, source}}
     * @param {string} sourceFile - 文件名或来源标识
     * @param {string} sourceType - 'file' 或 'edit'
     */
    importTextContent(preciseResults, sourceFile, sourceType) {
        this.contentImportManager?.importTextContent(preciseResults, sourceFile, sourceType);
    }

    /**
     * 显示添加纯文本的对话框
     */
    showAddTextDialog() {
        this.contentImportManager?.showAddTextDialog();
    }

    /**
     * 显示编辑转录对话框
     */
    showEditTranscriptDialog() {
        this.transcriptEditDialogManager?.showEditTranscriptDialog();
    }

    /**
     * 创建编辑项
     */
    _createEditItem(container, idx, text, timestamp) {
        this.transcriptEditDialogManager?._createEditItem(container, idx, text, timestamp);
    }

    /**
     * 保存编辑后的转录
     */
    saveEditedTranscript() {
        this.transcriptEditDialogManager?.saveEditedTranscript();
    }

    /**
     * 初始化关键词标签页切换功能
     */
    initKeywordsTabSwitcher() {
        this.selectionMenuManager?.initKeywordsTabSwitcher();
    }

    /**
     * 初始化文本选中菜单功能（浮动菜单）
     */
    initTextSelectionMenu() {
        this.selectionMenuManager?.initTextSelectionMenu();
    }

    /**
     * 初始化窗口可见性处理器
     * 当窗口重新获得焦点或文档变为可见时，如果自动滚动启用，重新滚动到底部
     */
    initVisibilityHandlers() {
        this.visibilityManager?.initVisibilityHandlers();
    }

    /**
     * 切换录音状态（开始或停止）
     */
    async toggleRecording() {
        await this.recordingControlManager?.toggleRecording();
    }

    async start() {
        await this.recordingControlManager?.start();
    }

    stop() {
        this.recordingControlManager?.stop();
    }

    /**
     * 更新录制按钮的状态和外观
     */
    updateRecordingButtonState() {
        this.recordingControlManager?.updateRecordingButtonState();
    }

    clear() {
        this.recordingControlManager?.clear();
    }

    /**
     * 更新显示（使用RecordingManager的数据）
     */
    updateDisplay() {
        this.displayManager?.updateDisplay();
    }

    /**
     * 更新翻译面板的显示（在翻译面板可见时调用）
     */
    updateTranslationDisplay() {
        this.displayManager?.updateTranslationDisplay();
    }

    /**
     * 在指定面板（转录或译文）中搜索词语并跳转到其位置
     * @param {string} word - 要搜索的词语
     * @param {string} sourcePanel - 源面板 ('transcript' 或 'translation')，默认 'transcript'
     */
    scrollToWord(word, sourcePanel = 'transcript') {
        this.wordNavigationManager?.scrollToWord(word, sourcePanel);
    }

    /**
     * 通过index在面板中定位词语
     * @param {string} word - 词语
     * @param {number} targetIndex - 目标片段的index
     * @param {string} sourcePanel - 源面板
     * @returns {boolean} 是否成功定位
     */
    scrollToWordByIndex(word, targetIndex, sourcePanel) {
        return this.wordNavigationManager?.scrollToWordByIndex(word, targetIndex, sourcePanel) || false;
    }

    /**
     * 通过多个index在面板中定位跨行词语
     * @param {string} word - 词语
     * @param {Array<number>} targetIndices - 目标片段的index数组（用于跨行词）
     * @param {string} sourcePanel - 源面板
     * @returns {boolean} 是否成功定位
     */
    scrollToWordByIndices(word, targetIndices, sourcePanel) {
        return this.wordNavigationManager?.scrollToWordByIndices(word, targetIndices, sourcePanel) || false;
    }

    /**
     * 通过文本搜索在面板中定位词语（支持跨行搜索）
     * @param {string} word - 词语
     * @param {string} sourcePanel - 源面板
     */
    scrollToWordByText(word, sourcePanel = 'transcript') {
        this.wordNavigationManager?.scrollToWordByText(word, sourcePanel);
    }

    /**
     * 在元素中高亮显示词语
     * @param {HTMLElement} element - 要搜索的元素
     * @param {string} word - 要高亮的词（可以是多词组合如"human events"）
     */
    highlightWordInElement(element, word) {
        this.wordNavigationManager?.highlightWordInElement(element, word);
    }

    updateStatus(text) {
        this.transcriptionFlowManager?.updateStatus(text);
    }

    syncExplanationLanguageSelectors() {
        this.appUiStateManager?.syncExplanationLanguageSelectors();
    }

    setEditModalVisibility(isVisible) {
        this.appUiStateManager?.setEditModalVisibility(isVisible);
    }

    getCurrentSessionTranscriptText() {
        return this.appUiStateManager?.getCurrentSessionTranscriptText() || "";
    }

    async updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, autoGenerateOnMiss) {
        await this.appUiStateManager?.updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, autoGenerateOnMiss);
    }

    /**
     * 切换模态窗口（打开或关闭）
     */
    toggleModal(modalId) {
        this.modalManager?.toggle(modalId);
    }

    /**
     * 打开模态窗口
     */
    openModal(modalId) {
        this.modalManager?.open(modalId);
    }

    /**
     * 关闭模态窗口
     */
    closeModal(modalId) {
        this.modalManager?.close(modalId);
    }

    /**
     * 关闭所有打开的模态窗口
     */
    closeAllModals() {
        this.modalManager?.closeAll();
    }

    /**
     * 获取模态对应的按钮
     */
    getModalButton(modalId) {
        const buttonMap = {
            sessionModal: "openSessionPanel",
            settingsModal: "quickAccessSettings"
        };
        const buttonId = buttonMap[modalId];
        return buttonId ? this.getElement(buttonId) : null;
    }

    /**
     * 显示临时状态消息（自动消失）
     * @param {String} message - 消息内容
     * @param {Number} duration - 消息显示时长（毫秒），默认 3000
     */
    showStatusMessage(message, duration = 3000) {
        this.appUiStateManager?.showStatusMessage(message, duration);
    }

    /**
     * 更新highlight按钮的状态（文本和样式）
     * @param {string} word - 词条
     * @param {boolean} isHighlighted - 是否已高亮
     */
    updateHighlightButtonState(word, isHighlighted) {
        this.appUiStateManager?.updateHighlightButtonState(word, isHighlighted);
    }

    /**
     * 更新录制指示器UI
     * 显示当前正在录制的session，并高亮session列表
     */
    updateRecordingIndicator() {
        this.appUiStateManager?.updateRecordingIndicator();
    }

    /**
     * 总结文本（使用用户选择的语言） - 流式版本
     */
    async summarizeText(text, forceRefresh = false, style = "paragraph") {
        return this.aiWorkflowManager?.summarizeText(text, forceRefresh, style);
    }

    /**
     * 处理关键词提取 - 基于整个转录文本
     */
    async processKeywords(targetSessionId = null) {
        await this.aiWorkflowManager?.processKeywords(targetSessionId);
    }

    /**
     * 重新处理所有关键词（强度改变时使用）
     */
    async reprocessAllKeywords() {
        await this.aiWorkflowManager?.reprocessAllKeywords();
    }


    /**
     * 删除关键词
     */
    deleteKeyword(keyword) {
        this.appUiStateManager?.deleteKeyword(keyword);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.streamNoteInstance = new StreamNote();
});