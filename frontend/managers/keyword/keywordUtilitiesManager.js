/**
 * KeywordUtilitiesManager - handles lightweight keyword utility operations.
 */
class KeywordUtilitiesManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    scrollToKeyword(keyword) {
        const sourcePanel = this.keywordManager.wordSourcePanel[keyword] || 'transcript';

        if (window.streamNoteInstance && window.streamNoteInstance.scrollToWord) {
            window.streamNoteInstance.scrollToWord(keyword, sourcePanel);
        }
    }

    setHighlightPositions(positions) {
        this.keywordManager.highlightPositions = positions || {};
    }
}

window.KeywordUtilitiesManager = KeywordUtilitiesManager;
