/**
 * 面板管理器 - 前端模块
 * 负责面板显示/隐藏、布局切换、滚动同步、自动滚动
 */

class PanelManager {
    constructor(config = {}) {
        this.onLayoutChange = config.onLayoutChange || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });

        // 翻译启用状态（true=启用, false=禁用）
        this.translationEnabled = false;

        // 翻译面板的布局选项（当翻译启用时在这些选项间切换）
        this.translationLayoutOptions = ['split-top', 'split-bottom', 'split-left', 'split-right', 'full-translation'];

        // 当前翻译面板的布局
        this.translationLayout = 'split-bottom';

        // 布局状态
        this.currentLayout = 'full-transcript';

        // 同步滚动
        this.isSyncingScroll = false;
        this.scrollTimeout = null;

        // 自动滚动
        this.autoScroll = true;
        this.isTogglingAutoScroll = false;

        // UI 更新标志（防止 UI 更新期间的滚动干扰）
        this.isUpdatingUI = false;

        // 内容数据引用（用于滚动计算）
        this.preciseResults = {};

        this.setupPanelControls();
    }

    /**
     * 初始化所有面板控制
     * @private
     */
    setupPanelControls() {
        // 翻译开关按钮（工具栏）
        const translationToggleBtn = document.getElementById("translationToggleBtn");
        if (translationToggleBtn) {
            translationToggleBtn.addEventListener("click", () => {
                this.toggleTranslation();
            });
        }

        // 布局下拉菜单（翻译面板标题栏）
        const layoutDropdown = document.getElementById("layoutDropdown");
        if (layoutDropdown) {
            layoutDropdown.addEventListener("change", (e) => {
                this.setTranslationLayout(e.target.value);
            });
        }

        // 关闭翻译面板按钮 - 关闭翻译
        const closeTranslationPanelBtn = document.getElementById("closeTranslationPanelBtn");
        if (closeTranslationPanelBtn) {
            closeTranslationPanelBtn.addEventListener("click", () => {
                this.toggleTranslation(); // 切换翻译状态
            });
        }

        // 自动滚动按钮
        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            floatingAutoScrollBtn.addEventListener("click", () => {
                this.toggleAutoScroll();
            });
            // 注意：按钮的初始状态在 HTML 中已设置，无需在这里重复更新
        }

        // 设置左侧解释面板的控制
        this.setupExplanationPanelControls();
    }

    /**
     * 初始化左侧解释面板控制
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

        // Explanation按钮关联到左侧面板
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

    /**
     * 显示左侧解释面板
     */
    showExplanationPanel() {
        const explanationPanel = document.querySelector(".explanation-panel-left");
        const quickAccessHistory = document.getElementById("quickAccessHistory");

        if (explanationPanel) {
            this.isUpdatingUI = true;
            explanationPanel.classList.remove("collapsed");
            explanationPanel.classList.add("expanded");
            if (quickAccessHistory) {
                quickAccessHistory.classList.add("active");
            }
            setTimeout(() => {
                this.isUpdatingUI = false;
            }, 0);
        }
    }

    /**
     * 隐藏左侧解释面板
     */
    hideExplanationPanel() {
        const explanationPanel = document.querySelector(".explanation-panel-left");
        const quickAccessHistory = document.getElementById("quickAccessHistory");

        if (explanationPanel) {
            this.isUpdatingUI = true;

            // 清理临时高亮（用户没有点"Add Highlight"就关闭面板）
            if (window.streamNoteInstance && window.streamNoteInstance.highlightManager) {
                window.streamNoteInstance.highlightManager.clearTemporaryHighlight();
            }

            // 清理状态消息和其超时计时器
            const statusEl = document.getElementById("status");
            if (statusEl) {
                statusEl.textContent = "";
            }
            if (window.streamNoteInstance && window.streamNoteInstance.statusMessageTimeout) {
                clearTimeout(window.streamNoteInstance.statusMessageTimeout);
                window.streamNoteInstance.statusMessageTimeout = null;
            }

            explanationPanel.classList.add("collapsed");
            explanationPanel.classList.remove("expanded");
            if (quickAccessHistory) {
                quickAccessHistory.classList.remove("active");
            }
            setTimeout(() => {
                this.isUpdatingUI = false;
            }, 0);
        }
    }

    /**
     * 切换左侧解释面板的显示/隐藏
     */
    toggleExplanationPanel() {
        const explanationPanel = document.querySelector(".explanation-panel-left");
        if (explanationPanel && explanationPanel.classList.contains("expanded")) {
            this.hideExplanationPanel();
        } else {
            this.showExplanationPanel();
        }
    }

    /**
     * 切换翻译启用/禁用
     */
    toggleTranslation() {
        this.translationEnabled = !this.translationEnabled;

        if (this.translationEnabled) {
            // 启用翻译 - 使用当前保存的翻译布局
            this.setLayout(this.translationLayout);
        } else {
            // 禁用翻译 - 只显示原文
            this.setLayout('full-transcript');
        }
    }

    /**
     * 设置翻译面板布局
     */
    setTranslationLayout(layoutType) {
        this.translationLayout = layoutType;

        // 如果翻译已启用，应用此布局
        if (this.translationEnabled) {
            this.setLayout(layoutType);
        } else {
            // 如果翻译禁用，只需更新下拉菜单值
            this.updateLayoutDropdown();
        }
    }

    /**
     * 更新翻译按钮的激活状态
     * @private
     */
    updateTranslationButton() {
        const translationToggleBtn = document.getElementById("translationToggleBtn");
        if (translationToggleBtn) {
            if (this.translationEnabled) {
                translationToggleBtn.classList.add('active');
            } else {
                translationToggleBtn.classList.remove('active');
            }
        }
    }

    /**
     * 更新布局按钮的激活状态
     * @private
     */
    updateLayoutDropdown() {
        const layoutDropdown = document.getElementById("layoutDropdown");
        if (layoutDropdown) {
            layoutDropdown.value = this.translationLayout;
        }
    }

    /**
     * 设置布局
     * @param {string} layoutType - 布局类型
     * @param {boolean} skipSave - 如果为 true，则只更新 UI 不保存也不触发回调（用于加载时）
     */
    setLayout(layoutType, skipSave = false) {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        mainContent.classList.remove("layout-full-transcript", "layout-split-top", "layout-split-bottom", "layout-split-left", "layout-split-right", "layout-full-translation");
        mainContent.classList.add(`layout-${layoutType}`);

        this.currentLayout = layoutType;

        // 更新下拉菜单状态
        this.updateLayoutDropdown();
        this.updateTranslationButton();

        if (!skipSave) {
            // 通知上层，翻译是否启用
            const translationEnabled = layoutType !== "full-transcript";
            this.onLayoutChange({
                layout: layoutType,
                translationEnabled: translationEnabled
            });

            // 保存偏好（全局保存）
            this.savePanelState();
        }
    }

    /**
     * 加载保存的初始布局和翻译状态
     */
    loadPanelState() {
        // 加载翻译启用状态（默认禁用）
        const saved = localStorage.getItem('translationEnabled');
        this.translationEnabled = saved !== null ? JSON.parse(saved) : false;

        // 加载翻译面板布局（默认 split-bottom）
        this.translationLayout = localStorage.getItem('translationLayout') || 'split-bottom';

        // 加载自动滚动状态（默认启用）
        const savedAutoScroll = localStorage.getItem('autoScroll');
        this.autoScroll = savedAutoScroll !== null ? JSON.parse(savedAutoScroll) : true;

        // 根据翻译启用状态设置初始布局
        const initialLayout = this.translationEnabled ? this.translationLayout : 'full-transcript';
        this.setLayout(initialLayout);
    }

    /**
     * 保存布局偏好、翻译状态和自动滚动设置
     * @private
     */
    savePanelState() {
        localStorage.setItem('translationEnabled', JSON.stringify(this.translationEnabled));
        localStorage.setItem('translationLayout', this.translationLayout);
        localStorage.setItem('autoScroll', JSON.stringify(this.autoScroll));
    }

    /**
     * 切换自动滚动
     */
    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        this.savePanelState();  // 保存用户的自动滚动偏好
        this.updateAutoScrollButton();

        // 如果开启自动滚动，立即滚动到底部
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    /**
     * 更新自动滚动按钮显示
     */
    updateAutoScrollButton() {
        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            if (this.autoScroll) {
                floatingAutoScrollBtn.classList.add("hidden");
            } else {
                floatingAutoScrollBtn.classList.remove("hidden");
            }
        }
    }

    /**
     * 滚动到底部（用于自动滚动）
     */
    scrollToBottom() {
        this.isTogglingAutoScroll = true;
        this.isUpdatingUI = true;

        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        const keys = Object.keys(this.preciseResults);
        if (keys.length > 0) {
            if (transcript) {
                transcript.style.scrollBehavior = 'auto';
                transcript.scrollTop = transcript.scrollHeight;
                transcript.style.scrollBehavior = 'smooth';
            }
            if (translation) {
                translation.style.scrollBehavior = 'auto';
                translation.scrollTop = translation.scrollHeight;
                translation.style.scrollBehavior = 'smooth';
            }
        }

        setTimeout(() => {
            this.isTogglingAutoScroll = false;
            this.isUpdatingUI = false;
        }, 200);
    }

    /**
     * 设置转录数据（用于滚动计算）
     */
    setTranscriptData(data) {
        this.preciseResults = data;
    }

    /**
     * 设置同步滚动
     */
    setupSyncScroll() {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        if (!transcript || !translation) {
            return;
        }

        // 根据布局确定滚动偏移
        const getScrollOffset = () => {
            switch (this.translationLayout) {
                case 'split-top':
                    return -6;  // 上布局，偏移 -6
                case 'split-bottom':
                    return 8;   // 下布局，偏移 8
                case 'split-left':
                case 'split-right':
                    return 0;   // 左右布局，偏移 0
                default:
                    return 0;
            }
        };

        // 原文容器滚动时，同步译文容器
        transcript.addEventListener('scroll', () => {
            const offset = getScrollOffset();
            this._handleScroll(transcript, translation, -offset);
        });

        // 译文容器滚动时，同步原文容器
        translation.addEventListener('scroll', () => {
            const offset = getScrollOffset();
            this._handleScroll(translation, transcript, offset);
        });
    }

    /**
     * 处理滚动事件
     * @private
     */
    _handleScroll(source, target, offset) {
        // 如果是用户手动滚动，关闭自动滚动（但不在 UI 更新期间）
        if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && this.autoScroll) {
            this.autoScroll = false;
            this.updateAutoScrollButton();
        }

        // 如果用户滑到底部，自动启用自动滚动（但不在 UI 更新期间）
        if (!this.isSyncingScroll && !this.isTogglingAutoScroll && !this.isUpdatingUI && !this.autoScroll && this.isScrolledToBottom(source)) {
            this.autoScroll = true;
            this.updateAutoScrollButton();
        }

        if (this.isSyncingScroll) return;

        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isSyncingScroll = true;

            // 如果源容器已滚到最底部，直接将目标容器也滚到最底部
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
     * 获取容器底部对应的行的data-index（底部对齐）
     * @private
     */
    getBottomLineNumber(container) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return null;

        // 从下往上遍历，找到最后一个在viewport中的元素
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            const rect = p.getBoundingClientRect();
            // 如果元素的顶部在viewport内，则返回它
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
     * 获取容器顶部对应的行号（已废弃，保留向后兼容）
     * @private
     * @deprecated 使用 getBottomLineNumber 代替底部对齐同步
     */
    getTopLineNumber(container) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return null;

        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const rect = p.getBoundingClientRect();
            if (rect.bottom > 0) {
                return {
                    index: p.getAttribute('data-index'),
                    lineNumber: i
                };
            }
        }

        return null;
    }

    /**
     * 滚动容器使指定行号居顶（带偏移）
     * @private
     */
    scrollToLineNumberTop(container, lineNumber, offsetLines = 0) {
        const paragraphs = container.querySelectorAll('p[data-index]');

        if (paragraphs.length === 0) return;

        let targetLineNumber = Math.max(0, Math.min(lineNumber + offsetLines, paragraphs.length - 1));

        const targetElement = paragraphs[targetLineNumber];
        const rect = targetElement.getBoundingClientRect();
        const elementTop = container.scrollTop + rect.top;
        container.scrollTop = elementTop;
    }

    /**
     * 滚动容器使指定 data-index 的元素靠近底部
     * @private
     */
    scrollToLineBottom(container, targetIndex) {
        const targetElement = container.querySelector(`p[data-index="${targetIndex}"]`);
        if (!targetElement) return;

        const rect = targetElement.getBoundingClientRect();
        const elementBottom = container.scrollTop + rect.bottom;
        const viewportBottom = container.scrollTop + container.clientHeight;
        const scrollOffset = elementBottom - (viewportBottom - 20);

        container.scrollTop += scrollOffset;
    }

    /**
     * 检测容器是否滑到底部
     * @private
     */
    isScrolledToBottom(container, threshold = 100) {
        return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
    }

    /**
     * 初始化侧边栏面板控制
     */
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

        // 快速访问按钮
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
                    // 触发回调，让上层处理内容初始化
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

    /**
     * 显示指定的侧边栏内容
     */
    showSidePanelContent(contentElement, title) {
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        const sidePanelTitle = document.getElementById("sidePanelTitle");
        const keywordsContent = document.getElementById("keywordsContent");
        const summaryContent = document.getElementById("summaryContent");
        const settingsContent = document.getElementById("settingsContent");
        const highlightsContent = document.getElementById("highlightsContent");

        // 隐藏所有内容
        if (keywordsContent) keywordsContent.classList.remove("active");
        if (summaryContent) summaryContent.classList.remove("active");
        if (settingsContent) settingsContent.classList.remove("active");
        if (highlightsContent) highlightsContent.classList.remove("active");

        // 移除所有按钮的 active 状态
        const quickAccessKeywords = document.getElementById("quickAccessKeywords");
        const quickAccessSummary = document.getElementById("quickAccessSummary");
        const quickAccessSettings = document.getElementById("quickAccessSettings");
        const quickAccessHighlights = document.getElementById("quickAccessHighlights");

        if (quickAccessKeywords) quickAccessKeywords.classList.remove("active");
        if (quickAccessSummary) quickAccessSummary.classList.remove("active");
        if (quickAccessSettings) quickAccessSettings.classList.remove("active");
        if (quickAccessHighlights) quickAccessHighlights.classList.remove("active");

        // 显示指定内容
        contentElement.classList.add("active");
        if (sidePanelTitle) {
            sidePanelTitle.textContent = title;
        }

        // 更新对应的按钮 active 状态
        if (contentElement === keywordsContent && quickAccessKeywords) {
            quickAccessKeywords.classList.add("active");
        } else if (contentElement === summaryContent && quickAccessSummary) {
            quickAccessSummary.classList.add("active");
        } else if (contentElement === settingsContent && quickAccessSettings) {
            quickAccessSettings.classList.add("active");
        } else if (contentElement === highlightsContent && quickAccessHighlights) {
            quickAccessHighlights.classList.add("active");
        }

        // 管理标题栏按钮的显隐
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

        // 更新 UI 状态
        this.isUpdatingUI = true;
        sidePanelsContainer.classList.add("expanded");
        setTimeout(() => {
            this.isUpdatingUI = false;
        }, 350);
    }

    /**
     * 隐藏侧边栏
     */
    hideSidePanel() {
        const sidePanelsContainer = document.querySelector(".side-panels-container");
        this.isUpdatingUI = true;
        sidePanelsContainer.classList.remove("expanded");
        setTimeout(() => {
            this.isUpdatingUI = false;
        }, 350);
    }

    /**
     * 获取当前布局
     */
    getLayout() {
        return this.currentLayout;
    }

    /**
     * 获取翻译是否启用
     */
    isTranslationEnabled() {
        return this.currentLayout !== "full-transcript";
    }
}
