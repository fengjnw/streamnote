/**
 * SidePanelControlManager - handles right side panel open/close and quick access controls.
 */
class SidePanelControlManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const app = this.app;
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const closeSidePanelBtn = document.getElementById("closeSidePanelBtn");
        const sidePanelTitle = document.getElementById("sidePanelTitle");
        const keywordsContent = document.getElementById("keywordsContent");
        const summaryContent = document.getElementById("summaryContent");
        const highlightsContent = document.getElementById("highlightsContent");
        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessSummary = document.getElementById("quickAccessSummary");
        const quickAccessSettings = document.getElementById("quickAccessSettings");
        const quickAccessHighlights = document.getElementById("quickAccessHighlights");

        const panelControlsReady = sidePanelsContainer && sidePanelTitle && keywordsContent &&
            summaryContent && highlightsContent && quickAccessKeywords &&
            quickAccessSummary && quickAccessSettings && quickAccessHighlights;

        const hideAllContent = () => {
            if (!panelControlsReady) {
                return;
            }

            keywordsContent.classList.remove("active");
            summaryContent.classList.remove("active");
            highlightsContent.classList.remove("active");
            quickAccessKeywords.classList.remove("active");
            quickAccessSummary.classList.remove("active");
            quickAccessSettings.classList.remove("active");
            quickAccessHighlights.classList.remove("active");
        };

        const showContent = (contentEl, title) => {
            if (!panelControlsReady) {
                return;
            }

            hideAllContent();
            contentEl.classList.add("active");
            sidePanelTitle.textContent = title;

            if (contentEl === keywordsContent) {
                quickAccessKeywords.classList.add("active");
            } else if (contentEl === summaryContent) {
                quickAccessSummary.classList.add("active");
            } else if (contentEl === highlightsContent) {
                quickAccessHighlights.classList.add("active");
            }

            app.isUpdatingUI = true;
            sidePanelsContainer.classList.add("expanded");
            setTimeout(() => {
                app.isUpdatingUI = false;
            }, 350);
        };

        if (closeSidePanelBtn && panelControlsReady) {
            closeSidePanelBtn.addEventListener("click", () => {
                app.isUpdatingUI = true;
                sidePanelsContainer.classList.remove("expanded");
                quickAccessKeywords.classList.remove("active");
                quickAccessSummary.classList.remove("active");
                quickAccessSettings.classList.remove("active");
                quickAccessHighlights.classList.remove("active");
                setTimeout(() => {
                    app.isUpdatingUI = false;
                }, 350);
            });
        }

        if (quickAccessKeywords && panelControlsReady) {
            quickAccessKeywords.addEventListener("click", async () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = keywordsContent.classList.contains("active");

                if (isOpen && isActive) {
                    app.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessKeywords.classList.remove("active");
                    setTimeout(() => {
                        app.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(keywordsContent, "Keywords");

                    const autoKeywordsDisplay = document.getElementById("auto-keywords-display");
                    if (autoKeywordsDisplay) {
                        const session = app.sessionManager?.getCurrentSession();
                        const transcriptText = app.getCurrentSessionTranscriptText();
                        const hasTranscriptText = transcriptText && transcriptText.trim().length > 0;
                        const isKeywordStale = !!session && session.lastTextModified !== null
                            && session.lastTextModified !== session.lastKeywordExtractedTime;
                        const hasKeywords = Array.isArray(app.keywordManager?.extracts)
                            && app.keywordManager.extracts.length > 0;
                        const shouldAutoExtract = hasTranscriptText && (!hasKeywords || isKeywordStale);

                        if (shouldAutoExtract && app.keywordManager) {
                            app.showStatusMessage("Extracting keywords...", 1000);
                            autoKeywordsDisplay.innerHTML = '<p class="placeholder">Extracting keywords...</p>';
                            try {
                                await app.processKeywords(app.recordingSessionId || app.sessionManager.currentSessionId);
                            } catch (error) {
                                console.error("[StreamNote] Error auto-extracting keywords:", error);
                                autoKeywordsDisplay.innerHTML = '<p class="placeholder">Failed to extract keywords</p>';
                            }
                        }
                    }
                }
            });
        }

        const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");

        if (quickAccessSummary && panelControlsReady) {
            quickAccessSummary.addEventListener("click", async () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = summaryContent.classList.contains("active");

                if (isOpen && isActive) {
                    app.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessSummary.classList.remove("active");
                    setTimeout(() => {
                        app.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(summaryContent, "Summary");

                    const summaryDisplay = document.getElementById("summary-display");
                    if (summaryDisplay) {
                        const session = app.sessionManager?.getCurrentSession();
                        const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                        const cacheKey = `${app.explanationLanguage}-${selectedStyle}`;
                        const summaryCache = session?.summaryCache || {};
                        const summaryTimestamps = session?.lastSummaryGeneratedTime || {};
                        const textToSummarize = app.getCurrentSessionTranscriptText();
                        const hasText = textToSummarize && textToSummarize.trim().length > 0;
                        const hasValidCache = !!summaryCache[cacheKey];
                        const isSummaryStale = !!session && session.lastTextModified !== null
                            && summaryTimestamps[cacheKey] !== session.lastTextModified;

                        if (hasText && (!hasValidCache || isSummaryStale)) {
                            app.showStatusMessage("Generating summary...", 1000);
                            summaryDisplay.innerHTML = '<p class="placeholder">Generating summary...</p>';
                            try {
                                const summary = await app.summarizeText(textToSummarize, true, selectedStyle);
                                if (summary) {
                                    summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, selectedStyle);
                                }
                            } catch (error) {
                                console.error("[SUMMARY] Error auto-generating summary:", error);
                                summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
                            }
                        } else if (hasValidCache) {
                            summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summaryCache[cacheKey], selectedStyle);
                        }
                    }
                }
            });
        }

        if (quickAccessSettings) {
            quickAccessSettings.addEventListener("click", () => {
                app.settingsPanel.initialize();
                app.toggleModal("settingsModal");
            });
        }

        if (quickAccessHighlights && panelControlsReady) {
            quickAccessHighlights.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = highlightsContent.classList.contains("active");

                if (isOpen && isActive) {
                    app.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    quickAccessHighlights.classList.remove("active");
                    setTimeout(() => {
                        app.isUpdatingUI = false;
                    }, 350);
                } else {
                    showContent(highlightsContent, "Highlights");
                }
            });
        }
    }
}

window.SidePanelControlManager = SidePanelControlManager;
