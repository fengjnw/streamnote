/**
 * SummaryListenersManager - binds summary generation and summary setting listeners.
 */
class SummaryListenersManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const app = this.app;
        const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");
        const regenerateSummaryBtn = document.getElementById("regenerateSummaryBtn");
        const summaryDisplay = document.getElementById("summary-display");

        if (regenerateSummaryBtn) {
            regenerateSummaryBtn.addEventListener("click", async () => {
                const textToSummarize = app.getCurrentSessionTranscriptText();

                if (!textToSummarize || textToSummarize.trim().length === 0) {
                    alert("No transcript text to summarize");
                    return;
                }

                regenerateSummaryBtn.disabled = true;
                regenerateSummaryBtn.textContent = "Refreshing...";

                try {
                    const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                    const summary = await app.summarizeText(textToSummarize, true, selectedStyle);
                    if (summary) {
                        if (summaryDisplay) {
                            summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, selectedStyle);
                        }
                    } else if (summaryDisplay) {
                        summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
                    }
                } catch (error) {
                    console.error("[SUMMARY] Error:", error);
                    if (summaryDisplay) {
                        summaryDisplay.innerHTML = `<p class="placeholder">Error: ${error.message}</p>`;
                    }
                } finally {
                    regenerateSummaryBtn.disabled = false;
                    regenerateSummaryBtn.textContent = "Refresh";
                }
            });
        }

        if (summarizeStyleSelect) {
            summarizeStyleSelect.addEventListener("change", async () => {
                const selectedStyle = summarizeStyleSelect.value;
                await app.updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, true);
            });
        }

        const summaryLanguageSelector = document.getElementById("summary-language");
        if (summaryLanguageSelector) {
            summaryLanguageSelector.addEventListener("change", async (e) => {
                app.explanationLanguage = e.target.value;
                const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                await app.updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, true);
                app.syncExplanationLanguageSelectors();
                app.saveSettingsToSession();
            });
        }
    }
}

window.SummaryListenersManager = SummaryListenersManager;
