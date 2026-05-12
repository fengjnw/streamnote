/**
 * StreamNote - Main application controller
 * Central hub orchestrating all managers, coordinating UI state, session management,
 * and user interactions. Manages keyboard shortcuts, displays, recording, translation,
 * keyword extraction, and persistence.
 * 
 * @class
 * @global
 * @example
 * window.streamNoteInstance = new StreamNote();
 */
class StreamNote {
    /**
     * Get a DOM element by ID
     * @private
     * @param {string} id - Element ID
     * @returns {HTMLElement|null} DOM element or null if not found
     */
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
        // Initialize dependency injection context
        this.appContext = new AppContext();

        this.sessionManager = null;

        this.keywordManager = null;
        this.currentTranscriptText = "";

        this.highlightIdMap = {};

        this.translationManager = null;
        this.translationEnabled = true;

        this.settingsPanel = null;

        this.apiClient = window.StreamNoteApiClient ? new window.StreamNoteApiClient() : null;
        this.appContext.setApiClient(this.apiClient);

        this.highlightManager = null;

        this.language = "Chinese";
        this.explanationLanguage = "English";

        this.summaryCache = {};

        this.recordingSessionId = null;
        this.displaySessionId = null;

        // Increment this whenever critical context changes to invalidate stale async results.
        this.executionContextVersion = 0;

        // Centralized tracker for long-running async operations.
        this.operationManager = new OperationManager();

        this.selectedText = "";
        this.selectedTextElement = null;

        this.hasActiveSelection = false;
        this.pendingUpdates = false;

        this.modalManager = null;

        this.contentImportManager = null;

        this.transcriptEditDialogManager = null;

        this.selectionMenuManager = null;

        this.visibilityManager = null;

        this.wordNavigationManager = null;

        this.displayManager = null;

        this.recordingControlManager = null;

        this.sessionInfoManager = null;

        this.sessionPersistenceManager = null;

        this.aiWorkflowManager = null;

        this.appUiStateManager = null;

        this.sessionLoadManager = null;

        this.uiListenersManager = null;

        this.transcriptionFlowManager = null;

        this.statusMessageTimeout = null;

        this.initDelegatedManagers();

        this.initSessionManager();
        this.appContext.setSessionManager(this.sessionManager);

        this.initRecordingManager();
        this.appContext.setRecordingManager(this.recordingManager);

        this.initPanelManager();
        this.appContext.setPanelManager(this.panelManager);

        this.initTranslationManager();
        this.appContext.setTranslationManager(this.translationManager);

        this.initSettingsPanel();
        this.appContext.setSettingsPanel(this.settingsPanel);

        this.initKeywordManager();
        this.appContext.setKeywordManager(this.keywordManager);

        this.initHighlightManager();
        this.appContext.setHighlightManager(this.highlightManager);

        // Register status update callback
        this.appContext.onStatusUpdate((message, duration) => {
            this.showStatusMessage(message, duration);
        });

        // Register save settings callback
        this.appContext.onSaveSettings(() => {
            this.saveSettingsToSession();
        });

        this.setupUIListeners();
        this.initVisibilityHandlers();

        this.updateRecordingButtonState();

        this.panelManager.loadPanelState();

        this.loadCurrentSession();

        setTimeout(() => {
            this.panelManager.setupSyncScroll();
            this.initializeVisibility();
            this.setScrollBehaviorAuto(["transcript", "translation"]);
        }, 100);
    }

    initModalManager() {
        this.modalManager = new ModalManager({
            buttonResolver: (modalId) => this.getModalButton(modalId)
        });
    }

    initContentImportManager() {
        this.contentImportManager = new ContentImportManager(this);
    }

    initTranscriptEditDialogManager() {
        this.transcriptEditDialogManager = new TranscriptEditDialogManager(this);
    }

    initSelectionMenuManager() {
        this.selectionMenuManager = new SelectionMenuManager(this);
    }

    initVisibilityManager() {
        this.visibilityManager = new VisibilityManager(this);
    }

    initWordNavigationManager() {
        this.wordNavigationManager = new WordNavigationManager(this);
    }

    initDisplayManager() {
        this.displayManager = new DisplayManager(this);
    }

    initRecordingControlManager() {
        this.recordingControlManager = new RecordingControlManager(this);
    }

    initSessionInfoManager() {
        this.sessionInfoManager = new SessionInfoManager(this);
    }

    initSessionPersistenceManager() {
        this.sessionPersistenceManager = new SessionPersistenceManager(this);
    }

    initAiWorkflowManager() {
        this.aiWorkflowManager = new AiWorkflowManager(this);
    }

    initAppUiStateManager() {
        this.appUiStateManager = new AppUiStateManager(this);
    }

    initSessionLoadManager() {
        this.sessionLoadManager = new SessionLoadManager(this);
    }

    initUiListenersManager() {
        this.uiListenersManager = new UiListenersManager(this);
    }

    initTranscriptionFlowManager() {
        this.transcriptionFlowManager = new TranscriptionFlowManager(this);
    }

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

    initRecordingManager() {
        this.recordingManager = new RecordingManager({
            transcribeApiUrl: "/api/transcribe",
            apiClient: this.apiClient,
            onTranscribeProgress: (data) => this.onTranscribeProgress(data),
            onStatusUpdate: (status) => this.updateStatus(status),
            onRecordingStateChange: (isRecording) => {
                this.updateRecordingIndicator();
                if (!isRecording) {
                    this.updateDisplay();
                }
            }
        });
        this.recordingManager.setSessionStartTime(Date.now());
    }

    initPanelManager() {
        this.panelManager = new PanelManager({
            onLayoutChange: (layout) => {
                const wasTranslationDisabled = !this.translationEnabled;
                this.translationEnabled = layout.translationEnabled;
                if (this.translationManager) {
                    this.translationManager.setEnabled(this.translationEnabled);
                    if (wasTranslationDisabled && this.translationEnabled) {
                        this.translationManager.translateMissingContent();
                    }
                }
                this.saveSettingsToSession();
                this.updateDisplay();
            },
            onStatusUpdate: (status) => this.updateStatus(status)
        });
    }

    initTranslationManager() {
        this.translationManager = new TranslationManager({
            translateApiUrl: "/api/translate",
            apiClient: this.apiClient,
            onTranslationProgress: () => {
            },
            onStatusUpdate: (status) => this.updateStatus(status),
            onDisplayUpdate: () => this.updateDisplay(),
            getSessionData: () => this.sessionManager.getCurrentSession(),
            getPreciseResults: () => this.recordingManager.getTranscriptData(),
            saveToSession: (sessionId) => this.saveToSession(sessionId)
        });
        this.translationManager.setLanguage(this.language);
        this.translationManager.setEnabled(this.translationEnabled);
    }

    initSettingsPanel() {
        this.settingsPanel = new SettingsPanel({
            sessionManager: this.sessionManager,
            onStatusUpdate: (status) => this.showStatusMessage(status, 2000),
            onLanguageChange: (language) => {
                this.language = language;
            }
        });
    }

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

        if (this.keywordManager) {
            this.keywordManager.highlightManager = this.highlightManager;
        }
    }

    get preciseResults() {
        return this.recordingManager.getTranscriptData();
    }

    onTranscribeProgress(data) {
        this.transcriptionFlowManager?.onTranscribeProgress(data);
    }

    updateTranscriptionContext() {
        this.transcriptionFlowManager?.updateTranscriptionContext();
    }

    initializeVisibility() {
        this.highlightManager.reapplyAllHighlights();
    }

    initSessionManager() {
        this.sessionManager = new SessionManager({
            apiClient: this.apiClient,
        });

        window.addEventListener('sessionChanged', () => {
            this.loadCurrentSession();
        });
    }

    loadCurrentSession() {
        this.sessionLoadManager?.loadCurrentSession();
    }

    updateSessionInfo() {
        this.sessionInfoManager?.updateSessionInfo();
    }

    updateSessionStats() {
        this.sessionInfoManager?.updateSessionStats();
    }

    saveToSession(targetSessionId = null) {
        this.sessionPersistenceManager?.saveToSession(targetSessionId);
    }

    saveSettingsToSession() {
        this.sessionPersistenceManager?.saveSettingsToSession();
    }

    savePanelState() {
        this.sessionPersistenceManager?.savePanelState();
    }

    loadPanelState() {
        this.sessionPersistenceManager?.loadPanelState();
    }

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

        window.keywordManagerInstance = this.keywordManager;
    }

    setupUIListeners() {
        this.uiListenersManager?.setupUIListeners();
    }

    importTextContent(preciseResults, sourceFile, sourceType) {
        this.contentImportManager?.importTextContent(preciseResults, sourceFile, sourceType);
    }

    showAddTextDialog() {
        this.contentImportManager?.showAddTextDialog();
    }

    showEditTranscriptDialog() {
        this.transcriptEditDialogManager?.showEditTranscriptDialog();
    }

    _createEditItem(container, idx, text, timestamp) {
        this.transcriptEditDialogManager?._createEditItem(container, idx, text, timestamp);
    }

    saveEditedTranscript() {
        this.transcriptEditDialogManager?.saveEditedTranscript();
    }

    initKeywordsTabSwitcher() {
        this.selectionMenuManager?.initKeywordsTabSwitcher();
    }

    initTextSelectionMenu() {
        this.selectionMenuManager?.initTextSelectionMenu();
    }

    initVisibilityHandlers() {
        this.visibilityManager?.initVisibilityHandlers();
    }

    async toggleRecording() {
        await this.recordingControlManager?.toggleRecording();
    }

    async start() {
        await this.recordingControlManager?.start();
    }

    stop() {
        this.recordingControlManager?.stop();
    }

    updateRecordingButtonState() {
        this.recordingControlManager?.updateRecordingButtonState();
    }

    clear() {
        this.recordingControlManager?.clear();
    }

    updateDisplay() {
        this.displayManager?.updateDisplay();
    }

    updateTranslationDisplay() {
        this.displayManager?.updateTranslationDisplay();
    }

    scrollToWord(word, sourcePanel = 'transcript') {
        this.wordNavigationManager?.scrollToWord(word, sourcePanel);
    }

    scrollToWordByIndex(word, targetIndex, sourcePanel) {
        return this.wordNavigationManager?.scrollToWordByIndex(word, targetIndex, sourcePanel) || false;
    }

    scrollToWordByIndices(word, targetIndices, sourcePanel) {
        return this.wordNavigationManager?.scrollToWordByIndices(word, targetIndices, sourcePanel) || false;
    }

    scrollToWordByText(word, sourcePanel = 'transcript') {
        this.wordNavigationManager?.scrollToWordByText(word, sourcePanel);
    }

    highlightWordInElement(element, word) {
        this.wordNavigationManager?.highlightWordInElement(element, word);
    }

    updateStatus(text) {
        this.transcriptionFlowManager?.updateStatus(text);
    }

    syncExplanationLanguageSelectors() {
        this.appUiStateManager?.syncExplanationLanguageSelectors();
    }

    initAccountStatusUI() {
        this.appUiStateManager?.initAccountStatusUI();
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

    toggleModal(modalId) {
        this.modalManager?.toggle(modalId);
    }

    openModal(modalId) {
        this.modalManager?.open(modalId);
    }

    closeModal(modalId) {
        this.modalManager?.close(modalId);
    }

    closeAllModals() {
        this.modalManager?.closeAll();
    }

    getModalButton(modalId) {
        const buttonMap = {
            sessionModal: "openSessionPanel",
            settingsModal: "quickAccessSettings",
            authModal: "headerAuthBtn"
        };
        const buttonId = buttonMap[modalId];
        return buttonId ? this.getElement(buttonId) : null;
    }

    showStatusMessage(message, duration = 3000) {
        this.appUiStateManager?.showStatusMessage(message, duration);
    }

    updateHighlightButtonState(word, isHighlighted) {
        this.appUiStateManager?.updateHighlightButtonState(word, isHighlighted);
    }

    updateRecordingIndicator() {
        this.appUiStateManager?.updateRecordingIndicator();
    }

    async summarizeText(text, forceRefresh = false, style = "paragraph") {
        return this.aiWorkflowManager?.summarizeText(text, forceRefresh, style);
    }

    async processKeywords(targetSessionId = null) {
        await this.aiWorkflowManager?.processKeywords(targetSessionId);
    }

    async reprocessAllKeywords() {
        await this.aiWorkflowManager?.reprocessAllKeywords();
    }


    deleteKeyword(keyword) {
        this.appUiStateManager?.deleteKeyword(keyword);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.streamNoteInstance = new StreamNote();
});