/**
 * 关键词管理器 - 前端模块
 * 负责关键词的存储、分类、显示、解释、以及查询历史管理
 */

class KeywordManager {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "/api/extract-keywords";
        this.apiClient = config.apiClient || null;
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");
        this.displayManager = new KeywordDisplayManager(this);
        this.contextManager = new KeywordContextManager(this);
        this.historyManager = new KeywordHistoryManager(this);
        this.explanationFetchManager = new KeywordExplanationFetchManager(this);
        this.explanationActionsManager = new KeywordExplanationActionsManager(this);
        this.explanationNavigationManager = new KeywordExplanationNavigationManager(this);
        this.collectionManager = new KeywordCollectionManager(this);
        this.utilitiesManager = new KeywordUtilitiesManager(this);

        this.currentKeywords = [];
        this.explanations = [];          // 在解释面板查询过的词（旧格式，仅字词列表）

        // 分类存储
        this.highlights = [];        // 用户高亮的词
        this.extracts = [];          // 自动提取的关键词
        this.explanationHistory = []; // 解释查询历史（完整记录，包含explanation和context）

        // 高亮位置信息：{ "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }
        // 用于精确提取上下文
        this.highlightPositions = config.highlightPositions || {};

        // 词语来源面板映射：{ "word": "transcript" | "translation" }
        // 用于追踪词语是从转录还是从译文中选中的
        this.wordSourcePanel = {};

        // 录制管理器引用（用于获取preciseResults）
        this.recordingManager = config.recordingManager || null;
        this.getTranscriptData = config.getTranscriptData || (() => ({}));

        // 翻译管理器引用（用于获取翻译数据）
        this.translationManager = config.translationManager || null;

        // 高亮管理器引用（用于添加高亮）
        this.highlightManager = config.highlightManager || null;

        // 解释 API
        this.explanationApiUrl = config.explanationApiUrl || "/api/explain-keyword";

        // 三个缓存: {"keyword|language": "explanation", ...}
        this.extractsCache = {};      // 自动提取关键词的解释缓存
        this.highlightCache = {};    // 用户高亮词的解释缓存
        this.explanationCache = {};  // 即时解释词的解释缓存

        // 跟踪展开状态的关键词
        this.expandedKeywords = new Set();

        // 解释列表显示元素
        this.historyElement = config.historyElement || document.getElementById("query-history-list");

        // 面板管理器引用（用于显示解释面板）
        this.panelManager = config.panelManager || null;

        // 状态消息回调
        this.onStatusMessage = config.onStatusMessage || (() => { });

        // 当前解释面板显示的上下文的位置信息
        // 用于直接高亮，避免重新搜索
        this.currentContextPositionInfo = null;  // { sourceIndices, container, sourcePanel }
        this.currentContextWord = null;         // 当前显示上下文的词

        // 发音流程管理器
        this.pronunciationManager = new KeywordPronunciationManager(this);

        // 语音朗读状态
        this.isPronouncing = false;              // 是否正在发音
        this.setupPronounceButton();             // 初始化发音按钮

        // [FIX] 备用缓存：保存最后一次成功获取的转录数据
        // 用于当主数据源（recordingManager）暂时为空时的fallback
        this.lastKnownTranscriptData = null;

        // [防护] 用于防止并发explanation请求的标记
        this.currentExpanationRequestId = 0;  // 用++递增，从1开始
        this.currentLoadingKeyword = null;
    }

    finishExplanationOperation(app, operationTracker, reason) {
        if (operationTracker) {
            operationTracker.abort(reason);
        }
        if (app && app.operationManager) {
            app.operationManager.endExplanation();
        }
    }

    /**
     * 提取关键词 (AI 驱动)
     * @param {string} text - 输入文本
     * @returns {Promise<Array>} 关键词列表
     */
    async extractKeywords(text) {
        if (!text || text.length < 10) {
            return [];
        }

        try {
            // === [执行上下文防护] ===
            const app = window.streamNoteInstance;
            const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;

            // 启动操作追踪
            let operationTracker = null;
            if (app && app.operationManager) {
                operationTracker = app.operationManager.startKeywords(executionContextSnapshot);
            }

            const payload = {
                text: text
            };

            const signal = operationTracker ? operationTracker.getSignal() : undefined;
            const response = this.apiClient
                ? await this.apiClient.extractKeywords(payload, signal)
                : await fetch(this.apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal,
                });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // [防护] 检查执行上下文是否仍然有效
            if (operationTracker && !operationTracker.isValid(app)) {
                console.log(`[KeywordManager] extractKeywords: Context changed before reading response`);
                if (app && app.operationManager) app.operationManager.endKeywords();
                return [];
            }

            const data = await response.json();

            // [防护] 最后检查一次执行上下文
            if (operationTracker && !operationTracker.isValid(app)) {
                console.log(`[KeywordManager] extractKeywords: Context changed after reading response, discarding keywords`);
                if (app && app.operationManager) app.operationManager.endKeywords();
                return [];
            }

            this.currentKeywords = data.keywords || [];

            // [防护] 标记操作完成
            if (operationTracker) {
                operationTracker.abort('Keywords extraction completed');
            }
            if (app && app.operationManager) {
                app.operationManager.endKeywords();
            }

            return this.currentKeywords;

        } catch (error) {
            console.error("[KeywordManager] Error:", error);

            // [防护] 清理操作追踪
            const app = window.streamNoteInstance;
            if (app && app.operationManager) {
                app.operationManager.endKeywords();
            }

            return [];
        }
    }

    /**
     * 显示关键词列表（可展开式）
     * @param {Array<string>} keywords - 关键词数组
     * @param {HTMLElement} targetElement - 目标显示元素（可选，默认使用 this.keywordElement）
     */
    displayKeywordsList(keywords, targetElement = null) {
        this.displayManager?.displayKeywordsList(keywords, targetElement);
    }

    /**
     * 显示用户高亮的词
     */
    displayHighlights() {
        this.displayManager?.displayHighlights();
    }

    /**
     * 显示自动提取的关键词列表
     */
    displayExtracts() {
        this.displayManager?.displayExtracts();
    }

    /**
     * 同时更新所有关键词列表（高亮 + 自动提取）
     */
    updateAllKeywordDisplays() {
        this.displayManager?.updateAllKeywordDisplays();
    }

    /**
     * 定位关键词到原文或翻译中
     * @param {string} keyword - 关键词
     */
    scrollToKeyword(keyword) {
        this.utilitiesManager?.scrollToKeyword(keyword);
    }

    /**
     * 设置高亮的位置信息（来自HighlightManager）
     * @param {Object} positions - { "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }
     */
    setHighlightPositions(positions) {
        this.utilitiesManager?.setHighlightPositions(positions);
    }

    /**
     * 获取并显示关键词的解释 - 流式版本，支持基于上下文
     * @param {string} keyword - 关键词
     * @param {HTMLElement} container - 显示容器
     */
    async fetchAndShowExplanation(keyword, container) {
        await this.explanationFetchManager?.fetchAndShowExplanation(keyword, container);
    }



    /**
     * 添加项目到解释列表
     * @param {string} term - 查询词
     */
    addToExplanations(term) {
        this.collectionManager?.addToExplanations(term);
    }

    /**
     * 删除解释列表中的项
     * @param {string} term - 要删除的词
     */
    removeFromExplanations(term) {
        this.collectionManager?.removeFromExplanations(term);
    }

    /**
     * 删除关键词项（供通用列表使用）
     * @param {string} keyword - 要删除的关键词
     */
    deleteKeywordItem(keyword) {
        this.collectionManager?.deleteKeywordItem(keyword);
    }

    /**
     * 切换自动提取关键词的高亮状态
     * @param {string} keyword - 关键词
     */
    toggleExtractedKeywordHighlight(keyword) {
        this.collectionManager?.toggleExtractedKeywordHighlight(keyword);
    }

    /**
     * 重新解释关键词
     * @param {string} keyword - 要重新解释的关键词
     */
    async reexplainExplanation(keyword) {
        await this.explanationActionsManager?.reexplainExplanation(keyword);
    }

    /**
     * 复制关键词的解释到剪贴板
     * @param {string} keyword - 要复制解释的关键词
     */
    copyExplanation(keyword) {
        this.explanationActionsManager?.copyExplanation(keyword);
    }

    /**
     * 打开解释面板（支持自定义位置信息和源面板）
     * @param {string} word - 要解释的词
     * @param {Object} positionInfo - 可选的位置信息 { sourceIndices: [...] }
     * @param {string} sourcePanel - 词语的来源面板 ('transcript' 或 'translation')，默认从记录中读取或使用 'transcript'
     */
    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        await this.explanationNavigationManager?.openExplanationForWord(word, positionInfo, sourcePanel);
    }

    /**
     * 初始化发音按钮事件监听
     */
    setupPronounceButton() {
        this.pronunciationManager?.setupPronounceButton();
    }

    /**
     * 发音单词
     * @param {string} word - 要发音的单词
     */
    pronounceWord(word) {
        this.pronunciationManager?.pronounceWord(word);
    }

    /**
     * 显示焦点式解释面板
     * @param {string} word - 要显示的词
     */
    async displayExplanationFocusView(word) {
        await this.explanationFetchManager?.displayExplanationFocusView(word);
    }

    /**
     * 获取并显示关键词的解释（焦点视图版本）
     * @param {string} keyword - 关键词
     * @param {HTMLElement} contentElement - 显示容器
     */
    async fetchAndShowExplanationForFocusView(keyword, contentElement) {
        await this.explanationFetchManager?.fetchAndShowExplanationForFocusView(keyword, contentElement);
    }

    /**
     * 获取关键词的上下文（用于发送给API）
     * 即使无法获取本地转录数据，也不会返回null，确保API调用安全
     * @param {string} keyword - 关键词
     * @returns {string} 上下文（可能为空字符串，但不会为null）
     */
    getContextForKeyword(keyword) {
        return this.contextManager?.getContextForKeyword(keyword) || "";
    }

    /**
     * 更新词语的上下文显示（使用拼接方式：前50字+词+后50字）
     * @param {string} keyword - 关键词
     */
    updateWordContext(keyword) {
        return this.contextManager?.updateWordContext(keyword) || null;
    }

    /**
     * 基于位置信息构建context（前50字+加粗词+后50字，支持跨段）
     * 始终保留本段的完整内容，从前后段落补充
     * @private
     */
    _buildContextByPosition(positionInfo, keyword, contextLength = 50) {
        return this.contextManager?._buildContextByPosition(positionInfo, keyword, contextLength) || "";
    }

    /**
     * 基于搜索构建context（降级方案，前50字+加粗词+后50字，支持跨段）
     * 始终保留本段的完整内容，从前后段落补充
     * @private
     */
    _buildContextBySearch(keyword, contextLength = 50) {
        return this.contextManager?._buildContextBySearch(keyword, contextLength) || "";
    }

    /**
     * 重新解释当前显示词
     */
    async reexplainCurrentExplanation() {
        await this.explanationFetchManager?.reexplainCurrentExplanation();
    }

    /**
     * 刷新所有已展开的解释（用新语言重新解释）
     */
    refreshExpandedExplanations() {
        this.explanationFetchManager?.refreshExpandedExplanations();
    }

    /**
     * 完整流程：提取 → 显示
     * @param {string} text - 输入文本（仅用于提取关键词）
     */
    async processText(text) {
        return await this.collectionManager?.processText(text);
    }

    /**
     * 保存完整的解释历史记录
     * @param {string} word - 词语
     * @param {string} explanation - 解释内容
     * @param {string} contextDisplayText - 上下文显示文本（来自HTML）
     */
    saveExplanationHistory(word, explanation, contextDisplayText = null) {
        this.historyManager?.saveExplanationHistory(word, explanation, contextDisplayText);
    }

    /**
     * 恢复并显示历史记录中的某个解释
     * @param {Object} historyRecord - 历史记录对象 {word, explanation, context, sourceIndices, language, sourcePanel, ...}
     */
    async restoreExplanationHistoryRecord(historyRecord) {
        await this.historyManager?.restoreExplanationHistoryRecord(historyRecord);
    }

    /**
     * 重置
     */
    reset() {
        this.collectionManager?.reset();
    }
}

// 导出为全局对象
window.KeywordManager = KeywordManager;
