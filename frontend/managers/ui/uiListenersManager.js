/**
 * UiListenersManager - binds app-level DOM events and toolbar actions.
 */
class UiListenersManager {
    constructor(app) {
        this.app = app;
    }

    setupUIListeners() {
        const app = this.app;

        const sidebars = document.querySelectorAll(".sidebar");
        sidebars.forEach(sidebar => {
            sidebar.addEventListener("click", (e) => {
                const btn = e.target.closest(".sidebar-btn");
                if (btn) {
                    const modalBtnIds = ["openSessionPanel", "quickAccessSettings"];
                    if (!modalBtnIds.includes(btn.id)) {
                        app.closeAllModals();
                    }
                }
            });
        });

        const recordBtn = document.getElementById("recordBtn");
        const recordMenu = document.getElementById("recordMenu");
        const recordFromMicOption = document.getElementById("recordFromMicOption");
        const recordFromTabOption = document.getElementById("recordFromTabOption");

        const isMenuVisible = (menuEl) => {
            if (!menuEl) return false;
            return window.getComputedStyle(menuEl).display !== "none";
        };

        const hideRecordMenu = () => {
            if (recordMenu) {
                recordMenu.style.display = "none";
            }
            if (recordBtn && !app.recordingManager?.isRecording) {
                recordBtn.classList.remove("active");
            }
        };

        const positionRecordMenu = () => {
            if (!recordMenu || !recordBtn) return;

            if (window.matchMedia("(max-width: 768px)").matches) {
                recordMenu.style.left = "10px";
                recordMenu.style.right = "10px";
                recordMenu.style.top = "auto";
                recordMenu.style.bottom = "calc(62px + var(--safe-area-bottom))";
                return;
            }

            const rect = recordBtn.getBoundingClientRect();
            recordMenu.style.left = (rect.right + 8) + "px";
            recordMenu.style.right = "auto";
            recordMenu.style.top = (rect.top - 4) + "px";
            recordMenu.style.bottom = "auto";
        };

        if (recordBtn && recordMenu) {
            recordBtn.addEventListener("click", (e) => {
                e.stopPropagation();

                if (app.recordingManager?.isRecording) {
                    hideRecordMenu();
                    app.stop();
                    return;
                }

                const isVisible = isMenuVisible(recordMenu);
                if (!isVisible) {
                    positionRecordMenu();
                    recordMenu.style.display = "block";
                    recordBtn.classList.add("active");
                } else {
                    hideRecordMenu();
                }
            });

            document.addEventListener("click", (e) => {
                const clickedRecordArea = recordBtn.contains(e.target) || recordMenu.contains(e.target);
                if (!clickedRecordArea) {
                    hideRecordMenu();
                }
            });

            window.addEventListener("ui:close-transient-layers", () => {
                hideRecordMenu();
            });
        }

        if (recordFromMicOption) {
            recordFromMicOption.addEventListener("click", async () => {
                hideRecordMenu();
                await app.recordingControlManager?.start("microphone");
            });
        }

        if (recordFromTabOption) {
            recordFromTabOption.addEventListener("click", async () => {
                hideRecordMenu();
                await app.recordingControlManager?.start("tab");
            });
        }

        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.addEventListener("change", async (e) => {
                // Cancel stale translation streams before switching language target.
                app.executionContextVersion++;
                app.operationManager.abortAllTranslations(`Translation language changed to ${e.target.value}`);

                app.language = e.target.value;
                app.translationManager.setLanguage(app.language);

                if (app.translationEnabled) {
                    await app.translationManager.retranslateAll();
                }

                app.saveSettingsToSession();
            });
        }

        const keywordExplanationLangSelector = document.getElementById("keyword-explanation-language");
        if (keywordExplanationLangSelector) {
            keywordExplanationLangSelector.addEventListener("change", async (e) => {
                // Explanation text depends on language; force refresh of expanded entries.
                app.executionContextVersion++;
                app.operationManager.endExplanation();

                app.explanationLanguage = e.target.value;
                app.saveSettingsToSession();
                app.syncExplanationLanguageSelectors();

                if (app.keywordManager) {
                    app.keywordManager.refreshExpandedExplanations();
                }

                const summaryDisplay = document.getElementById("summary-display");
                const summarizeStyleSelect = document.getElementById("summarizeStyleSelect");
                if (summaryDisplay) {
                    const selectedStyle = summarizeStyleSelect ? summarizeStyleSelect.value : "paragraph";
                    await app.updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, false);
                }
            });
        }

        const autoExtractKeywordsBtn = document.getElementById("autoExtractKeywordsBtn");
        if (autoExtractKeywordsBtn) {
            autoExtractKeywordsBtn.addEventListener("click", async () => {
                if (!app.keywordManager) {
                    app.showStatusMessage("Keyword extractor not initialized", 2000);
                    return;
                }

                if (Object.keys(app.preciseResults).length === 0) {
                    app.showStatusMessage("No transcript available to extract keywords from", 2000);
                    return;
                }

                autoExtractKeywordsBtn.disabled = true;

                try {
                    await app.processKeywords(app.recordingSessionId || app.sessionManager.currentSessionId);
                    app.showStatusMessage("Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    app.showStatusMessage("Failed to extract keywords", 2000);
                } finally {
                    autoExtractKeywordsBtn.disabled = false;
                }
            });
        }

        app.initTextSelectionMenu();

        const sidePanelControlManager = new SidePanelControlManager(app);
        sidePanelControlManager.setup();

        const summaryListenersManager = new SummaryListenersManager(app);
        summaryListenersManager.setup();

        const panelToolbarListenersManager = new PanelToolbarListenersManager(app);
        panelToolbarListenersManager.setup();

        const globalUiListenersManager = new GlobalUiListenersManager(app);
        globalUiListenersManager.setup();

        const contentActionsListenersManager = new ContentActionsListenersManager(app);
        contentActionsListenersManager.setup();
    }
}

window.UiListenersManager = UiListenersManager;
