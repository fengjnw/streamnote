/**
 * 关键词提取器 - 前端模块
 * 负责与后端通信、高亮关键词、显示关键词
 */

class KeywordExtractor {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "/api/extract-keywords";
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");

        this.enabled = true;  // 是否启用关键词提取

        this.currentKeywords = [];
        this.allCollectedKeywords = [];  // 保存所有收集到的关键词（向后兼容）

        // 分类存储
        this.manualKeywords = [];    // 手动添加的关键词
        this.autoKeywords = [];      // 自动提取的关键词

        // 解释 API
        this.explanationApiUrl = config.explanationApiUrl || "/api/explain-keyword";

        // 解释缓存: {"keyword|language": "explanation", ...}
        this.explanationCache = {};

        // 跟踪展开状态的关键词
        this.expandedKeywords = new Set();

        // 查询历史: [term1, term2, ...] (保持查询顺序，新的在前)
        this.queryHistory = [];
        this.maxHistorySize = 20;  // 最多保留20条历史
        this.historyElement = config.historyElement || document.getElementById("query-history-list");
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
            console.error("[KeywordExtractor] Error:", error);
            return [];
        }
    }

    /**
     * 通用的列表显示方法（关键词和历史都使用）
     * @param {Array<string>} items - 要显示的项目列表
     * @param {HTMLElement} containerElement - 容器元素
     * @param {string} deleteHandlerName - 删除处理函数的名字（"deleteKeywordItem" 或 "removeFromQueryHistory"）
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
                            <button class="keyword-expand-btn" onclick="window.keywordExtractorInstance.toggleExplanation('${item.replace(/'/g, "\\'")}')"
                                title="Click to expand/collapse explanation">
                                <span class="expand-icon">▸</span>
                            </button>
                            <span class="keyword-text" onclick="window.keywordExtractorInstance.toggleExplanation('${item.replace(/'/g, "\\'")}')"
                                style="cursor: pointer; flex: 1;">
                                ${item}
                            </span>
                            <button class="keyword-delete-btn" onclick="window.keywordExtractorInstance.${deleteHandlerName}('${item.replace(/'/g, "\\'")}')">×</button>
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
     * 显示手动关键词列表
     */
    displayManualKeywords() {
        const element = document.getElementById("manual-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.manualKeywords)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No manual keywords yet");
    }

    /**
     * 显示自动提取的关键词列表
     */
    displayAutoKeywords() {
        const element = document.getElementById("auto-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.autoKeywords)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No auto-extracted keywords yet");
    }

    /**
     * 同时更新所有关键词列表（手动 + 自动）
     */
    updateAllKeywordDisplays() {
        this.displayManualKeywords();
        this.displayAutoKeywords();

        // 保持向后兼容：更新 allCollectedKeywords
        this.allCollectedKeywords = [...this.manualKeywords, ...this.autoKeywords];
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
     * 获取并显示关键词的解释 - 流式版本
     * @param {string} keyword - 关键词
     * @param {HTMLElement} container - 显示容器
     */
    async fetchAndShowExplanation(keyword, container) {
        const contentElement = container.querySelector('.explanation-content');

        if (!contentElement) {
            console.error("[KeywordExtractor] Content element not found");
            return;
        }

        try {
            // 获取解释语言（从全局 StreamNote 实例）
            const explanationLanguage = window.streamNoteInstance?.keywordExplanationLanguage || "English";

            // 生成缓存 key
            const cacheKey = `${keyword}|${explanationLanguage}`;

            // 检查缓存
            if (this.explanationCache[cacheKey]) {
                contentElement.innerHTML = `<p>${this.explanationCache[cacheKey]}</p>`;
                return;
            }

            const response = await fetch(this.explanationApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    keyword: keyword,
                    language: explanationLanguage
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
            console.error("[KeywordExtractor] Error fetching explanation:", error);
            contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;
        }
    }



    /**
     * 添加项目到查询历史
     * @param {string} term - 查询词
     */
    addToQueryHistory(term) {
        term = term.trim();
        if (!term) return;

        // 如果已经在历史中，先删除（将其移到最前）
        this.queryHistory = this.queryHistory.filter(t => t !== term);

        // 添加到最前
        this.queryHistory.unshift(term);

        // 限制历史大小
        if (this.queryHistory.length > this.maxHistorySize) {
            this.queryHistory = this.queryHistory.slice(0, this.maxHistorySize);
        }

        // 更新显示
        this.displayQueryHistory();

        // 保存到 session
        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    /**
     * 删除查询历史中的项
     * @param {string} term - 要删除的词
     */
    removeFromQueryHistory(term) {
        this.queryHistory = this.queryHistory.filter(t => t !== term);
        this.displayQueryHistory();

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
     * 显示查询历史
     */
    displayQueryHistory() {
        this.displayItemList(this.queryHistory, this.historyElement, "removeFromQueryHistory", "No queries yet");
    }

    /**
     * 完整流程：提取 → 显示
     * @param {string} text - 输入文本（仅用于提取关键词）
     */
    async processText(text) {
        if (!this.enabled) {
            return [];
        }

        const keywords = await this.extractKeywords(text);

        if (keywords.length > 0) {
            // 将新关键词添加到自动提取的关键词，避免重复
            this.autoKeywords = [...new Set([...this.autoKeywords, ...keywords])];
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
     * 设置启用状态
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            if (this.keywordElement) {
                this.keywordElement.innerHTML = '<p class="placeholder">Keywords disabled</p>';
            }
        }
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
        this.manualKeywords = [];
        this.autoKeywords = [];
        if (this.keywordElement) {
            this.keywordElement.innerHTML = '';
        }
    }
}

// 导出为全局对象
window.KeywordExtractor = KeywordExtractor;
