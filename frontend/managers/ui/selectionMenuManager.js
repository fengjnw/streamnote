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
        let showMenuTimeout = null;

        const createMediaQuery = (query) => {
            if (typeof window.matchMedia === "function") {
                return window.matchMedia(query);
            }

            return { matches: false };
        };

        const touchQuery = createMediaQuery("(pointer: coarse)");
        const mobileQuery = createMediaQuery("(max-width: 768px)");

        const getSelectionContext = (range) => {
            const transcriptDiv = document.getElementById("transcript");
            const translationDiv = document.getElementById("translation");

            const rangeStartsInTranscript = transcriptDiv?.contains(range.startContainer);
            const rangeEndsInTranscript = transcriptDiv?.contains(range.endContainer);
            const rangeStartsInTranslation = translationDiv?.contains(range.startContainer);
            const rangeEndsInTranslation = translationDiv?.contains(range.endContainer);

            if (rangeStartsInTranscript && rangeEndsInTranscript) {
                return {
                    sourcePanel: "transcript",
                    container: transcriptDiv
                };
            }

            if (rangeStartsInTranslation && rangeEndsInTranslation) {
                return {
                    sourcePanel: "translation",
                    container: translationDiv
                };
            }

            return null;
        };

        const getRangeRect = (range) => {
            const rect = range.getBoundingClientRect();
            if (rect.width || rect.height) {
                return rect;
            }

            const rects = range.getClientRects();
            return rects.length > 0 ? rects[0] : null;
        };

        const positionFloatingMenu = (rangeRect) => {
            if (!rangeRect) {
                floatingMenu.classList.add("hidden");
                return;
            }

            floatingMenu.classList.toggle("floating-menu-bottom", mobileQuery.matches);

            if (mobileQuery.matches) {
                floatingMenu.style.left = "";
                floatingMenu.style.top = "";
                floatingMenu.style.right = "";
                floatingMenu.style.bottom = "";
                return;
            }

            const menuWidth = floatingMenu.offsetWidth || 180;
            const menuHeight = floatingMenu.offsetHeight || 100;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const margin = touchQuery.matches ? 16 : 10;
            const offset = touchQuery.matches ? 12 : 10;

            let menuX = touchQuery.matches
                ? rangeRect.left + (rangeRect.width / 2) - (menuWidth / 2)
                : rangeRect.right + offset;
            let menuY = touchQuery.matches
                ? rangeRect.bottom + offset
                : rangeRect.top;

            if (!touchQuery.matches && menuX + menuWidth > viewportWidth - margin) {
                menuX = rangeRect.left - menuWidth - offset;
            }

            if (touchQuery.matches && menuY + menuHeight > viewportHeight - margin) {
                menuY = rangeRect.top - menuHeight - offset;
            }

            if (menuX + menuWidth > viewportWidth - margin) {
                menuX = viewportWidth - menuWidth - margin;
            }

            if (menuY + menuHeight > viewportHeight - margin) {
                menuY = viewportHeight - menuHeight - margin;
            }

            floatingMenu.style.left = Math.max(margin, menuX) + "px";
            floatingMenu.style.top = Math.max(margin, menuY) + "px";
            floatingMenu.style.right = "";
            floatingMenu.style.bottom = "";
        };

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

            const selectionContext = getSelectionContext(range);

            if (selectionContext) {
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

                requestAnimationFrame(() => {
                    positionFloatingMenu(getRangeRect(range));
                });
            } else {
                floatingMenu.classList.add("hidden");
            }
        };

        const scheduleShowFloatingMenu = (delay = 0) => {
            if (showMenuTimeout) {
                clearTimeout(showMenuTimeout);
            }

            showMenuTimeout = setTimeout(() => {
                showMenuTimeout = null;
                showFloatingMenu();
            }, delay);
        };

        if (window.PointerEvent) {
            document.addEventListener("pointerup", (event) => {
                scheduleShowFloatingMenu(event.pointerType === "touch" ? 140 : 0);
            });
        } else {
            document.addEventListener("mouseup", () => {
                scheduleShowFloatingMenu();
            });

            document.addEventListener("touchend", () => {
                scheduleShowFloatingMenu(140);
            }, { passive: true });
        }

        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            if (selection.toString().trim().length === 0) {
                floatingMenu.classList.add("hidden");
            } else if (touchQuery.matches) {
                scheduleShowFloatingMenu(180);
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

                const selectionContext = currentSelectedRange ? getSelectionContext(currentSelectedRange) : null;
                const sourcePanel = selectionContext?.sourcePanel || 'transcript';

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

            const selectionContext = currentSelectedRange ? getSelectionContext(currentSelectedRange) : null;
            const sourcePanel = selectionContext?.sourcePanel || 'transcript';

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
