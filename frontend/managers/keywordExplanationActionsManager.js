/**
 * KeywordExplanationActionsManager - handles explanation-related UI actions.
 */
class KeywordExplanationActionsManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    async reexplainExplanation(keyword) {
        const app = window.streamNoteInstance;
        const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;
        const operationTracker = app?.operationManager?.startExplanation(executionContextSnapshot);

        const allExplanations = document.querySelectorAll('.keyword-explanation');
        let wrapper = null;

        for (const elem of allExplanations) {
            if (elem.getAttribute('data-keyword-text') === keyword) {
                wrapper = elem;
                break;
            }
        }

        if (!wrapper) {
            console.warn(`[KeywordManager] Wrapper not found for keyword: ${keyword}`);
            if (operationTracker) operationTracker.abort('Wrapper not found');
            return;
        }

        const contentElement = wrapper.querySelector('.explanation-content');
        if (!contentElement) {
            if (operationTracker) operationTracker.abort('Content element not found');
            return;
        }

        if (operationTracker && !operationTracker.isValid(app)) {
            console.log('[KeywordManager] Context changed before reexplain');
            operationTracker.abort('Context changed before reexplain');
            return;
        }

        contentElement.innerHTML = '<p class="placeholder">Refreshing...</p>';

        const cacheKey = `${keyword}|${window.streamNoteInstance?.explanationLanguage || 'English'}`;
        if (this.keywordManager.extractsCache[cacheKey]) delete this.keywordManager.extractsCache[cacheKey];
        if (this.keywordManager.highlightCache[cacheKey]) delete this.keywordManager.highlightCache[cacheKey];
        if (this.keywordManager.explanationCache[cacheKey]) delete this.keywordManager.explanationCache[cacheKey];

        await this.keywordManager.fetchAndShowExplanation(keyword, wrapper);
    }

    copyExplanation(keyword) {
        const allExplanations = document.querySelectorAll('.keyword-explanation');
        let wrapper = null;

        for (const elem of allExplanations) {
            if (elem.getAttribute('data-keyword-text') === keyword) {
                wrapper = elem;
                break;
            }
        }

        if (!wrapper) return;

        const contentElement = wrapper.querySelector('.explanation-content');
        if (!contentElement) return;

        const text = contentElement.innerText || contentElement.textContent;

        if (!text || text.includes('Loading') || text.includes('placeholder')) {
            alert('Explanation not available yet');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            const toolbar = wrapper.querySelector('.explanation-toolbar');
            if (toolbar) {
                const copyBtn = toolbar.querySelector('[onclick*="copyExplanation"]');
                if (copyBtn) {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 2000);
                }
            }
        }).catch(err => {
            console.error('[KeywordManager] Copy failed:', err);
            alert('Failed to copy explanation');
        });
    }

}

window.KeywordExplanationActionsManager = KeywordExplanationActionsManager;
