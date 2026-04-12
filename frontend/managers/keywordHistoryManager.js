/**
 * KeywordHistoryManager - handles explanation history persistence and restoration.
 */
class KeywordHistoryManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    saveExplanationHistory(word, explanation, contextDisplayText = null) {
        let context = contextDisplayText || "";
        if (!context) {
            const contextTextEl = document.getElementById("context-text");
            if (contextTextEl) {
                context = contextTextEl.textContent;
            }
        }

        const language = window.streamNoteInstance?.explanationLanguage || "English";
        const positionInfo = this.keywordManager.currentQueryPositionInfo || this.keywordManager.highlightPositions[word] || null;

        const historyRecord = {
            word,
            language,
            explanation,
            context,
            sourceIndices: positionInfo ? positionInfo.sourceIndices : [],
            sourcePanel: this.keywordManager.currentQuerySourcePanel || this.keywordManager.wordSourcePanel[word] || 'transcript',
            timestamp: Date.now(),
        };

        this.keywordManager.explanationHistory.unshift(historyRecord);

        if (this.keywordManager.explanationHistory.length > 50) {
            this.keywordManager.explanationHistory = this.keywordManager.explanationHistory.slice(0, 50);
        }

        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    async restoreExplanationHistoryRecord(historyRecord) {
        if (!historyRecord) return;

        const app = window.streamNoteInstance;
        const explanationOperation = OperationGuards.start(app, "explanation");
        const endExplanationOperation = OperationGuards.endOnce(explanationOperation);

        if (!OperationGuards.isValid(explanationOperation)) {
            console.log('[KeywordManager] Context changed before restore history');
            endExplanationOperation('Context changed before restore');
            return;
        }

        const { word, explanation, context, sourceIndices } = historyRecord;

        const wordElement = document.getElementById("current-explanation-word");
        const contentElement = document.getElementById("explanation-content");
        const contextDiv = document.getElementById("word-context");
        const contextText = document.getElementById("context-text");
        const headerDiv = document.querySelector(".explanation-header");

        if (!OperationGuards.isValid(explanationOperation)) {
            console.log('[KeywordManager] Context changed during UI setup');
            endExplanationOperation('Context changed during setup');
            return;
        }

        if (wordElement) wordElement.textContent = word;

        if (contentElement) {
            contentElement.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = explanation;
            contentElement.appendChild(p);
        }

        if (headerDiv) headerDiv.classList.remove("hidden");

        if (context && contextText) {
            contextText.textContent = context;
            contextDiv.style.display = 'block';
        } else if (contextDiv) {
            contextDiv.style.display = 'none';
        }

        if (sourceIndices && sourceIndices.length > 0) {
            this.keywordManager.highlightPositions[word] = {
                sourceIndices,
            };
            this.keywordManager.wordSourcePanel[word] = historyRecord.sourcePanel || 'transcript';
        }

        endExplanationOperation('History restore completed');
    }
}

window.KeywordHistoryManager = KeywordHistoryManager;
