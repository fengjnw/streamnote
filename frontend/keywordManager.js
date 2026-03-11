/**
 * 关键词管理器 - 前端模块
 * 负责关键词的存储、分类、显示、解释、以及查询历史管理
 */

class KeywordManager {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "/api/extract-keywords";
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");

        this.currentKeywords = [];
        this.allCollectedKeywords = [];  // 保存所有收集到的关键词（向后兼容）

        // 分类存储
        this.highlights = [];        // 用户高亮的词
        this.extracts = [];          // 自动提取的关键词
        this.explanations = [];      // 即时解释面板的词

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
            const payload = {
                text: text
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            this.currentKeywords = data.keywords || [];
            return this.currentKeywords;

        } catch (error) {
            console.error("[KeywordManager] Error:", error);
            return [];
        }
    }

    /**
     * 通用的列表显示方法（关键词和解释都使用）
     * @param {Array<string>} items - 要显示的项目列表
     * @param {HTMLElement} containerElement - 容器元素
     * @param {string} deleteHandlerName - 删除处理函数的名字（"deleteKeywordItem" 或 "removeFromExplanations"）
     * @param {string} emptyMessage - 列表为空时的提示信息
     */
    displayItemList(items, containerElement, deleteHandlerName, emptyMessage = "No items") {
        if (!containerElement) {
            return;
        }

        if (items.length === 0) {
            containerElement.innerHTML = `<p class="placeholder">${emptyMessage}</p>`;
            return;
        }

        const html = `
            <div class="keywords-items">
                ${items.map(item => `
                    <div class="keyword-item-wrapper">
                        <div class="keyword-item">
                            <button class="keyword-expand-btn" onclick="window.keywordManagerInstance.toggleExplanation('${item.replace(/'/g, "\\'")}')"
                                title="Click to expand/collapse explanation">
                                <span class="expand-icon">▸</span>
                            </button>
                            <span class="keyword-text" onclick="window.keywordManagerInstance.toggleExplanation('${item.replace(/'/g, "\\'")}')"
                                style="cursor: pointer; flex: 1;">
                                ${item}
                            </span>
                            <button class="keyword-delete-btn" onclick="window.keywordManagerInstance.${deleteHandlerName}('${item.replace(/'/g, "\\'")}')">×</button>
                        </div>
                        <div class="keyword-explanation" data-keyword="${item}" style="display: none;">
                            <div class="explanation-content">
                                <p class="placeholder">Loading...</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        containerElement.innerHTML = html;
    }

    /**
     * 显示关键词列表（可展开式）
     * @param {Array<string>} keywords - 关键词数组
     * @param {HTMLElement} targetElement - 目标显示元素（可选，默认使用 this.keywordElement）
     */
    displayKeywordsList(keywords, targetElement = null) {
        const element = targetElement || this.keywordElement;
        const uniqueKeywords = [...new Set(keywords)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No keywords detected");
    }

    /**
     * 显示用户高亮的词
     */
    displayHighlights() {
        const element = document.getElementById("manual-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.highlights)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No highlights yet");
    }

    /**
     * 显示自动提取的关键词列表
     */
    displayExtracts() {
        const element = document.getElementById("auto-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.extracts)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No auto-extracted keywords yet");
    }

    /**
     * 同时更新所有关键词列表（高亮 + 自动提取）
     */
    updateAllKeywordDisplays() {
        this.displayHighlights();
        this.displayExtracts();

        // 保持向后兼容：更新 allCollectedKeywords
        this.allCollectedKeywords = [...this.highlights, ...this.extracts];
    }

    /**
     * 切换关键词解释的展开/收起状态
     * @param {string} keyword - 关键词
     */
    async toggleExplanation(keyword) {
        // 更稳健的方式：遍历所有 keyword-explanation 元素，找到匹配的
        const allExplanations = document.querySelectorAll('.keyword-explanation');
        let wrapper = null;

        for (const elem of allExplanations) {
            if (elem.getAttribute('data-keyword') === keyword) {
                wrapper = elem;
                break;
            }
        }

        if (!wrapper) {
        }

        const expandBtn = wrapper.parentElement?.querySelector('.keyword-expand-btn');

        const isCurrentlyExpanded = this.expandedKeywords.has(keyword);

        if (isCurrentlyExpanded) {
            // 收起
            this.expandedKeywords.delete(keyword);
            wrapper.style.display = 'none';
            if (expandBtn) {
                expandBtn.classList.remove('expanded');
            }
        } else {
            // 展开
            this.expandedKeywords.add(keyword);
            wrapper.style.display = 'block';
            if (expandBtn) {
                expandBtn.classList.add('expanded');
            }
            // 如果还没有加载过解释，现在加载它
            await this.fetchAndShowExplanation(keyword, wrapper);
        }
    }

    /**
     * 从当前笔记文本中提取关键词的上下文
     * @param {string} keyword - 关键词
     * @param {string} fullText - 完整笔记文本
     * @param {number} contextLength - 前后各取多少字符（默认100）
     * @returns {string} 包含关键词的上下文
     */
    extractKeywordContext(keyword, fullText, contextLength = 100) {
        if (!keyword || !fullText) return "";

        // 查找关键词在文本中的位置（不区分大小写）
        const lowerText = fullText.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerText.indexOf(lowerKeyword);

        if (index === -1) return "";  // 关键词不在文本中

        // 计算context的起始和结束位置
        const contextStart = Math.max(0, index - contextLength);
        const contextEnd = Math.min(fullText.length, index + keyword.length + contextLength);

        let context = fullText.substring(contextStart, contextEnd);

        // 如果不是从文本开头开始，添加省略号
        if (contextStart > 0) {
            context = "..." + context;
        }

        // 如果不是到文本末尾，添加省略号
        if (contextEnd < fullText.length) {
            context = context + "...";
        }

        return context.trim();
    }

    /**
     * 获取并显示关键词的解释 - 流式版本，支持基于上下文
     * @param {string} keyword - 关键词
     * @param {HTMLElement} container - 显示容器
     */
    async fetchAndShowExplanation(keyword, container) {
        const contentElement = container.querySelector('.explanation-content');

        if (!contentElement) {
            console.error("[KeywordManager] Content element not found");
            return;
        }

        try {
            // 获取解释语言（从全局 StreamNote 实例）
            const explanationLanguage = window.streamNoteInstance?.language || "English";

            // 生成缓存 key
            const cacheKey = `${keyword}|${explanationLanguage}`;

            // 检查缓存
            if (this.explanationCache[cacheKey]) {
                contentElement.innerHTML = `<p>${this.explanationCache[cacheKey]}</p>`;
                return;
            }

            // 从当前笔记文本中提取上下文
            const currentText = window.streamNoteInstance?.currentTranscriptText || "";
            const context = this.extractKeywordContext(keyword, currentText, 100);

            const response = await fetch(this.explanationApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    keyword: keyword,
                    language: explanationLanguage,
                    context: context  // 添加上下文
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let explanation = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    explanation += chunk;

                    // 实时更新显示（逐字显示）
                    if (explanation) {
                        contentElement.innerHTML = `<p>${explanation}</p>`;
                    }
                }
                // 刷新解码器缓冲区，获取最后的字符
                const finalChunk = decoder.decode();
                explanation += finalChunk;
                if (finalChunk) {
                    contentElement.innerHTML = `<p>${explanation}</p>`;
                }
            } finally {
                reader.releaseLock();
            }

            // 存入缓存
            this.explanationCache[cacheKey] = explanation;

            // 最终显示
            contentElement.innerHTML = `<p>${explanation}</p>`;
        } catch (error) {
            console.error("[KeywordManager] Error fetching explanation:", error);
            contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;
        }
    }



    /**
     * 添加项目到解释列表
     * @param {string} term - 查询词
     */
    addToExplanations(term) {
        term = term.trim();
        if (!term) return;

        // 如果已经在列表中，先删除（将其移到最前）
        this.explanations = this.explanations.filter(t => t !== term);

        // 添加到最前
        this.explanations.unshift(term);

        // 限制列表大小（最多保留20条）
        if (this.explanations.length > 20) {
            this.explanations = this.explanations.slice(0, 20);
        }

        // 更新显示
        this.displayExplanations();

        // 保存到 session
        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    /**
     * 删除解释列表中的项
     * @param {string} term - 要删除的词
     */
    removeFromExplanations(term) {
        this.explanations = this.explanations.filter(t => t !== term);
        this.displayExplanations();

        // 保存到 session
        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    /**
     * 删除关键词项（供通用列表使用）
     * @param {string} keyword - 要删除的关键词
     */
    deleteKeywordItem(keyword) {
        if (window.streamNoteInstance) {
            window.streamNoteInstance.deleteKeyword(keyword);
        }
    }

    /**
     * 显示解释列表
     */
    displayExplanations() {
        this.displayItemList(this.explanations, this.historyElement, "removeFromExplanations", "No explanations yet");
    }

    /**
     * 设置面板管理器引用
     * @param {PanelManager} panelManager
     */
    setPanelManager(panelManager) {
        this.panelManager = panelManager;
    }

    /**
     * 显示解释面板 - 统一处理词条解释的完整流程
     * @param {string} term - 要解释的词条
     */
    showExplanationPanel(term) {
        term = term.trim();
        if (!term) return;

        // 添加到解释列表（如果不存在）
        if (!this.explanations.includes(term)) {
            this.addToExplanations(term);
        } else {
            // 已存在则刷新显示（确保排序为最新）
            this.explanations = this.explanations.filter(t => t !== term);
            this.explanations.unshift(term);
            this.displayExplanations();
        }

        // 通过面板管理器显示解释面板
        if (this.panelManager) {
            const historyContent = document.getElementById("historyContent");
            if (historyContent) {
                // 显示解释面板，标题为 "Explanation"
                this.panelManager.showSidePanelContent(historyContent, "Explanation");

                // 展开该词条的解释
                setTimeout(() => {
                    this.toggleExplanation(term);
                }, 50);
            }
        }
    }

    /**
     * 刷新所有已展开的解释（用新语言重新生成）
     */
    refreshExpandedExplanations() {
        for (const keyword of this.expandedKeywords) {
            const wrapper = document.querySelector(`[data-keyword="${keyword}"]`);
            if (wrapper) {
                this.fetchAndShowExplanation(keyword, wrapper);
            }
        }
    }

    /**
     * 完整流程：提取 → 显示
     * @param {string} text - 输入文本（仅用于提取关键词）
     */
    async processText(text) {
        const keywords = await this.extractKeywords(text);

        if (keywords.length > 0) {
            // 将新关键词添加到自动提取的关键词，避免重复
            this.extracts = [...new Set([...this.extracts, ...keywords])];
        }

        return keywords;
    }

    /**
     * 获取当前关键词
     * @returns {Array<string>}
     */
    getKeywords() {
        return this.currentKeywords;
    }

    /**
     * 设置强度等级
     * @param {number} intensity - 1-10，表示关键词相对比例（1=最少，10=最多）
     */
    setIntensity(intensity) {
        this.intensity = Math.max(1, Math.min(10, intensity));
    }

    /**
     * 重置
     */
    reset() {
        this.currentKeywords = [];
        this.allCollectedKeywords = [];
        this.highlights = [];
        this.extracts = [];
        if (this.keywordElement) {
            this.keywordElement.innerHTML = '';
        }
    }
}

// 导出为全局对象
window.KeywordManager = KeywordManager;
