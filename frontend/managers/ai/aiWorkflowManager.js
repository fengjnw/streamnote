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

        const summaryOperation = OperationGuards.start(this.app, "summary");
        try {
            const language = this.app.explanationLanguage;
            const cacheKey = `${language}-${style}`;

            if (!forceRefresh && this.app.summaryCache[cacheKey]) {
                OperationGuards.end(summaryOperation, "Summary found in cache");
                return this.app.summaryCache[cacheKey];
            }

            const summaryPayload = {
                text: text,
                language: language,
                style: style
            };
            const summarySignal = OperationGuards.getSignal(summaryOperation);

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
                OperationGuards.end(summaryOperation, `API error: ${response.status}`);
                return null;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let summary = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    if (!OperationGuards.isValid(summaryOperation)) {
                        console.log(`[Summarization] Execution context changed: ${OperationGuards.getChangeReason(summaryOperation)}`);
                        OperationGuards.end(summaryOperation, "Execution context changed");
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

                if (!OperationGuards.isValid(summaryOperation)) {
                    console.log(`[Summarization] Context changed before final save, discarding result`);
                    OperationGuards.end(summaryOperation, "Context changed before final save");
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

            OperationGuards.end(summaryOperation, "Summary completed successfully");

            if (summary) {
                const currentSession = this.app.sessionManager?.getCurrentSession();
                const currentSessionId = this.app.sessionManager?.currentSessionId;
                if (currentSessionId && currentSession) {
                    this.app.sessionManager.updateLastSummaryGeneratedTime(
                        currentSessionId,
                        cacheKey,
                        currentSession.lastTextModified
                    );
                }
            }

            if (summary) {
                return summary;
            }

            return null;

        } catch (error) {
            console.error("[ERROR] Summarization request failed:", error);
            OperationGuards.end(summaryOperation, `Summary error: ${error.message}`);
            throw error;
        }
    }

    async processKeywords(targetSessionId = null) {
        if (!this.app.keywordManager) return;

        const keywordsOperation = OperationGuards.start(this.app, "keywords");
        const endKeywordsOperation = OperationGuards.endOnce(keywordsOperation);

        try {
            const preciseResults = this.app.recordingManager.getTranscriptData();
            this.app.currentTranscriptText = Object.values(preciseResults)
                .map(item => item && item.text ? item.text : "")
                .join(" ");

            if (this.app.currentTranscriptText.length > 10) {
                if (!OperationGuards.isValid(keywordsOperation)) {
                    console.log(`[Keywords] Execution context changed before extraction`);
                    endKeywordsOperation("Execution context changed before extraction");
                    return;
                }

                await this.app.keywordManager.processText(this.app.currentTranscriptText);
                this.app.keywordManager.updateAllKeywordDisplays();

                if (!OperationGuards.isValid(keywordsOperation)) {
                    console.log(`[Keywords] Execution context changed before save, discarding keywords`);
                    endKeywordsOperation("Execution context changed before save");
                    return;
                }

                const sessionId = targetSessionId || this.app.recordingSessionId || this.app.sessionManager.currentSessionId;
                if (sessionId && this.app.sessionManager) {
                    this.app.sessionManager.updateKeywordsForSession(sessionId, this.app.keywordManager.extracts);
                    const session = this.app.sessionManager.getSession(sessionId);
                    this.app.sessionManager.updateLastKeywordExtractedTime(sessionId, session?.lastTextModified);
                    this.app.updateSessionStats();
                }
            }
        } finally {
            endKeywordsOperation("Keywords processing completed");
        }
    }

    async reprocessAllKeywords() {
        if (!this.app.keywordManager) return;

        const keywordsOperation = OperationGuards.start(this.app, "keywords");
        const endKeywordsOperation = OperationGuards.endOnce(keywordsOperation);

        try {
            const preciseResults = this.app.recordingManager.getTranscriptData();
            this.app.currentTranscriptText = Object.values(preciseResults)
                .map(item => item && item.text ? item.text : "")
                .join(" ");

            if (this.app.currentTranscriptText.length > 10) {
                if (!OperationGuards.isValid(keywordsOperation)) {
                    console.log(`[Keywords] Execution context changed before reprocessing`);
                    endKeywordsOperation("Execution context changed before reprocessing");
                    return;
                }

                this.app.keywordManager.extracts = [];
                await this.app.keywordManager.processText(this.app.currentTranscriptText);

                if (!OperationGuards.isValid(keywordsOperation)) {
                    console.log(`[Keywords] Execution context changed before update, discarding`);
                    endKeywordsOperation("Execution context changed before update");
                    return;
                }

                this.app.keywordManager.updateAllKeywordDisplays();

                const sessionId = this.app.recordingSessionId || this.app.sessionManager.currentSessionId;
                if (sessionId && this.app.sessionManager) {
                    this.app.sessionManager.updateKeywordsForSession(sessionId, this.app.keywordManager.extracts);
                    const session = this.app.sessionManager.getSession(sessionId);
                    this.app.sessionManager.updateLastKeywordExtractedTime(sessionId, session?.lastTextModified);
                    this.app.updateSessionStats();
                }
            }
        } finally {
            endKeywordsOperation("Keywords reprocessing completed");
        }
    }
}

window.AiWorkflowManager = AiWorkflowManager;
