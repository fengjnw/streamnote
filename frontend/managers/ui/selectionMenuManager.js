/**
 * SelectionMenuManager - handles keyword tab switching and text selection menu behavior.
 */
class SelectionMenuManager {
    constructor(app) {
        this.app = app;
    }

    initKeywordsTabSwitcher() {
        const tabBtns = document.querySelectorAll(".keywords-tab-btn");
        const tabContents = document.querySelectorAll(".keywords-tab-content");
        const autoExtractBtn = document.getElementById("autoExtractKeywordsBtn");

        if (!tabBtns.length) return;

        if (autoExtractBtn) {
            autoExtractBtn.style.opacity = "0.3";
            autoExtractBtn.style.pointerEvents = "none";
        }

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const tabName = btn.getAttribute("data-tab");

                tabBtns.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));

                btn.classList.add("active");
                const activeContent = document.getElementById(`${tabName}-keywords-display`);
                if (activeContent) {
                    activeContent.classList.add("active");
                }

                if (autoExtractBtn) {
                    autoExtractBtn.style.opacity = tabName === "auto" ? "1" : "0.3";
                    autoExtractBtn.style.pointerEvents = tabName === "auto" ? "auto" : "none";
                }
            });
        });
    }

    initTextSelectionMenu() {
        const floatingMenu = document.getElementById("textSelectionMenu");
        const floatingExplainBtn = document.getElementById("floatingExplainBtn");
        const floatingHighlightBtn = document.getElementById("floatingHighlightBtn");

        const highlightsContent = document.getElementById("highlightsContent");

        if (!floatingMenu || !floatingExplainBtn || !floatingHighlightBtn) return;

        let currentSelectedRange = null;
        let rangeInfo = null;

        const showFloatingMenu = () => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (!selectedText || selectedText.length === 0) {
                floatingMenu.classList.add("hidden");
                return;
            }

            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (!range) {
                floatingMenu.classList.add("hidden");
                return;
            }

            const transcriptDiv = document.getElementById("transcript");
            const translationDiv = document.getElementById("translation");

            const inTranscript = transcriptDiv?.contains(range.commonAncestorContainer);
            const inTranslation = translationDiv?.contains(range.commonAncestorContainer);

            if (inTranscript || inTranslation) {
                this.app.selectedText = selectedText;
                this.app.selectedTextElement = range.commonAncestorContainer;

                currentSelectedRange = range.cloneRange();
                rangeInfo = {
                    startContainer: range.startContainer,
                    startOffset: range.startOffset,
                    endContainer: range.endContainer,
                    endOffset: range.endOffset,
                    commonAncestorContainer: range.commonAncestorContainer
                };

                floatingMenu.classList.remove("hidden");

                const rangeRect = range.getBoundingClientRect();
                requestAnimationFrame(() => {
                    const menuWidth = floatingMenu.offsetWidth || 180;
                    const menuHeight = floatingMenu.offsetHeight || 100;

                    let menuX = rangeRect.right + 10;
                    let menuY = rangeRect.top;

                    if (menuX + menuWidth > window.innerWidth - 10) {
                        menuX = rangeRect.left - menuWidth - 10;
                    }

                    const viewportHeight = window.innerHeight;
                    if (menuY + menuHeight > viewportHeight - 10) {
                        menuY = rangeRect.bottom - menuHeight;
                    }

                    if (menuY < 10) {
                        menuY = rangeRect.bottom + 10;
                    }

                    floatingMenu.style.left = Math.max(10, menuX) + "px";
                    floatingMenu.style.top = Math.max(10, menuY) + "px";
                });
            } else {
                floatingMenu.classList.add("hidden");
            }
        };

        document.addEventListener("mouseup", () => {
            showFloatingMenu();
        });

        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            if (selection.toString().trim().length === 0) {
                floatingMenu.classList.add("hidden");
            }
        });

        document.addEventListener("click", (e) => {
            if (floatingMenu.contains(e.target)) {
                return;
            }

            const selection = window.getSelection();
            if (selection.toString().trim().length > 0) {
                return;
            }

            floatingMenu.classList.add("hidden");
        });

        floatingExplainBtn.addEventListener("click", async () => {
            if (this.app.selectedText.trim()) {
                const term = this.app.selectedText.trim();

                let sourcePanel = 'transcript';
                if (currentSelectedRange) {
                    const transcriptDiv = document.getElementById("transcript");
                    const translationDiv = document.getElementById("translation");

                    if (translationDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                        sourcePanel = 'translation';
                    } else if (transcriptDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                        sourcePanel = 'transcript';
                    }
                }

                let positionInfo = null;
                if (currentSelectedRange) {
                    positionInfo = this.app.highlightManager.extractPositionFromRangePublic(currentSelectedRange);
                }

                this.app.keywordManager.openExplanationForWord(term, positionInfo, sourcePanel);
            }
            floatingMenu.classList.add("hidden");
            window.getSelection().removeAllRanges();
        });

        floatingHighlightBtn.addEventListener("click", () => {
            if (!this.app.selectedText || !this.app.selectedText.trim()) {
                this.app.showStatusMessage("No text selected", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            if (!currentSelectedRange && !rangeInfo) {
                this.app.showStatusMessage("Cannot highlight: selection lost", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            const selectedText = this.app.selectedText.trim();

            let sourcePanel = 'transcript';
            if (currentSelectedRange) {
                const transcriptDiv = document.getElementById("transcript");
                const translationDiv = document.getElementById("translation");

                if (translationDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                    sourcePanel = 'translation';
                } else if (transcriptDiv?.contains(currentSelectedRange.commonAncestorContainer)) {
                    sourcePanel = 'transcript';
                }
            }

            let rangeToUse = currentSelectedRange;

            if (!rangeToUse && rangeInfo) {
                try {
                    rangeToUse = document.createRange();
                    rangeToUse.setStart(rangeInfo.startContainer, rangeInfo.startOffset);
                    rangeToUse.setEnd(rangeInfo.endContainer, rangeInfo.endOffset);
                } catch {
                    this.app.showStatusMessage("Cannot highlight: range invalid", 1500);
                    floatingMenu.classList.add("hidden");
                    return;
                }
            }

            const highlightResult = this.app.highlightManager.addSelectedTextAsHighlightWithRange(selectedText, rangeToUse);

            if (!highlightResult) {
                this.app.showStatusMessage("Add highlight failed", 1500);
                floatingMenu.classList.add("hidden");
                return;
            }

            if (this.app.keywordManager) {
                this.app.keywordManager.wordSourcePanel[selectedText] = sourcePanel;
            }

            const sidePanelsContainer = document.querySelector(".side-panels-container");
            const sidePanelTitle = document.getElementById("sidePanelTitle");
            const quickAccessHighlights = document.getElementById("quickAccessHighlights");
            const quickAccessKeywords = document.getElementById("quickAccessKeywords");
            const quickAccessSummary = document.getElementById("quickAccessSummary");
            const quickAccessHistory = document.getElementById("quickAccessHistory");
            const quickAccessSettings = document.getElementById("quickAccessSettings");

            const keywordsContent = document.getElementById("keywordsContent");
            const historyContent = document.getElementById("historyContent");
            const summaryContent = document.getElementById("summaryContent");

            [keywordsContent, historyContent, summaryContent, highlightsContent].forEach(el => {
                if (el) el.classList.remove("active");
            });

            if (quickAccessKeywords) quickAccessKeywords.classList.remove("active");
            if (quickAccessSummary) quickAccessSummary.classList.remove("active");
            if (quickAccessHistory) quickAccessHistory.classList.remove("active");
            if (quickAccessSettings) quickAccessSettings.classList.remove("active");
            if (quickAccessHighlights) quickAccessHighlights.classList.remove("active");

            highlightsContent.classList.add("active");
            sidePanelTitle.textContent = "Highlights";

            if (quickAccessHighlights) {
                quickAccessHighlights.classList.add("active");
            }

            this.app.isUpdatingUI = true;
            sidePanelsContainer.classList.add("expanded");
            setTimeout(() => {
                this.app.isUpdatingUI = false;
            }, 350);

            floatingMenu.classList.add("hidden");
            window.getSelection().removeAllRanges();
        });
    }
}

window.SelectionMenuManager = SelectionMenuManager;
