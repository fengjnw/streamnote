/**
 * KeywordExplanation - Handles the complete explanation lifecycle (fetch, display, actions, navigation).
 * Consolidates API fetching, user actions (re-explain, copy), and panel navigation flow.
 */
class KeywordExplanation {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    // ========== Navigation Methods ==========

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
            this.displayExplanationFocusView(word);
        }, 350);

        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    // ========== Fetch and Display Methods ==========

    async fetchAndShowExplanation(keyword, container) {
        const contentElement = container.querySelector('.explanation-content');

        if (!contentElement) {
            console.error('[KeywordManager] Content element not found');
            return;
        }

        const app = window.streamNoteInstance;
        // Tie request lifecycle to current app context so stale streams are ignored.
        const explanationOperation = OperationGuards.start(app, 'explanation');
        const endExplanationOperation = OperationGuards.endOnce(explanationOperation);
        const abortSignal = OperationGuards.getSignal(explanationOperation);

        try {
            if (!OperationGuards.isValid(explanationOperation)) {
                console.log('[KeywordManager] Context changed before explanation fetch');
                endExplanationOperation('Context changed before request');
                return;
            }

            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
            const cacheKey = `${keyword}|${explanationLanguage}`;

            if (this.keywordManager.explanationCache[cacheKey]) {
                if (!OperationGuards.isValid(explanationOperation)) {
                    endExplanationOperation('Context changed during cache check');
                    return;
                }
                contentElement.innerHTML = `<p>${this.keywordManager.explanationCache[cacheKey]}</p>`;
                endExplanationOperation('Explanation from cache');
                return;
            }

            const context = this.keywordManager.contextManager?.getContextForKeyword(keyword) || '';

            const payload = {
                keyword,
                language: explanationLanguage,
                context,
            };
            const response = this.keywordManager.apiClient
                ? await this.keywordManager.apiClient.explainKeyword(payload, abortSignal)
                : await fetch(this.keywordManager.explanationApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: abortSignal,
                });

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log('[KeywordManager] Context changed after fetch');
                endExplanationOperation('Context changed after fetch');
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[KeywordManager] API error: ${response.status} ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let explanation = '';

            try {
                while (true) {
                    if (!OperationGuards.isValid(explanationOperation)) {
                        console.log('[KeywordManager] Context changed during stream');
                        reader.cancel();
                        endExplanationOperation('Context changed during stream');
                        return;
                    }

                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    explanation += chunk;

                    if (explanation && contentElement && contentElement.parentElement) {
                        // Render incrementally for better perceived latency.
                        contentElement.innerHTML = `<p>${explanation}</p>`;
                    }
                }

                const finalChunk = decoder.decode();
                explanation += finalChunk;
                if (finalChunk && contentElement && contentElement.parentElement) {
                    contentElement.innerHTML = `<p>${explanation}</p>`;
                }
            } finally {
                reader.releaseLock();
            }

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log('[KeywordManager] Context changed before display');
                endExplanationOperation('Context changed before display');
                return;
            }

            this.keywordManager.explanationCache[cacheKey] = explanation;

            if (contentElement && contentElement.parentElement) {
                contentElement.innerHTML = `<p>${explanation}</p>`;
            } else {
                // Fallback in case the original container was unmounted during async work.
                const latestContentElement = document.getElementById('explanation-content');
                if (latestContentElement) {
                    latestContentElement.innerHTML = `<p>${explanation}</p>`;
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[KeywordManager] Error fetching explanation:', error);
                contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;
            }
        } finally {
            endExplanationOperation('Explanation completed');
        }
    }

    async displayExplanationFocusView(word) {
        const focusView = document.getElementById('explanation-focus-view');
        if (!focusView) return;

        if (window.streamNoteInstance && window.streamNoteInstance.panelManager) {
            window.streamNoteInstance.panelManager.showExplanationPanel();
        }

        const wordElement = document.getElementById('current-explanation-word');
        const contentElement = document.getElementById('explanation-content');
        const headerDiv = document.querySelector('.explanation-header');
        const reexplainBtn = document.getElementById('reexplain-explanation-btn');
        const contextDiv = document.getElementById('word-context');

        if (!wordElement || !contentElement) return;

        this.keywordManager.currentLoadingKeyword = word;
        wordElement.textContent = word;

        if (headerDiv) headerDiv.classList.remove('hidden');
        if (reexplainBtn) reexplainBtn.disabled = false;
        const pronounceBtn = document.getElementById('pronounce-current-word-btn');
        if (pronounceBtn) pronounceBtn.disabled = false;

        const isHighlighted = this.keywordManager.highlights?.includes(word) || false;
        window.streamNoteInstance?.updateHighlightButtonState(word, isHighlighted);

        contentElement.innerHTML = '';
        const placeholder = document.createElement('p');
        placeholder.className = 'placeholder';
        placeholder.textContent = 'Loading explanation...';
        contentElement.appendChild(placeholder);

        if (contextDiv) contextDiv.style.display = 'none';

        await this.fetchAndShowExplanationForFocusView(word, contentElement);
    }

    async fetchAndShowExplanationForFocusView(keyword, contentElement) {
        const app = window.streamNoteInstance;
        let requestId = null;
        let explanationOperation = null;
        let endExplanationOperation = () => { };

        try {
            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
            const cacheKey = `${keyword}|${explanationLanguage}`;

            if (this.keywordManager.explanationCache[cacheKey]) {
                contentElement.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = this.keywordManager.explanationCache[cacheKey];
                contentElement.appendChild(p);
                const contextInfo = this.keywordManager.contextManager?.updateWordContext(keyword) || null;
                this.keywordManager.historyManager?.saveExplanationHistory(keyword, this.keywordManager.explanationCache[cacheKey], contextInfo);
                return;
            }

            requestId = ++this.keywordManager.currentExpanationRequestId;
            // Request ID enforces last-request-wins when users click multiple words quickly.
            explanationOperation = OperationGuards.start(app, 'explanation');
            endExplanationOperation = OperationGuards.endOnce(explanationOperation);

            if (!contentElement || !contentElement.parentElement) {
                console.warn(`[KeywordManager] Request ${requestId}: contentElement is stale, re-fetching...`);
                contentElement = document.getElementById('explanation-content');
                if (!contentElement) {
                    console.error(`[KeywordManager] Request ${requestId}: Cannot find explanation-content element!`);
                    endExplanationOperation('contentElement not found');
                    return;
                }
            }

            const context = this.keywordManager.contextManager?.getContextForKeyword(keyword) || '';

            const payload = {
                keyword,
                language: explanationLanguage,
                context,
            };
            const signal = OperationGuards.getSignal(explanationOperation);
            const response = this.keywordManager.apiClient
                ? await this.keywordManager.apiClient.explainKeyword(payload, signal)
                : await fetch(this.keywordManager.explanationApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal,
                });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[KeywordManager] Request ${requestId}: API error: ${response.status} ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let explanation = '';
            let chunkCount = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    if (this.keywordManager.currentExpanationRequestId !== requestId) {
                        endExplanationOperation('New explanation requested');
                        return;
                    }

                    if (!OperationGuards.isValid(explanationOperation)) {
                        console.log(`[KeywordManager] Request ${requestId}: Execution context changed: ${OperationGuards.getChangeReason(explanationOperation)}`);
                        endExplanationOperation('Execution context changed during stream');
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    explanation += chunk;
                    chunkCount++;

                    if (explanation && contentElement && contentElement.parentElement) {
                        if (chunkCount === 1) {
                            contentElement.innerHTML = '';
                        }

                        let p = contentElement.querySelector('p');
                        if (!p) {
                            p = document.createElement('p');
                            contentElement.appendChild(p);
                        }
                        p.textContent = explanation;
                    }
                }
                const finalChunk = decoder.decode();
                explanation += finalChunk;

                if (this.keywordManager.currentExpanationRequestId !== requestId) {
                    endExplanationOperation('New explanation requested (final check)');
                    return;
                }

                if (!OperationGuards.isValid(explanationOperation)) {
                    console.log(`[KeywordManager] Request ${requestId}: Execution context changed at final: ${OperationGuards.getChangeReason(explanationOperation)}`);
                    endExplanationOperation('Execution context changed at final');
                    return;
                }

                if (contentElement && contentElement.parentElement) {
                    let p = contentElement.querySelector('p');
                    if (!p) {
                        contentElement.innerHTML = '';
                        p = document.createElement('p');
                        contentElement.appendChild(p);
                    }
                    p.textContent = explanation;
                }
            } finally {
                reader.releaseLock();
            }

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log(`[KeywordManager] Request ${requestId}: Context changed before cache save, discarding result`);
                endExplanationOperation('Context changed before cache save');
                return;
            }

            this.keywordManager.explanationCache[cacheKey] = explanation;

            const contextInfo = this.keywordManager.contextManager?.updateWordContext(keyword) || null;
            this.keywordManager.historyManager?.saveExplanationHistory(keyword, explanation, contextInfo);

            endExplanationOperation('Explanation completed successfully');
        } catch (error) {
            console.error('[KeywordManager] Error fetching explanation:', error);

            endExplanationOperation(`Error: ${error.message}`);

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log(`[KeywordManager] Request ${requestId}: Context changed, not displaying error`);
                return;
            }

            if (contentElement && contentElement.parentElement) {
                contentElement.innerHTML = '';
                const p = document.createElement('p');
                p.className = 'error';
                p.textContent = `Failed to load explanation: ${error.message}`;
                contentElement.appendChild(p);
            }

            this.keywordManager.contextManager?.updateWordContext(keyword);
        }
    }

    // ========== Action Methods ==========

    async reexplainCurrentExplanation() {
        const app = window.streamNoteInstance;
        const explanationOperation = OperationGuards.start(app, 'explanation');
        const endExplanationOperation = OperationGuards.endOnce(explanationOperation);

        try {
            const currentWordEl = document.getElementById('current-explanation-word');
            const contentElement = document.getElementById('explanation-content');

            if (!currentWordEl || !contentElement) {
                endExplanationOperation('Elements not found');
                return;
            }

            if (!OperationGuards.isValid(explanationOperation)) {
                console.log('[KeywordManager] Context changed before reexplain current');
                endExplanationOperation('Context changed before reexplain');
                return;
            }

            const word = currentWordEl.textContent;
            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
            const cacheKey = `${word}|${explanationLanguage}`;

            delete this.keywordManager.explanationCache[cacheKey];

            contentElement.innerHTML = '<p class="placeholder">Refreshing explanation...</p>';
            await this.fetchAndShowExplanationForFocusView(word, contentElement);
        } finally {
            endExplanationOperation('Reexplain current completed');
        }
    }

    refreshExpandedExplanations() {
        const currentWordEl = document.getElementById('current-explanation-word');
        const contentElement = document.getElementById('explanation-content');

        if (!currentWordEl || !contentElement) return;

        const word = currentWordEl.textContent;
        this.fetchAndShowExplanationForFocusView(word, contentElement);
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

            await this.fetchAndShowExplanation(keyword, wrapper);
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

window.KeywordExplanation = KeywordExplanation;
