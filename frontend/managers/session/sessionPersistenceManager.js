/**
 * SessionPersistenceManager - centralizes session save/update operations.
 */
class SessionPersistenceManager {
    constructor(app) {
        this.app = app;
    }

    saveToSession(targetSessionId = null) {
        if (!this.app.sessionManager) return;

        const sessionId = targetSessionId || this.app.recordingSessionId || this.app.sessionManager.currentSessionId;
        const session = this.app.sessionManager.getSession(sessionId);

        if (!session) {
            console.error(`[ERROR] Session ${sessionId} not found`);
            return;
        }

        const transcripts = this.app.recordingManager.getTranscriptData();
        this.app.sessionManager.updateTranscriptsForSession(sessionId, transcripts);

        if (this.app.keywordManager) {
            this.app.sessionManager.updateCurrentKeywords(this.app.keywordManager.extracts);
            this.app.sessionManager.updateCurrentHighlights(this.app.keywordManager.highlights);
            this.app.sessionManager.updateCurrentExplanationHistory(this.app.keywordManager.explanationHistory);

            this.app.sessionManager.updateCurrentKeywordCache(this.app.keywordManager.extractsCache);
            this.app.sessionManager.updateCurrentHighlightCache(this.app.keywordManager.highlightCache);
            this.app.sessionManager.updateCurrentExplanationCache(this.app.keywordManager.explanationCache);
        }

        const translationData = this.app.translationManager.getTranslationData();
        if (translationData && Object.keys(translationData).length > 0) {
            this.app.sessionManager.updateCurrentTranslations(translationData, this.app.language);
        }

        this.app.sessionManager.updateCurrentSummaryCache(this.app.summaryCache);

        const settings = {
            translationEnabled: this.app.translationEnabled,
            language: this.app.language
        };
        this.app.sessionManager.updateCurrentSettings(settings);

        this.app.updateSessionStats();
    }

    saveSettingsToSession() {
        if (!this.app.sessionManager) return;

        const settings = {
            language: this.app.language,
            explanationLanguage: this.app.explanationLanguage
        };
        this.app.sessionManager.updateCurrentSettings(settings);

        if (this.app.summaryCache && Object.keys(this.app.summaryCache).length > 0) {
            const session = this.app.sessionManager.getCurrentSession();
            if (session) {
                session.summaryCache = { ...this.app.summaryCache };
                this.app.sessionManager.saveSessions();
            }
        }

        if (this.app.keywordManager && this.app.keywordManager.explanationHistory) {
            this.app.sessionManager.updateCurrentExplanationHistory(this.app.keywordManager.explanationHistory);
        }
    }

    savePanelState() {
        if (this.app.sessionManager.getCurrentSession()) {
            this.app.sessionManager.updateCurrentSettings({
                layout: this.app.panelManager.currentLayout,
                translationEnabled: this.app.panelManager.translationEnabled,
                translationLayout: this.app.panelManager.translationLayout
            });
        }

        this.app.panelManager.savePanelState();
    }

    loadPanelState() {
        // Layout state is already handled by PanelManager.
    }
}

window.SessionPersistenceManager = SessionPersistenceManager;
