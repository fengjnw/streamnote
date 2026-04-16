/**
 * KeywordExplanationNavigationManager - handles explanation panel navigation and entry flow.
 */
class KeywordExplanationNavigationManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        word = word.trim();
        if (!word) return;

        if (word.length > 100) {
            alert('Please select less than 100 characters to explain');
            return;
        }

        if (!sourcePanel) {
            // Preserve the original source panel so later context extraction stays consistent.
            sourcePanel = this.keywordManager.wordSourcePanel[word] || 'transcript';
        } else {
            this.keywordManager.wordSourcePanel[word] = sourcePanel;
        }

        if (positionInfo) {
            this.keywordManager.highlightPositions[word] = positionInfo;
        }

        this.keywordManager.currentQueryWord = word;
        this.keywordManager.currentQuerySourcePanel = sourcePanel;
        this.keywordManager.currentQueryPositionInfo = positionInfo;

        const historyContent = document.getElementById('historyContent');
        if (this.keywordManager.panelManager && historyContent) {
            this.keywordManager.panelManager.showSidePanelContent(historyContent, 'Explanation');
        }

        if (window.streamNoteInstance && window.streamNoteInstance.scrollToWord) {
            // Let panel state settle first, then scroll to the keyword anchor.
            setTimeout(() => {
                window.streamNoteInstance.scrollToWord(word, sourcePanel);
            }, 300);
        }

        // Trigger explanation rendering after scroll to reduce layout thrash.
        setTimeout(() => {
            this.keywordManager.explanationFetchManager?.displayExplanationFocusView(word);
        }, 350);

        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }
}

window.KeywordExplanationNavigationManager = KeywordExplanationNavigationManager;
