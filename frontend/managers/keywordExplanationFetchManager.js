/**
 * KeywordExplanationFetchManager - handles explanation fetching and focus-view rendering flow.
 */
class KeywordExplanationFetchManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    async fetchAndShowExplanation(keyword, container) {
        const contentElement = container.querySelector('.explanation-content');

        if (!contentElement) {
            console.error('[KeywordManager] Content element not found');
            return;
        }

        const app = window.streamNoteInstance;
        const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;
        const operationTracker = app?.operationManager?.startExplanation(executionContextSnapshot);
        const abortSignal = operationTracker?.abortController.signal;

        try {
            if (operationTracker && !operationTracker.isValid(app)) {
                console.log('[KeywordManager] Context changed before explanation fetch');
                if (operationTracker) operationTracker.abort('Context changed before request');
                return;
            }

            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
            const cacheKey = `${keyword}|${explanationLanguage}`;

            if (this.keywordManager.explanationCache[cacheKey]) {
                if (operationTracker && !operationTracker.isValid(app)) {
                    if (operationTracker) operationTracker.abort('Context changed during cache check');
                    return;
                }
                contentElement.innerHTML = `<p>${this.keywordManager.explanationCache[cacheKey]}</p>`;
                if (operationTracker) operationTracker.abort('Explanation from cache');
                return;
            }

            const context = this.keywordManager.getContextForKeyword(keyword);

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

            if (operationTracker && !operationTracker.isValid(app)) {
                console.log('[KeywordManager] Context changed after fetch');
                if (operationTracker) operationTracker.abort('Context changed after fetch');
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
                    if (operationTracker && !operationTracker.isValid(app)) {
                        console.log('[KeywordManager] Context changed during stream');
                        reader.cancel();
                        if (operationTracker) operationTracker.abort('Context changed during stream');
                        return;
                    }

                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    explanation += chunk;

                    if (explanation && contentElement && contentElement.parentElement) {
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

            if (operationTracker && !operationTracker.isValid(app)) {
                console.log('[KeywordManager] Context changed before display');
                if (operationTracker) operationTracker.abort('Context changed before display');
                return;
            }

            this.keywordManager.explanationCache[cacheKey] = explanation;

            if (contentElement && contentElement.parentElement) {
                contentElement.innerHTML = `<p>${explanation}</p>`;
            } else {
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
            if (operationTracker) {
                operationTracker.abort('Explanation completed');
            }
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
        let operationTracker = null;
        let requestId = null;

        try {
            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
            const cacheKey = `${keyword}|${explanationLanguage}`;

            if (this.keywordManager.explanationCache[cacheKey]) {
                contentElement.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = this.keywordManager.explanationCache[cacheKey];
                contentElement.appendChild(p);
                const contextInfo = this.keywordManager.updateWordContext(keyword);
                this.keywordManager.saveExplanationHistory(keyword, this.keywordManager.explanationCache[cacheKey], contextInfo);
                return;
            }

            requestId = ++this.keywordManager.currentExpanationRequestId;
            const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;

            if (app && app.operationManager) {
                operationTracker = app.operationManager.startExplanation(executionContextSnapshot);
            }

            if (!contentElement || !contentElement.parentElement) {
                console.warn(`[KeywordManager] Request ${requestId}: contentElement is stale, re-fetching...`);
                contentElement = document.getElementById('explanation-content');
                if (!contentElement) {
                    console.error(`[KeywordManager] Request ${requestId}: Cannot find explanation-content element!`);
                    if (operationTracker) operationTracker.abort('contentElement not found');
                    return;
                }
            }

            const context = this.keywordManager.getContextForKeyword(keyword);

            const payload = {
                keyword,
                language: explanationLanguage,
                context,
            };
            const signal = operationTracker ? operationTracker.getSignal() : undefined;
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
                        reader.releaseLock();
                        if (operationTracker) operationTracker.abort('New explanation requested');
                        return;
                    }

                    if (operationTracker && !operationTracker.isValid(app)) {
                        reader.releaseLock();
                        console.log(`[KeywordManager] Request ${requestId}: Execution context changed: ${ExecutionContext.getChangeReason(executionContextSnapshot, app)}`);
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
                    if (operationTracker) operationTracker.abort('New explanation requested (final check)');
                    return;
                }

                if (operationTracker && !operationTracker.isValid(app)) {
                    console.log(`[KeywordManager] Request ${requestId}: Execution context changed at final: ${ExecutionContext.getChangeReason(executionContextSnapshot, app)}`);
                    if (operationTracker) operationTracker.abort('Execution context changed');
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

            if (operationTracker && !operationTracker.isValid(app)) {
                console.log(`[KeywordManager] Request ${requestId}: Context changed before cache save, discarding result`);
                return;
            }

            this.keywordManager.explanationCache[cacheKey] = explanation;

            const contextInfo = this.keywordManager.updateWordContext(keyword);
            this.keywordManager.saveExplanationHistory(keyword, explanation, contextInfo);

            this.keywordManager.finishExplanationOperation(app, operationTracker, 'Explanation completed successfully');
        } catch (error) {
            console.error('[KeywordManager] Error fetching explanation:', error);

            this.keywordManager.finishExplanationOperation(app, operationTracker, `Error: ${error.message}`);

            if (operationTracker && !operationTracker.isValid(app)) {
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

            this.keywordManager.updateWordContext(keyword);
        }
    }

    async reexplainCurrentExplanation() {
        const app = window.streamNoteInstance;
        const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;
        const operationTracker = app?.operationManager?.startExplanation(executionContextSnapshot);

        const currentWordEl = document.getElementById('current-explanation-word');
        const contentElement = document.getElementById('explanation-content');

        if (!currentWordEl || !contentElement) {
            if (operationTracker) operationTracker.abort('Elements not found');
            return;
        }

        if (operationTracker && !operationTracker.isValid(app)) {
            console.log('[KeywordManager] Context changed before reexplain current');
            operationTracker.abort('Context changed before reexplain');
            return;
        }

        const word = currentWordEl.textContent;
        const explanationLanguage = window.streamNoteInstance?.explanationLanguage || 'English';
        const cacheKey = `${word}|${explanationLanguage}`;

        delete this.keywordManager.explanationCache[cacheKey];

        contentElement.innerHTML = '<p class="placeholder">Refreshing explanation...</p>';
        await this.fetchAndShowExplanationForFocusView(word, contentElement);
    }

    refreshExpandedExplanations() {
        const currentWordEl = document.getElementById('current-explanation-word');
        const contentElement = document.getElementById('explanation-content');

        if (!currentWordEl || !contentElement) return;

        const word = currentWordEl.textContent;
        this.fetchAndShowExplanationForFocusView(word, contentElement);
    }
}

window.KeywordExplanationFetchManager = KeywordExplanationFetchManager;
