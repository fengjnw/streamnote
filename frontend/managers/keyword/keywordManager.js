

class KeywordManager {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "/api/extract-keywords";
        this.apiClient = config.apiClient || null;
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");
        this.displayManager = new KeywordDisplayManager(this);
        this.contextManager = new KeywordContextManager(this);
        this.historyManager = new KeywordHistoryManager(this);
        this.explanationFetchManager = new KeywordExplanationFetchManager(this);
        this.explanationActionsManager = new KeywordExplanationActionsManager(this);
        this.explanationNavigationManager = new KeywordExplanationNavigationManager(this);
        this.collectionManager = new KeywordCollectionManager(this);
        this.utilitiesManager = new KeywordUtilitiesManager(this);

        this.currentKeywords = [];
        this.explanations = [];

        this.highlights = [];
        this.extracts = [];
        this.explanationHistory = [];

        this.highlightPositions = config.highlightPositions || {};

        this.wordSourcePanel = {};

        this.recordingManager = config.recordingManager || null;
        this.getTranscriptData = config.getTranscriptData || (() => ({}));

        this.translationManager = config.translationManager || null;

        this.highlightManager = config.highlightManager || null;

        this.explanationApiUrl = config.explanationApiUrl || "/api/explain-keyword";

        this.extractsCache = {};
        this.highlightCache = {};
        this.explanationCache = {};

        this.expandedKeywords = new Set();

        this.historyElement = config.historyElement || document.getElementById("query-history-list");

        this.panelManager = config.panelManager || null;

        this.onStatusMessage = config.onStatusMessage || (() => { });

        this.currentContextPositionInfo = null;  // { sourceIndices, container, sourcePanel }
        this.currentContextWord = null;

        this.pronunciationManager = new KeywordPronunciationManager(this);

        this.isPronouncing = false;
        this.pronunciationManager?.setupPronounceButton();

        this.lastKnownTranscriptData = null;

        this.currentExpanationRequestId = 0;
        this.currentLoadingKeyword = null;
    }

    async extractKeywords(text) {
        if (!text || text.length < 10) {
            return [];
        }

        const app = window.streamNoteInstance;
        const keywordsOperation = OperationGuards.start(app, "keywords");
        const endKeywordsOperation = OperationGuards.endOnce(keywordsOperation);

        try {
            const payload = {
                text: text
            };

            const signal = OperationGuards.getSignal(keywordsOperation);
            const response = this.apiClient
                ? await this.apiClient.extractKeywords(payload, signal)
                : await fetch(this.apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal,
                });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            if (!OperationGuards.isValid(keywordsOperation)) {
                console.log(`[KeywordManager] extractKeywords: Context changed before reading response`);
                endKeywordsOperation('Context changed before reading response');
                return [];
            }

            const data = await response.json();

            if (!OperationGuards.isValid(keywordsOperation)) {
                console.log(`[KeywordManager] extractKeywords: Context changed after reading response, discarding keywords`);
                endKeywordsOperation('Context changed after reading response');
                return [];
            }

            this.currentKeywords = data.keywords || [];

            endKeywordsOperation('Keywords extraction completed');

            return this.currentKeywords;

        } catch (error) {
            console.error("[KeywordManager] Error:", error);

            endKeywordsOperation(`Error: ${error.message}`);

            return [];
        }
    }

    displayHighlights() {
        this.displayManager?.displayHighlights();
    }

    displayExtracts() {
        this.displayManager?.displayExtracts();
    }

    updateAllKeywordDisplays() {
        this.displayManager?.updateAllKeywordDisplays();
    }

    scrollToKeyword(keyword) {
        this.utilitiesManager?.scrollToKeyword(keyword);
    }

    /**
     * @param {Object} positions - { "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }
     */
    setHighlightPositions(positions) {
        this.utilitiesManager?.setHighlightPositions(positions);
    }

    deleteKeywordItem(keyword) {
        this.collectionManager?.deleteKeywordItem(keyword);
    }

    toggleExtractedKeywordHighlight(keyword) {
        this.collectionManager?.toggleExtractedKeywordHighlight(keyword);
    }

    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        await this.explanationNavigationManager?.openExplanationForWord(word, positionInfo, sourcePanel);
    }

    refreshExpandedExplanations() {
        this.explanationFetchManager?.refreshExpandedExplanations();
    }

    async processText(text) {
        return await this.collectionManager?.processText(text);
    }

    reset() {
        this.collectionManager?.reset();
    }
}

window.KeywordManager = KeywordManager;
