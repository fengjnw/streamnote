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
        this.pronunciationManager?.setupPronounceButton(); // 初始化发音按钮

        // [FIX] 备用缓存：保存最后一次成功获取的转录数据
        // 用于当主数据源（recordingManager）暂时为空时的fallback
        this.lastKnownTranscriptData = null;

        // [防护] 用于防止并发explanation请求的标记
        this.currentExpanationRequestId = 0;  // 用++递增，从1开始
        this.currentLoadingKeyword = null;
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

        const app = window.streamNoteInstance;
        const keywordsOperation = OperationGuards.start(app, "keywords");
        const endKeywordsOperation = OperationGuards.endOnce(keywordsOperation);

        try {
            const payload = {
                text: text
            };

            const signal = OperationGuards.getSignal(keywordsOperation);
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
            if (!OperationGuards.isValid(keywordsOperation)) {
                console.log(`[KeywordManager] extractKeywords: Context changed before reading response`);
                endKeywordsOperation('Context changed before reading response');
                return [];
            }

            const data = await response.json();

            // [防护] 最后检查一次执行上下文
            if (!OperationGuards.isValid(keywordsOperation)) {
                console.log(`[KeywordManager] extractKeywords: Context changed after reading response, discarding keywords`);
                endKeywordsOperation('Context changed after reading response');
                return [];
            }

            this.currentKeywords = data.keywords || [];

            // [防护] 标记操作完成
            endKeywordsOperation('Keywords extraction completed');

            return this.currentKeywords;

        } catch (error) {
            console.error("[KeywordManager] Error:", error);

            // [防护] 清理操作追踪
            endKeywordsOperation(`Error: ${error.message}`);

            return [];
        }
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
     * 打开解释面板（支持自定义位置信息和源面板）
     * @param {string} word - 要解释的词
     * @param {Object} positionInfo - 可选的位置信息 { sourceIndices: [...] }
     * @param {string} sourcePanel - 词语的来源面板 ('transcript' 或 'translation')，默认从记录中读取或使用 'transcript'
     */
    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        await this.explanationNavigationManager?.openExplanationForWord(word, positionInfo, sourcePanel);
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
     * 重置
     */
    reset() {
        this.collectionManager?.reset();
    }
}

// 导出为全局对象
window.KeywordManager = KeywordManager;
