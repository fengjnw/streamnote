/**
 * AppUiStateManager - handles app-level UI helper states and lightweight UI actions.
 */
class AppUiStateManager {
    constructor(app) {
        this.app = app;
    }

    syncExplanationLanguageSelectors() {
        const selectorIds = [
            "summary-language",
            "keyword-explanation-language",
            "defaultExplanationLanguage"
        ];

        selectorIds.forEach((selectorId) => {
            const selector = document.getElementById(selectorId);
            if (selector) {
                selector.value = this.app.explanationLanguage;
            }
        });
    }

    setEditModalVisibility(isVisible) {
        const backdrop = document.getElementById("editModalBackdrop");
        const modal = document.getElementById("editModal");
        if (!backdrop || !modal) return;

        backdrop.style.display = isVisible ? "block" : "none";
        modal.style.display = isVisible ? "flex" : "none";
    }

    getCurrentSessionTranscriptText() {
        const session = this.app.sessionManager.getCurrentSession();
        if (!session || !session.transcripts) return "";

        return Object.values(session.transcripts)
            .map(item => item && item.text ? item.text : "")
            .filter(text => text.trim().length > 0)
            .join(" ");
    }

    async updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, autoGenerateOnMiss) {
        if (!summaryDisplay) return;

        const cacheKey = `${this.app.explanationLanguage}-${selectedStyle}`;

        if (this.app.summaryCache[cacheKey]) {
            summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(this.app.summaryCache[cacheKey], selectedStyle);
            return;
        }

        if (!autoGenerateOnMiss) {
            summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';
            return;
        }

        const hasContent = summaryDisplay.children.length > 0 && !summaryDisplay.querySelector(".placeholder");
        if (!hasContent) {
            summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';
            return;
        }

        try {
            const textToSummarize = this.getCurrentSessionTranscriptText();
            if (textToSummarize && textToSummarize.trim().length > 0) {
                this.showStatusMessage("Generating summary...", 1000);
                summaryDisplay.innerHTML = '<p class="placeholder">Generating summary...</p>';
                const summary = await this.app.summarizeText(textToSummarize, true, selectedStyle);
                if (summary) {
                    summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, selectedStyle);
                }
            }
        } catch (error) {
            console.error("[SUMMARY] Error auto-generating summary:", error);
            summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
        }
    }

    showStatusMessage(message, duration = 3000) {
        const statusEl = document.getElementById("status");

        if (this.app.statusMessageTimeout) {
            clearTimeout(this.app.statusMessageTimeout);
        }

        statusEl.textContent = message;

        this.app.statusMessageTimeout = setTimeout(() => {
            statusEl.textContent = "";
            this.app.statusMessageTimeout = null;
        }, duration);
    }

    updateHighlightButtonState(word, isHighlighted) {
        const btn = document.getElementById("highlight-current-word-btn");
        if (!btn) return;

        if (isHighlighted) {
            btn.title = "Remove from highlights";
            btn.classList.add("active");
        } else {
            btn.title = "Add to highlights";
            btn.classList.remove("active");
        }
    }

    updateRecordingIndicator() {
        const indicator = document.getElementById("recording-indicator");
        const sessionNameEl = document.getElementById("recording-session-name");

        if (this.app.recordingSessionId !== null) {
            const recordingSession = this.app.sessionManager.getSession(this.app.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            sessionNameEl.textContent = recordingSessionName;
            indicator.style.display = "inline-block";

            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                if (item.dataset.sessionId === this.app.recordingSessionId) {
                    item.classList.add("recording");
                } else {
                    item.classList.remove("recording");
                }
            });
        } else {
            indicator.style.display = "none";
            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                item.classList.remove("recording");
            });
        }
    }

    deleteKeyword(keyword) {
        if (!this.app.keywordManager) return;

        const currentWordEl = document.getElementById("current-explanation-word");
        const currentWord = currentWordEl?.textContent?.trim();
        const isCurrentlyExplaining = currentWord === keyword;

        const highlightIndex = this.app.keywordManager.highlights.indexOf(keyword);
        const extractIndex = this.app.keywordManager.extracts.indexOf(keyword);

        if (highlightIndex > -1) {
            this.app.keywordManager.highlights.splice(highlightIndex, 1);
            this.app.highlightManager.removeHighlightFromTranscript(keyword);
        } else if (extractIndex > -1) {
            this.app.keywordManager.extracts.splice(extractIndex, 1);
        } else {
            return;
        }

        this.app.keywordManager.updateAllKeywordDisplays();

        if (isCurrentlyExplaining) {
            this.updateHighlightButtonState(keyword, false);
        }

        this.app.sessionManager.updateCurrentHighlights(this.app.keywordManager.highlights);
        this.app.sessionManager.updateCurrentKeywords(this.app.keywordManager.extracts);

        this.showStatusMessage(`Removed "${keyword}"`, 1200);
    }
}

window.AppUiStateManager = AppUiStateManager;
