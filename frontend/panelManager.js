/**
 * 面板管理器 - 前端模块
 * 负责面板显示/隐藏、布局切换、滚动同步、自动滚动
 */

class PanelManager {
    constructor(config = {}) {
        this.onLayoutChange = config.onLayoutChange || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });

        // 布局状态
        this.currentLayout = 'split';

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
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            layoutSelector.addEventListener("change", (e) => {
                this.setLayout(e.target.value);
            });
        }

        // 关闭转录面板按钮
        const closeTranscriptPanelBtn = document.getElementById("closeTranscriptPanelBtn");
        if (closeTranscriptPanelBtn) {
            closeTranscriptPanelBtn.addEventListener("click", () => {
                this.setLayout("full-translation");
            });
        }

        // 关闭翻译面板按钮
        const closeTranslationPanelBtn = document.getElementById("closeTranslationPanelBtn");
        if (closeTranslationPanelBtn) {
            closeTranslationPanelBtn.addEventListener("click", () => {
                this.setLayout("full-transcript");
            });
        }

        // 自动滚动按钮
        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            floatingAutoScrollBtn.addEventListener("click", () => {
                this.toggleAutoScroll();
            });
            this.updateAutoScrollButton();
        }
    }

    /**
     * 设置布局
     */
    setLayout(layoutType) {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        mainContent.classList.remove("layout-full-transcript", "layout-split", "layout-full-translation");
        mainContent.classList.add(`layout-${layoutType}`);

        this.currentLayout = layoutType;

        // 通知上层，翻译是否启用
        const translationEnabled = layoutType !== "full-transcript";
        this.onLayoutChange({
            layout: layoutType,
            translationEnabled: translationEnabled
        });

        // 保存偏好
        this.savePanelState();
    }

    /**
     * 加载保存的初始布局
     */
    loadPanelState() {
        const layoutPreference = localStorage.getItem('layoutPreference') || 'split';
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            layoutSelector.value = layoutPreference;
            this.setLayout(layoutPreference);
        } else {
            // 如果没有选择器，直接应用
            this.setLayout(layoutPreference);
        }
    }

    /**
     * 保存布局偏好
     * @private
     */
    savePanelState() {
        const layoutSelector = document.getElementById("layoutSelector");
        if (layoutSelector) {
            localStorage.setItem('layoutPreference', layoutSelector.value);
        } else {
            localStorage.setItem('layoutPreference', this.currentLayout);
        }
    }

    /**
     * 切换自动滚动
     */
    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
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
            const lastIndex = keys[keys.length - 1];

            if (transcript) {
                transcript.style.scrollBehavior = 'auto';
                this.scrollToLineBottom(transcript, lastIndex);
                transcript.style.scrollBehavior = 'smooth';
            }
            if (translation) {
                translation.style.scrollBehavior = 'auto';
                this.scrollToLineBottom(translation, lastIndex);
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
        const SCROLL_OFFSET = 8;

        if (!transcript || !translation) {
            return;
        }

        // 原文容器滚动时，同步译文容器
        transcript.addEventListener('scroll', () => {
            this._handleScroll(transcript, translation, -SCROLL_OFFSET);
        });

        // 译文容器滚动时，同步原文容器
        translation.addEventListener('scroll', () => {
            this._handleScroll(translation, transcript, SCROLL_OFFSET);
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

            const topInfo = this.getTopLineNumber(source);

            if (topInfo) {
                target.style.scrollBehavior = 'auto';
                this.scrollToLineNumberTop(target, topInfo.lineNumber, offset);
            }

            setTimeout(() => {
                this.isSyncingScroll = false;
            }, 200);
        }, 400);
    }

    /**
     * 获取容器顶部对应的行号
     * @private
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
    isScrolledToBottom(container, threshold = 10) {
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
            history: document.getElementById("quickAccessHistory"),
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
        setupQuickAccessBtn('history', 'history');
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
        const historyContent = document.getElementById("historyContent");
        const settingsContent = document.getElementById("settingsContent");
        const highlightsContent = document.getElementById("highlightsContent");

        // 隐藏所有
        if (keywordsContent) keywordsContent.classList.remove("active");
        if (summaryContent) summaryContent.classList.remove("active");
        if (historyContent) historyContent.classList.remove("active");
        if (settingsContent) settingsContent.classList.remove("active");
        if (highlightsContent) highlightsContent.classList.remove("active");

        // 显示指定内容
        contentElement.classList.add("active");
        if (sidePanelTitle) {
            sidePanelTitle.textContent = title;
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
