/**
 * KeywordExplanationActionsManager - handles explanation-related UI actions.
 */
class KeywordExplanationActionsManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    async reexplainExplanation(keyword) {
        const app = window.streamNoteInstance;
        const explanationOperation = OperationGuards.start(app, "explanation");
        const endExplanationOperation = OperationGuards.endOnce(explanationOperation);

        try {
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
                endExplanationOperation('Wrapper not found');
                return;
            }

            const contentElement = wrapper.querySelector('.explanation-content');
            if (!contentElement) {
                endExplanationOperation('Content element not found');
                return;
            }

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log('[KeywordManager] Context changed before reexplain');
                endExplanationOperation('Context changed before reexplain');
                return;
            }

            contentElement.innerHTML = '<p class="placeholder">Refreshing...</p>';

            // Remove all scoped caches so re-explain always fetches a fresh answer.
            const cacheKey = `${keyword}|${window.streamNoteInstance?.explanationLanguage || 'English'}`;
            if (this.keywordManager.extractsCache[cacheKey]) delete this.keywordManager.extractsCache[cacheKey];
            if (this.keywordManager.highlightCache[cacheKey]) delete this.keywordManager.highlightCache[cacheKey];
            if (this.keywordManager.explanationCache[cacheKey]) delete this.keywordManager.explanationCache[cacheKey];

            await this.keywordManager.explanationFetchManager?.fetchAndShowExplanation(keyword, wrapper);
        } finally {
            endExplanationOperation('Reexplain action completed');
        }
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
