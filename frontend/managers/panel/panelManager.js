

class PanelManager {
    constructor(config = {}) {
        this.onLayoutChange = config.onLayoutChange || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });

        this.translationEnabled = false;

        this.translationLayoutOptions = ['split-top', 'split-bottom', 'split-left', 'split-right', 'full-translation'];

        this.translationLayout = 'split-bottom';

        this.currentLayout = 'full-transcript';

        this.isSyncingScroll = false;
        this.scrollTimeout = null;

        this.autoScroll = true;
        this.isTogglingAutoScroll = false;

        this.isUpdatingUI = false;

        this.preciseResults = {};

        this.setupPanelControls();
    }

    getElement(id) {
        return document.getElementById(id);
    }

    toggleClassByState(element, className, shouldHaveClass) {
        if (!element) return;
        element.classList.toggle(className, shouldHaveClass);
    }

    /**
     * @private
     */
    setupPanelControls() {
        const translationToggleBtn = document.getElementById("translationToggleBtn");
        if (translationToggleBtn) {
            translationToggleBtn.addEventListener("click", () => {
                this.toggleTranslation();
            });
        }

        const layoutDropdown = document.getElementById("layoutDropdown");
        if (layoutDropdown) {
            layoutDropdown.addEventListener("change", (e) => {
                this.setTranslationLayout(e.target.value);
            });
        }

        const closeTranslationPanelBtn = document.getElementById("closeTranslationPanelBtn");
        if (closeTranslationPanelBtn) {
            closeTranslationPanelBtn.addEventListener("click", () => {
                this.toggleTranslation();
            });
        }

        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            floatingAutoScrollBtn.addEventListener("click", () => {
                this.toggleAutoScroll();
            });
        }

        this.setupExplanationPanelControls();
    }

    /**
     * @private
     */
    setupExplanationPanelControls() {
        const explanationPanel = document.querySelector(".explanation-panel-left");
        const closeExplanationPanelBtn = document.getElementById("closeExplanationPanelBtn");
        const quickAccessHistory = document.getElementById("quickAccessHistory");

        if (closeExplanationPanelBtn) {
            closeExplanationPanelBtn.addEventListener("click", () => {
                this.hideExplanationPanel();
            });
        }

        if (quickAccessHistory) {
            quickAccessHistory.addEventListener("click", () => {
                const isOpen = explanationPanel && explanationPanel.classList.contains("expanded");
                if (isOpen) {
                    this.hideExplanationPanel();
                } else {
                    this.showExplanationPanel();
                }
            });
        }
    }

    applyExplanationPanelState(isExpanded) {
        const explanationPanel = document.querySelector(".explanation-panel-left");
        const quickAccessHistory = document.getElementById("quickAccessHistory");

        if (!explanationPanel) {
            return;
        }

        this.isUpdatingUI = true;

        explanationPanel.classList.toggle("collapsed", !isExpanded);
        explanationPanel.classList.toggle("expanded", isExpanded);
        quickAccessHistory?.classList.toggle("active", isExpanded);

        setTimeout(() => {
            this.isUpdatingUI = false;
        }, 0);
    }

    showExplanationPanel() {
        this.applyExplanationPanelState(true);
    }

    hideExplanationPanel() {
        if (window.streamNoteInstance && window.streamNoteInstance.highlightManager) {
            window.streamNoteInstance.highlightManager.clearTemporaryHighlight();
        }

        const statusEl = document.getElementById("status");
        if (statusEl) {
            statusEl.textContent = "";
        }
        if (window.streamNoteInstance && window.streamNoteInstance.statusMessageTimeout) {
            clearTimeout(window.streamNoteInstance.statusMessageTimeout);
            window.streamNoteInstance.statusMessageTimeout = null;
        }

        this.applyExplanationPanelState(false);
    }

    toggleTranslation() {
        this.translationEnabled = !this.translationEnabled;

        if (this.translationEnabled) {
            this.setLayout(this.translationLayout);
        } else {
            this.setLayout('full-transcript');
        }
    }

    setTranslationLayout(layoutType) {
        this.translationLayout = layoutType;

        if (this.translationEnabled) {
            this.setLayout(layoutType);
        } else {
            this.updateLayoutDropdown();
        }
    }

    /**
     * @private
     */
    updateTranslationButton() {
        const translationToggleBtn = this.getElement("translationToggleBtn");
        this.toggleClassByState(translationToggleBtn, 'active', this.translationEnabled);
    }

    /**
     * @private
     */
    updateLayoutDropdown() {
        const layoutDropdown = this.getElement("layoutDropdown");
        if (layoutDropdown) {
            layoutDropdown.value = this.translationLayout;
        }
    }

    setLayout(layoutType, skipSave = false) {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        mainContent.classList.remove("layout-full-transcript", "layout-split-top", "layout-split-bottom", "layout-split-left", "layout-split-right", "layout-full-translation");
        mainContent.classList.add(`layout-${layoutType}`);

        this.currentLayout = layoutType;

        this.updateLayoutDropdown();
        this.updateTranslationButton();

        if (!skipSave) {
            const translationEnabled = layoutType !== "full-transcript";
            this.onLayoutChange({
                layout: layoutType,
                translationEnabled: translationEnabled
            });

            this.savePanelState();
        }
    }

    loadPanelState() {
        const saved = localStorage.getItem('translationEnabled');
        this.translationEnabled = saved !== null ? JSON.parse(saved) : false;

        this.translationLayout = localStorage.getItem('translationLayout') || 'split-bottom';

        const savedAutoScroll = localStorage.getItem('autoScroll');
        this.autoScroll = savedAutoScroll !== null ? JSON.parse(savedAutoScroll) : true;

        const initialLayout = this.translationEnabled ? this.translationLayout : 'full-transcript';
        this.setLayout(initialLayout);
    }

    /**
     * @private
     */
    savePanelState() {
        localStorage.setItem('translationEnabled', JSON.stringify(this.translationEnabled));
        localStorage.setItem('translationLayout', this.translationLayout);
        localStorage.setItem('autoScroll', JSON.stringify(this.autoScroll));
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        this.savePanelState();
        this.updateAutoScrollButton();

        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    updateAutoScrollButton() {
        const floatingAutoScrollBtn = this.getElement("floatingAutoScrollBtn");
        this.toggleClassByState(floatingAutoScrollBtn, "hidden", this.autoScroll);
    }

    scrollToBottom() {
        this.isTogglingAutoScroll = true;
        this.isUpdatingUI = true;

        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        if (transcript) {
            transcript.style.scrollBehavior = 'auto';
            setTimeout(() => {
                transcript.scrollTop = transcript.scrollHeight;
            }, 0);
        }
        if (translation) {
            translation.style.scrollBehavior = 'auto';
            setTimeout(() => {
                translation.scrollTop = translation.scrollHeight;
            }, 0);
        }

        setTimeout(() => {
            this.isTogglingAutoScroll = false;
            this.isUpdatingUI = false;
        }, 200);
    }

    setTranscriptData(data) {
        this.preciseResults = data;
    }

    setupSyncScroll() {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        if (!transcript || !translation) {
            return;
        }

        transcript.addEventListener('scroll', () => {
            this._handleScroll(transcript, translation);
        });

        translation.addEventListener('scroll', () => {
            this._handleScroll(translation, transcript);
        });
    }

    /**
     * @private
     */
    _handleScroll(source, target) {
        if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && this.autoScroll) {
            this.autoScroll = false;
            this.updateAutoScrollButton();
        }

        if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && !this.autoScroll && this.isScrolledToBottom(source)) {
            this.autoScroll = true;
            this.updateAutoScrollButton();
        }

        if (this.isSyncingScroll) return;

        clearTimeout(this.scrollTimeout);
        // Debounce to avoid feedback loops while both containers are firing scroll events.
        this.scrollTimeout = setTimeout(() => {
            this.isSyncingScroll = true;

            if (this.isScrolledToBottom(source)) {
                target.style.scrollBehavior = 'auto';
                target.scrollTop = target.scrollHeight;
            } else {
                const bottomInfo = this.getBottomLineNumber(source);

                if (bottomInfo) {
                    target.style.scrollBehavior = 'auto';
                    this.scrollToLineBottom(target, bottomInfo.index);
                }
            }

            setTimeout(() => {
                this.isSyncingScroll = false;
            }, 200);
        }, 400);
    }

    /**
     * @private
     */
    getBottomLineNumber(container) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return null;

        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            const rect = p.getBoundingClientRect();
            if (rect.top < container.clientHeight) {
                return {
                    index: p.getAttribute('data-index'),
                    lineNumber: i
                };
            }
        }

        return null;
    }

    /**
     * @private
     */
    scrollToLineBottom(container, targetIndex) {
        const targetElement = container.querySelector(`p[data-index="${targetIndex}"]`);
        if (!targetElement) return;

        // Keep the mapped target line close to viewport bottom to preserve reading position.
        const rect = targetElement.getBoundingClientRect();
        const elementBottom = container.scrollTop + rect.bottom;
        const viewportBottom = container.scrollTop + container.clientHeight;
        const scrollOffset = elementBottom - (viewportBottom - 20);

        container.scrollTop += scrollOffset;
    }

    /**
     * @private
     */
    isScrolledToBottom(container, threshold = 100) {
        return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
    }

    setupSidePanelControls(onShowContent) {
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const closeSidePanelBtn = document.getElementById("closeSidePanelBtn");
        const quickAccessButtons = {
            keywords: document.getElementById("quickAccessKeywords"),
            summary: document.getElementById("quickAccessSummary"),
            settings: document.getElementById("quickAccessSettings"),
            highlights: document.getElementById("quickAccessHighlights")
        };

        if (closeSidePanelBtn) {
            closeSidePanelBtn.addEventListener("click", () => {
                this.isUpdatingUI = true;
                sidePanelsContainer.classList.remove("expanded");
                Object.values(quickAccessButtons).forEach(btn => {
                    if (btn) btn.classList.remove("active");
                });
                setTimeout(() => {
                    this.isUpdatingUI = false;
                }, 350);
            });
        }

        const setupQuickAccessBtn = (btnId, panelName) => {
            const btn = quickAccessButtons[btnId];
            const contentId = `${panelName}Content`;
            const content = document.getElementById(contentId);

            if (!btn || !content) return;

            btn.addEventListener("click", () => {
                const isOpen = sidePanelsContainer.classList.contains("expanded");
                const isActive = content.classList.contains("active");

                if (isOpen && isActive) {
                    this.isUpdatingUI = true;
                    sidePanelsContainer.classList.remove("expanded");
                    btn.classList.remove("active");
                    setTimeout(() => {
                        this.isUpdatingUI = false;
                    }, 350);
                } else {
                    if (typeof onShowContent === 'function') {
                        onShowContent(contentId, panelName, btn);
                    }
                }
            });
        };

        setupQuickAccessBtn('keywords', 'keywords');
        setupQuickAccessBtn('summary', 'summary');
        setupQuickAccessBtn('settings', 'settings');
        setupQuickAccessBtn('highlights', 'highlights');
    }

    showSidePanelContent(contentElement, title) {
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const sidePanelTitle = document.getElementById("sidePanelTitle");
        const keywordsContent = document.getElementById("keywordsContent");
        const summaryContent = document.getElementById("summaryContent");
        const settingsContent = document.getElementById("settingsContent");
        const highlightsContent = document.getElementById("highlightsContent");

        if (keywordsContent) keywordsContent.classList.remove("active");
        if (summaryContent) summaryContent.classList.remove("active");
        if (settingsContent) settingsContent.classList.remove("active");
        if (highlightsContent) highlightsContent.classList.remove("active");

        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessSummary = document.getElementById("quickAccessSummary");
        const quickAccessSettings = document.getElementById("quickAccessSettings");
        const quickAccessHighlights = document.getElementById("quickAccessHighlights");

        if (quickAccessKeywords) quickAccessKeywords.classList.remove("active");
        if (quickAccessSummary) quickAccessSummary.classList.remove("active");
        if (quickAccessSettings) quickAccessSettings.classList.remove("active");
        if (quickAccessHighlights) quickAccessHighlights.classList.remove("active");

        contentElement.classList.add("active");
        if (sidePanelTitle) {
            sidePanelTitle.textContent = title;
        }

        if (contentElement === keywordsContent && quickAccessKeywords) {
            quickAccessKeywords.classList.add("active");
        } else if (contentElement === summaryContent && quickAccessSummary) {
            quickAccessSummary.classList.add("active");
        } else if (contentElement === settingsContent && quickAccessSettings) {
            quickAccessSettings.classList.add("active");
        } else if (contentElement === highlightsContent && quickAccessHighlights) {
            quickAccessHighlights.classList.add("active");
        }

        const autoExtractBtn = document.getElementById("autoExtractKeywordsBtn");
        const generateSummaryBtn = document.getElementById("generateSummaryBtn");
        const copySummaryBtn = document.getElementById("copySummaryBtn");
        const explanationLangSelector = document.getElementById("defaultExplanationLanguage");

        if (autoExtractBtn) {
            autoExtractBtn.style.display = contentElement === keywordsContent ? 'block' : 'none';
        }
        if (generateSummaryBtn) {
            generateSummaryBtn.style.display = contentElement === summaryContent ? 'block' : 'none';
        }
        if (copySummaryBtn) {
            copySummaryBtn.style.display = contentElement === summaryContent ? 'block' : 'none';
        }
        if (explanationLangSelector) {
            explanationLangSelector.style.display = (contentElement === keywordsContent || contentElement === highlightsContent || contentElement === summaryContent) ? 'block' : 'none';
        }

        this.isUpdatingUI = true;
        sidePanelsContainer.classList.add("expanded");
        setTimeout(() => {
            this.isUpdatingUI = false;
        }, 350);
    }

    hideSidePanel() {
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        this.isUpdatingUI = true;
        sidePanelsContainer.classList.remove("expanded");
        setTimeout(() => {
            this.isUpdatingUI = false;
        }, 350);
    }

    isTranslationEnabled() {
        return this.currentLayout !== "full-transcript";
    }
}

window.PanelManager = PanelManager;
