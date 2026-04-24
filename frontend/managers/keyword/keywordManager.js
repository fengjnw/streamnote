

/**
 * KeywordManager - Orchestrates keyword extraction, display, explanations, and context
 * Coordinates multiple specialized sub-managers for different keyword-related features:
 * - Display and rendering
 * - Context building and extraction
 * - Explanation fetching and navigation
 * - History tracking
 * - Collection and highlighting
 * 
 * Manages caching, executes operations with context awareness, and delegates to sub-managers.
 * 
 * @class
 * @example
 * const manager = new KeywordManager({
 *   apiClient: apiClientInstance,
 *   recordingManager: recordingManagerInstance,
 *   panelManager: panelManagerInstance
 * });
 * const keywords = await manager.extractKeywords('sample text');
 */
class KeywordManager {
    /**
     * Create a new KeywordManager instance
     * @param {Object} config - Configuration object
     * @param {string} [config.apiUrl] - API endpoint for keyword extraction (default: "/api/extract-keywords")
     * @param {StreamNoteApiClient} [config.apiClient] - API client for requests
     * @param {HTMLElement} [config.keywordElement] - Element to display keywords
     * @param {RecordingManager} [config.recordingManager] - Reference to recording manager
     * @param {TranslationManager} [config.translationManager] - Reference to translation manager
     * @param {HighlightManager} [config.highlightManager] - Reference to highlight manager
     * @param {PanelManager} [config.panelManager] - Reference to panel manager
     * @param {Function} [config.getTranscriptData] - Callback to retrieve transcript data
     * @param {Function} [config.onStatusMessage] - Callback for status messages
     */
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "/api/extract-keywords";
        this.apiClient = config.apiClient || null;
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");

        // Consolidated managers (3 instead of 11)
        this.displayCollection = new KeywordDisplayCollection(this);
        this.contextManager = new KeywordContext(this);
        this.explanationManager = new KeywordExplanation(this);

        // Legacy aliases for backward compatibility with references to old manager names
        this.historyManager = this.contextManager;  // historyManager methods now in contextManager

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

        this.pronunciationManager = new KeywordContext(this);  // contextManager now includes pronunciation
        this.isPronouncing = false;
        this.pronunciationManager?.setupPronounceButton();

        this.lastKnownTranscriptData = null;

        this.currentExpanationRequestId = 0;
        this.currentLoadingKeyword = null;
    }

    /**
     * Extract keywords from text using AI service
     * @async
     * @param {string} text - Text to extract keywords from
     * @returns {Promise<string[]>} Array of extracted keywords
     */
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

    /**
     * Display all highlights in keyword display area
     * @public
     */
    displayHighlights() {
        this.displayCollection?.displayHighlights();
    }

    /**
     * Display all extracted items in keyword display area
     * @public
     */
    displayExtracts() {
        this.displayCollection?.displayExtracts();
    }

    /**
     * Update all keyword-related display elements
     * @public
     */
    updateAllKeywordDisplays() {
        this.displayCollection?.updateAllKeywordDisplays();
    }

    /**
     * Scroll to a specific keyword in the display
     * @public
     * @param {string} keyword - Keyword to scroll to
     */
    scrollToKeyword(keyword) {
        this.displayCollection?.scrollToKeyword(keyword);
    }

    /**
     * Update highlight positions map for visual rendering
     * @public
     * @param {Object} positions - Mapping of highlight text to position data
     * @param {string[]} positions[].sourceIndices - Source line indices
     * @param {number} positions[].startIndex - Start character index
     * @param {number} positions[].endIndex - End character index
     */
    setHighlightPositions(positions) {
        this.displayCollection?.setHighlightPositions(positions);
    }

    /**
     * Delete a keyword item from the collection
     * @public
     * @param {string} keyword - Keyword to delete
     */
    deleteKeywordItem(keyword) {
        this.displayCollection?.deleteKeywordItem(keyword);
    }

    /**
     * Toggle highlight visibility for an extracted keyword
     * @public
     * @param {string} keyword - Keyword to toggle highlight for
     */
    toggleExtractedKeywordHighlight(keyword) {
        this.displayCollection?.toggleExtractedKeywordHighlight(keyword);
    }

    /**
     * Open explanation panel for a keyword/word
     * @async
     * @public
     * @param {string} word - Word or keyword to explain
     * @param {Object} [positionInfo] - Position information in text
     * @param {string} [sourcePanel] - Source panel where word appears
     */
    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        await this.explanationManager?.openExplanationForWord(word, positionInfo, sourcePanel);
    }

    /**
     * Refresh all currently expanded keyword explanations from server
     * @public
     */
    refreshExpandedExplanations() {
        this.explanationManager?.refreshExpandedExplanations();
    }

    /**
     * Process text and extract keywords
     * @async
     * @public
     * @param {string} text - Text to process
     * @returns {Promise<*>} Processing result
     */
    async processText(text) {
        return await this.displayCollection?.processText(text);
    }

    /**
     * Reset all keyword data and clear displays
     * @public
     */
    reset() {
        this.displayCollection?.reset();
    }
}

window.KeywordManager = KeywordManager;
