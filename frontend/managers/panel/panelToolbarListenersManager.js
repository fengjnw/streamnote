/**
 * PanelToolbarListenersManager - binds listeners for keyword/highlight/explanation/summary toolbar actions.
 */
class PanelToolbarListenersManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const app = this.app;

        const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
        if (clearKeywordsBtn) {
            clearKeywordsBtn.addEventListener("click", () => {
                if (!app.keywordManager || app.keywordManager.extracts.length === 0) {
                    app.showStatusMessage("No keywords to clear", 1500);
                    return;
                }

                if (confirm("Clear all auto-extracted keywords? This cannot be undone.")) {
                    app.keywordManager.extracts = [];
                    app.keywordManager.extractsCache = {};
                    app.keywordManager.displayExtracts();
                    app.saveToSession();
                    app.showStatusMessage("Keywords cleared", 1500);
                }
            });
        }

        const reExtractKeywordsBtn = document.getElementById("reExtractKeywordsBtn");
        if (reExtractKeywordsBtn) {
            reExtractKeywordsBtn.addEventListener("click", async () => {
                const transcriptText = app.getCurrentSessionTranscriptText();
                if (!transcriptText || transcriptText.trim().length === 0) {
                    app.showStatusMessage("No transcript available to extract keywords from", 2000);
                    return;
                }

                const autoKeywordsDisplay = document.getElementById("auto-keywords-display");
                const originalText = reExtractKeywordsBtn.textContent;

                reExtractKeywordsBtn.disabled = true;
                reExtractKeywordsBtn.textContent = "Refreshing...";

                if (autoKeywordsDisplay) {
                    autoKeywordsDisplay.innerHTML = '<p class="placeholder">Extracting keywords...</p>';
                }

                try {
                    await app.reprocessAllKeywords();
                    app.saveToSession();
                    app.showStatusMessage("Keywords refreshed", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error refreshing keywords:", error);
                    if (autoKeywordsDisplay) {
                        autoKeywordsDisplay.innerHTML = '<p class="placeholder">Failed to extract keywords</p>';
                    }
                    app.showStatusMessage("Failed to extract keywords", 2000);
                } finally {
                    reExtractKeywordsBtn.disabled = false;
                    reExtractKeywordsBtn.textContent = originalText;
                }
            });
        }

        const clearHighlightsBtn = document.getElementById("clearHighlightsBtn");
        if (clearHighlightsBtn) {
            clearHighlightsBtn.addEventListener("click", () => {
                if (!app.keywordManager || app.keywordManager.highlights.length === 0) {
                    app.showStatusMessage("No highlights to clear", 1500);
                    return;
                }

                if (confirm("Clear all highlights? This cannot be undone.")) {
                    app.keywordManager.highlights = [];
                    app.keywordManager.highlightCache = {};
                    app.highlightManager.reapplyAllHighlights();
                    app.keywordManager.displayHighlights();
                    app.saveToSession();
                    app.showStatusMessage("Highlights cleared", 1500);
                }
            });
        }

        const highlightCurrentWordBtn = document.getElementById("highlight-current-word-btn");
        if (highlightCurrentWordBtn) {
            highlightCurrentWordBtn.addEventListener("click", () => {
                const currentWordEl = document.getElementById("current-explanation-word");
                if (currentWordEl && currentWordEl.textContent) {
                    const word = currentWordEl.textContent.trim();
                    const isHighlighted = app.keywordManager?.highlights.includes(word);

                    if (isHighlighted) {
                        const isHighlightedAfter = app.highlightManager?.toggleHighlight(word);
                        app.updateHighlightButtonState(word, isHighlightedAfter);
                    } else {
                        const isCommitted = app.highlightManager?.commitTemporaryHighlight(word);
                        if (isCommitted) {
                            app.updateHighlightButtonState(word, true);
                        } else {
                            const isAdded = app.highlightManager?.toggleHighlight(word);
                            app.updateHighlightButtonState(word, isAdded);
                        }
                    }
                }
            });
        }

        const reexplainExplanationBtn = document.getElementById("reexplain-explanation-btn");
        if (reexplainExplanationBtn) {
            reexplainExplanationBtn.addEventListener("click", () => {
                app.keywordManager?.explanationFetchManager?.reexplainCurrentExplanation();
            });
        }

        const clearExplanationsBtn = document.getElementById("clearExplanationsBtn");
        if (clearExplanationsBtn) {
            clearExplanationsBtn.addEventListener("click", () => {
                const currentWordEl = document.getElementById("current-explanation-word");
                const contentEl = document.getElementById("explanation-content");
                const contextDiv = document.getElementById("word-context");
                const headerDiv = document.querySelector(".explanation-header");
                const regenerateBtn = document.getElementById("regenerate-explanation-btn");
                const pronounceBtn = document.getElementById("pronounce-current-word-btn");

                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }

                if (currentWordEl) currentWordEl.textContent = "";
                if (contentEl) contentEl.innerHTML = '<p class="placeholder">Select a word to view its explanation</p>';
                if (contextDiv) contextDiv.style.display = "none";
                if (headerDiv) headerDiv.classList.add("hidden");
                if (regenerateBtn) regenerateBtn.disabled = true;
                if (pronounceBtn) pronounceBtn.disabled = true;

                app.showStatusMessage("Explanation cleared", 1500);
            });
        }

        const clearSummaryBtn = document.getElementById("clearSummaryBtn");
        if (clearSummaryBtn) {
            clearSummaryBtn.addEventListener("click", () => {
                const summaryDisplayEl = document.getElementById("summary-display");
                if (summaryDisplayEl) {
                    summaryDisplayEl.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';

                    const styleSelect = document.getElementById("summarizeStyleSelect");
                    const selectedStyle = styleSelect ? styleSelect.value : "paragraph";
                    const cacheKey = `${app.explanationLanguage}-${selectedStyle}`;
                    if (app.summaryCache[cacheKey]) {
                        delete app.summaryCache[cacheKey];
                    }

                    app.showStatusMessage("Summary cleared", 1500);
                }
            });
        }

        const regenerateSummaryBtn = document.getElementById("regenerateSummaryBtn");
        if (regenerateSummaryBtn) {
            regenerateSummaryBtn.addEventListener("click", async () => {
                const summaryDisplayEl = document.getElementById("summary-display");
                const styleSelect = document.getElementById("summarizeStyleSelect");
                const selectedStyle = styleSelect ? styleSelect.value : "paragraph";
                const textToSummarize = app.getCurrentSessionTranscriptText();

                if (!textToSummarize || textToSummarize.trim().length === 0) {
                    app.showStatusMessage("No transcript available to summarize", 2000);
                    return;
                }

                regenerateSummaryBtn.disabled = true;
                regenerateSummaryBtn.textContent = "Refreshing...";

                if (summaryDisplayEl) {
                    summaryDisplayEl.innerHTML = '<p class="placeholder">Generating summary...</p>';
                }

                try {
                    const summary = await app.summarizeText(textToSummarize, true, selectedStyle);
                    if (summary && summaryDisplayEl) {
                        summaryDisplayEl.innerHTML = TextFormatters.formatSummaryDisplay(summary, selectedStyle);
                    }
                    app.showStatusMessage("Summary refreshed", 1500);
                } catch (error) {
                    console.error("[SUMMARY] Error refreshing summary:", error);
                    if (summaryDisplayEl) {
                        summaryDisplayEl.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
                    }
                    app.showStatusMessage("Failed to generate summary", 2000);
                } finally {
                    regenerateSummaryBtn.disabled = false;
                    regenerateSummaryBtn.textContent = "Refresh";
                }
            });
        }
    }
}

window.PanelToolbarListenersManager = PanelToolbarListenersManager;
