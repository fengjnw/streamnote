/**
 * UiListenersManager - binds app-level DOM events and toolbar actions.
 */
class UiListenersManager {
    constructor(app) {
        this.app = app;
    }

    setupUIListeners() {
        const app = this.app;

        // 侧栏按钮点击时关闭模态窗口（除了打开 modal 的按钮）
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

        // 控制栏按钮点击时关闭模态窗口
        const controlBar = document.querySelector(".control-bar");
        if (controlBar) {
            controlBar.addEventListener("click", (e) => {
                const btn = e.target.closest(".control-btn");
                if (btn) {
                    app.closeAllModals();
                }
            });
        }

        const recordBtn = document.getElementById("recordBtn");
        if (recordBtn) {
            recordBtn.addEventListener("click", () => app.toggleRecording());
        }

        // 添加翻译语言选择
        const languageSelector = document.getElementById("target-language");
        if (languageSelector) {
            languageSelector.addEventListener("change", async (e) => {
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

        // 添加解释语言选择
        const keywordExplanationLangSelector = document.getElementById("keyword-explanation-language");
        if (keywordExplanationLangSelector) {
            keywordExplanationLangSelector.addEventListener("change", async (e) => {
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

        // 自动提取关键词按钮（在Keywords面板中）
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
                const originalTitle = autoExtractKeywordsBtn.title;
                autoExtractKeywordsBtn.title = "Extracting...";

                try {
                    await app.processKeywords(app.recordingSessionId || app.sessionManager.currentSessionId);
                    app.showStatusMessage("Keywords extracted", 1500);
                } catch (error) {
                    console.error("[StreamNote] Error extracting keywords:", error);
                    app.showStatusMessage("Failed to extract keywords", 2000);
                } finally {
                    autoExtractKeywordsBtn.disabled = false;
                    autoExtractKeywordsBtn.title = originalTitle;
                }
            });
        }

        // 初始化文本选中菜单功能
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
