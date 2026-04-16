/**
 * KeywordCollectionManager - handles keyword/explanation collection state operations.
 */
class KeywordCollectionManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    addToExplanations(term) {
        term = term.trim();
        if (!term) return;

        // Move term to front (dedupe + recency ordering).
        this.keywordManager.explanations = this.keywordManager.explanations.filter(t => t !== term);
        this.keywordManager.explanations.unshift(term);

        if (this.keywordManager.explanations.length > 20) {
            this.keywordManager.explanations = this.keywordManager.explanations.slice(0, 20);
        }

        if (window.streamNoteInstance) {
            window.streamNoteInstance.sessionManager?.updateCurrentExplanations(this.keywordManager.explanations);
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    removeFromExplanations(term) {
        this.keywordManager.explanations = this.keywordManager.explanations.filter(t => t !== term);

        if (window.streamNoteInstance) {
            window.streamNoteInstance.sessionManager?.updateCurrentExplanations(this.keywordManager.explanations);
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    deleteKeywordItem(keyword) {
        if (window.streamNoteInstance) {
            window.streamNoteInstance.deleteKeyword(keyword);
        }
    }

    toggleExtractedKeywordHighlight(keyword) {
        if (!this.keywordManager.highlightManager) {
            this.keywordManager.onStatusMessage('Highlight manager not available', 1500);
            return;
        }

        if (!keyword) {
            this.keywordManager.onStatusMessage('No keyword to toggle', 1500);
            return;
        }

        // Toggle only affects manual highlight collection; extracted list remains intact.
        this.keywordManager.highlightManager.toggleHighlight(keyword);
        this.keywordManager.displayExtracts();
        this.keywordManager.displayHighlights();
    }

    async processText(text) {
        const keywords = await this.keywordManager.extractKeywords(text);

        if (keywords.length > 0) {
            this.keywordManager.extracts = [...new Set([...this.keywordManager.extracts, ...keywords])];
        }

        return keywords;
    }

    reset() {
        this.keywordManager.currentKeywords = [];
        this.keywordManager.explanations = [];
        this.keywordManager.highlights = [];
        this.keywordManager.extracts = [];

        if (this.keywordManager.keywordElement) {
            this.keywordManager.keywordElement.innerHTML = '';
        }
    }
}

window.KeywordCollectionManager = KeywordCollectionManager;
