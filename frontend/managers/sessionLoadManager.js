/**
 * SessionLoadManager - restores current session data into runtime managers and UI.
 */
class SessionLoadManager {
    constructor(app) {
        this.app = app;
    }

    loadCurrentSession() {
        const session = this.app.sessionManager.getCurrentSession();
        if (!session) return;

        this.app.executionContextVersion++;
        this.app.operationManager.abortAll(`Session switched to ${this.app.sessionManager.currentSessionId}`);

        this.app.displaySessionId = this.app.sessionManager.currentSessionId;
        this.app.updateSessionInfo();

        if (this.app.recordingSessionId !== null && this.app.recordingSessionId !== this.app.sessionManager.currentSessionId) {
            const recordingSession = this.app.sessionManager.getSession(this.app.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            this.app.showStatusMessage(`Recording in "${recordingSessionName}" will continue in background`, 3000);
        }

        this.app.updateRecordingIndicator();
        this.app.updateRecordingButtonState();

        this.app.recordingManager.isTranscribing = false;

        const defaultSettings = this.app.sessionManager.getDefaultSettings();

        if (session.settings && session.settings.language) {
            this.app.language = session.settings.language;
        } else {
            this.app.language = defaultSettings.defaultLanguage || "Chinese";
        }

        if (session.settings && session.settings.explanationLanguage) {
            this.app.explanationLanguage = session.settings.explanationLanguage;
        } else {
            this.app.explanationLanguage = defaultSettings.defaultExplanationLanguage || "Chinese";
        }

        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.value = this.app.language;
        }

        this.app.syncExplanationLanguageSelectors();

        this.app.recordingManager.setTranscriptData(session.transcripts || {});
        this.app.recordingManager.setSessionStartTime(session.startTime);
        this.app.panelManager.setTranscriptData(session.transcripts || {});

        this.app.updateTranscriptionContext();

        const translationsForLanguage = (session.translations && session.translations[this.app.language])
            ? { ...session.translations[this.app.language] }
            : {};
        this.app.translationManager.setLanguage(this.app.language);
        this.app.translationManager.setTranslationData(translationsForLanguage);
        this.app.translationResults = translationsForLanguage;

        if (this.app.translationManager && session.startTime) {
            this.app.translationManager.sessionStartTime = session.startTime;
        }

        this.app.summaryCache = session.summaryCache ? { ...session.summaryCache } : {};

        if (session.highlightIdMap) {
            this.app.highlightIdMap = { ...session.highlightIdMap };
            if (this.app.highlightManager) {
                this.app.highlightManager.setHighlightIdMap(this.app.highlightIdMap);
            }
        }

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

        if (this.app.keywordManager) {
            this.app.keywordManager.reset();

            if (session.keywords && session.keywords.length > 0) {
                this.app.keywordManager.extracts = [...new Set(session.keywords)];
            }

            if (session.highlights && session.highlights.length > 0) {
                this.app.keywordManager.highlights = [...new Set(session.highlights)];
            } else {
                this.app.keywordManager.highlights = [];
            }

            if (session.highlightPositions && Object.keys(session.highlightPositions).length > 0) {
                this.app.keywordManager.setHighlightPositions({ ...session.highlightPositions });
                if (this.app.highlightManager) {
                    this.app.highlightManager.highlightPositions = { ...session.highlightPositions };
                }
            }

            if (session.explanationHistory && session.explanationHistory.length > 0) {
                this.app.keywordManager.explanationHistory = [...session.explanationHistory];
            } else {
                this.app.keywordManager.explanationHistory = [];
            }

            if (session.explanations && session.explanations.length > 0) {
                this.app.keywordManager.explanations = [...session.explanations];
            } else {
                this.app.keywordManager.explanations = [];
            }

            this.app.keywordManager.extractsCache = session.keywordCache ? { ...session.keywordCache } : {};
            this.app.keywordManager.highlightCache = session.highlightCache ? { ...session.highlightCache } : {};
            this.app.keywordManager.explanationCache = session.explanationCache ? { ...session.explanationCache } : {};

            if (this.app.highlightIdMap === undefined) {
                this.app.highlightIdMap = {};
            }
            this.app.keywordManager.highlights.forEach(text => {
                if (!this.app.highlightIdMap[text]) {
                    this.app.highlightIdMap[text] = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
                }
            });

            if (this.app.keywordManager.explanationHistory && this.app.keywordManager.explanationHistory.length > 0) {
                const currentLanguage = this.app.explanationLanguage || "English";
                const lastRecordForLanguage = this.app.keywordManager.explanationHistory.find(
                    record => record.language === currentLanguage
                );

                const recordToRestore = lastRecordForLanguage || this.app.keywordManager.explanationHistory[0];

                setTimeout(() => {
                    this.app.keywordManager.restoreExplanationHistoryRecord(recordToRestore);
                }, 100);
            }
        }

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            this.app.panelManager.setLayout(this.app.panelManager.currentLayout, true);
        }

        const summaryDisplay = document.getElementById("summary-display");
        if (summaryDisplay) {
            const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");
            const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
            const cacheKey = `${this.app.explanationLanguage}-${selectedStyle}`;
            if (this.app.summaryCache && this.app.summaryCache[cacheKey]) {
                const cachedSummary = this.app.summaryCache[cacheKey];
                summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(cachedSummary, selectedStyle);
            } else {
                summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';
            }
        }

        this.app.panelManager.updateAutoScrollButton();

        this.app.updateDisplay();

        if (this.app.keywordManager) {
            this.app.keywordManager.updateAllKeywordDisplays();
        }

        if (this.app.panelManager && this.app.panelManager.isTranslationEnabled() && this.app.translationEnabled) {
            setTimeout(() => {
                if (this.app.translationManager) {
                    this.app.translationManager.translateMissingContent();
                }
            }, 200);
        }

        this.app.updateStatus(`Loaded: ${session.name}`);
    }
}

window.SessionLoadManager = SessionLoadManager;
