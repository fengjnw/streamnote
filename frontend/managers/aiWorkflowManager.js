/**
 * AiWorkflowManager - handles summary and keyword extraction workflows.
 */
class AiWorkflowManager {
    constructor(app) {
        this.app = app;
    }

    async summarizeText(text, forceRefresh = false, style = "paragraph") {
        if (!text || text.trim().length < 50) {
            return null;
        }

        try {
            const executionContextSnapshot = ExecutionContext.createSnapshot(this.app);
            const operationTracker = this.app.operationManager ? this.app.operationManager.startSummary(executionContextSnapshot) : null;

            const language = this.app.explanationLanguage;
            const cacheKey = `${language}-${style}`;

            if (!forceRefresh && this.app.summaryCache[cacheKey]) {
                if (operationTracker) operationTracker.abort('Summary found in cache');
                if (this.app.operationManager) this.app.operationManager.endSummary();
                return this.app.summaryCache[cacheKey];
            }

            const summaryPayload = {
                text: text,
                language: language,
                style: style
            };
            const summarySignal = operationTracker ? operationTracker.getSignal() : undefined;

            const response = this.app.apiClient
                ? await this.app.apiClient.summarize(summaryPayload, summarySignal)
                : await fetch("/api/summarize", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(summaryPayload),
                    signal: summarySignal,
                });

            if (!response.ok) {
                console.error(`[ERROR] Summarization API error: ${response.status}`);
                if (operationTracker) operationTracker.abort(`API error: ${response.status}`);
                if (this.app.operationManager) this.app.operationManager.endSummary();
                return null;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let summary = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    if (operationTracker && !operationTracker.isValid(this.app)) {
                        reader.releaseLock();
                        console.log(`[Summarization] Execution context changed: ${ExecutionContext.getChangeReason(executionContextSnapshot, this.app)}`);
                        if (this.app.operationManager) this.app.operationManager.endSummary();
                        return null;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    summary += chunk;

                    if (summary) {
                        this.app.summaryCache[cacheKey] = summary;
                        this.app.saveSettingsToSession();
                        const summaryDisplay = document.getElementById("summary-display");
                        if (summaryDisplay) {
                            summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, style);
                        }
                    }
                }

                const finalChunk = decoder.decode();
                summary += finalChunk;

                if (operationTracker && !operationTracker.isValid(this.app)) {
                    console.log(`[Summarization] Context changed before final save, discarding result`);
                    if (this.app.operationManager) this.app.operationManager.endSummary();
                    return null;
                }

                if (finalChunk) {
                    this.app.summaryCache[cacheKey] = summary;
                    this.app.saveSettingsToSession();
                    const summaryDisplay = document.getElementById("summary-display");
                    if (summaryDisplay) {
                        summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, style);
                    }
                }
            } finally {
                reader.releaseLock();
            }

            if (operationTracker) {
                operationTracker.abort('Summary completed successfully');
            }
            if (this.app.operationManager) {
                this.app.operationManager.endSummary();
            }

            if (summary) {
                return summary;
            }

            return null;

        } catch (error) {
            console.error("[ERROR] Summarization request failed:", error);
            if (this.app.operationManager) {
                this.app.operationManager.endSummary();
            }
            throw error;
        }
    }

    async processKeywords(targetSessionId = null) {
        if (!this.app.keywordManager) return;

        const executionContextSnapshot = ExecutionContext.createSnapshot(this.app);
        let operationTracker = null;
        if (this.app.operationManager) {
            operationTracker = this.app.operationManager.startKeywords(executionContextSnapshot);
        }

        const preciseResults = this.app.recordingManager.getTranscriptData();
        this.app.currentTranscriptText = Object.values(preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.app.currentTranscriptText.length > 10) {
            if (operationTracker && !operationTracker.isValid(this.app)) {
                console.log(`[Keywords] Execution context changed before extraction`);
                if (this.app.operationManager) this.app.operationManager.endKeywords();
                return;
            }

            await this.app.keywordManager.processText(this.app.currentTranscriptText);
            this.app.keywordManager.updateAllKeywordDisplays();

            if (operationTracker && !operationTracker.isValid(this.app)) {
                console.log(`[Keywords] Execution context changed before save, discarding keywords`);
                if (this.app.operationManager) this.app.operationManager.endKeywords();
                return;
            }

            const sessionId = targetSessionId || this.app.recordingSessionId || this.app.sessionManager.currentSessionId;
            if (sessionId && this.app.sessionManager) {
                this.app.sessionManager.updateKeywordsForSession(sessionId, this.app.keywordManager.extracts);
            }
        }

        if (operationTracker) {
            operationTracker.abort('Keywords processing completed');
        }
        if (this.app.operationManager) {
            this.app.operationManager.endKeywords();
        }
    }

    async reprocessAllKeywords() {
        if (!this.app.keywordManager) return;

        const executionContextSnapshot = ExecutionContext.createSnapshot(this.app);
        let operationTracker = null;
        if (this.app.operationManager) {
            operationTracker = this.app.operationManager.startKeywords(executionContextSnapshot);
        }

        const preciseResults = this.app.recordingManager.getTranscriptData();
        this.app.currentTranscriptText = Object.values(preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.app.currentTranscriptText.length > 10) {
            if (operationTracker && !operationTracker.isValid(this.app)) {
                console.log(`[Keywords] Execution context changed before reprocessing`);
                if (this.app.operationManager) this.app.operationManager.endKeywords();
                return;
            }

            this.app.keywordManager.extracts = [];
            await this.app.keywordManager.processText(this.app.currentTranscriptText);

            if (operationTracker && !operationTracker.isValid(this.app)) {
                console.log(`[Keywords] Execution context changed before update, discarding`);
                if (this.app.operationManager) this.app.operationManager.endKeywords();
                return;
            }

            this.app.keywordManager.updateAllKeywordDisplays();
        }

        if (operationTracker) {
            operationTracker.abort('Keywords reprocessing completed');
        }
        if (this.app.operationManager) {
            this.app.operationManager.endKeywords();
        }
    }
}

window.AiWorkflowManager = AiWorkflowManager;
