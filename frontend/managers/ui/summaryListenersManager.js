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
        const summaryDisplay = document.getElementById("summary-display");

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
