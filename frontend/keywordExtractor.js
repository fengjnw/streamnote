/**
 * 关键词提取器 - 前端模块
 * 负责与后端通信、高亮关键词、显示关键词
 */

class KeywordExtractor {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "http://localhost:5000/api/extract-keywords";
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");

        this.enabled = true;  // 是否启用关键词提取
        this.intensity = 5;   // 强度等级 (1-10)，表示关键词相对比例

        this.currentKeywords = [];
        this.allCollectedKeywords = [];  // 保存所有收集到的关键词

        // 解释 API
        this.explanationApiUrl = config.explanationApiUrl || "http://localhost:5001/api/explain-keyword";

        // 解释缓存: {"keyword|language": "explanation", ...}
        this.explanationCache = {};

        console.log("[KeywordExtractor] Initialized", config);
    }

    /**
     * 根据文本长度和强度计算最优的 top_k
     * @param {string} text - 输入文本
     * @returns {number} 计算出的 top_k 值
     */
    calculateTopK(text) {
        // 估算单词数（简单分割）
        const wordCount = text.trim().split(/\s+/).length;

        // 根据文本长度确定范围
        // 最少：每100个单词提1个关键词
        // 最多：每15个单词提1个关键词
        const minTopK = Math.max(1, Math.ceil(wordCount / 100));
        const maxTopK = Math.max(2, Math.ceil(wordCount / 15));

        // 强度 (1-10) 映射到 min-max 范围
        // 强度 1: 接近 minTopK（提取最少关键词）
        // 强度 5: 中间值
        // 强度 10: 接近 maxTopK（提取最多关键词）
        const ratio = (this.intensity - 1) / 9;  // 0 到 1
        const topK = Math.round(minTopK + (maxTopK - minTopK) * ratio);

        console.log(`[KeywordExtractor] Calculated topK: ${topK} (words: ${wordCount}, intensity: ${this.intensity})`);
        return topK;
    }

    /**
     * 提取关键词 (AI 驱动)
     * @param {string} text - 输入文本
     * @param {number} topK - 可选的 top_k 值，不提供则根据文本长度动态计算
     * @returns {Promise<Array>} 关键词列表
     */
    async extractKeywords(text, topK = null) {
        if (!text || text.length < 10) {
            return [];
        }

        // 如果未指定 top_k，根据文本长度和强度动态计算
        const calculatedTopK = topK || this.calculateTopK(text);

        try {
            const payload = {
                text: text,
                top_k: calculatedTopK
            };

            console.log("[KeywordExtractor] Requesting with payload:", payload);

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
            console.log("[KeywordExtractor] Response:", data);

            this.currentKeywords = data.keywords || [];
            return this.currentKeywords;

        } catch (error) {
            console.error("[KeywordExtractor] Error:", error);
            return [];
        }
    }

    /**
     * 显示关键词列表
     * @param {Array<string>} keywords - 关键词数组
     * @param {HTMLElement} targetElement - 目标显示元素（可选，默认使用 this.keywordElement）
     */
    displayKeywordsList(keywords, targetElement = null) {
        const element = targetElement || this.keywordElement;

        if (!element) {
            return;
        }

        if (keywords.length === 0) {
            element.innerHTML = '<p class="placeholder">No keywords detected</p>';
            return;
        }

        // 去重并保持顺序
        const uniqueKeywords = [...new Set(keywords)];

        const html = `
            <div class="keywords-container">
                <div class="keywords-list">
                    ${uniqueKeywords.map(kw => `
                        <span class="keyword-badge" title="Click to see explanation" style="cursor: pointer;" onclick="window.keywordExtractorInstance.showExplanation('${kw.replace(/'/g, "\\'")}')" >
                            <span class="keyword-text">${kw}</span>
                            <button class="keyword-delete-btn" onclick="event.stopPropagation(); window.streamNoteInstance.deleteKeyword('${kw.replace(/'/g, "\\'")}')">×</button>
                        </span>
                    `).join('')}
                </div>
            </div>
        `;

        element.innerHTML = html;
    }

    /**
     * 显示关键词的解释
     * @param {string} keyword - 关键词
     */
    async showExplanation(keyword) {
        const modal = document.getElementById('keywordExplanationModal');
        const titleElement = document.getElementById('keywordExplanationTitle');
        const contentElement = document.getElementById('keywordExplanationContent');

        if (!modal || !titleElement || !contentElement) {
            console.error("[KeywordExtractor] Modal elements not found");
            return;
        }

        // 显示加载状态
        titleElement.textContent = `${keyword}`;
        contentElement.innerHTML = '<p class="placeholder">Loading explanation...</p>';
        modal.style.display = 'flex';

        try {
            // 获取解释语言（从全局 StreamNote 实例）
            const explanationLanguage = window.streamNoteInstance?.keywordExplanationLanguage || "original";

            // 生成缓存 key
            const cacheKey = `${keyword}|${explanationLanguage}`;

            console.log(`[KeywordExtractor] Fetching explanation for "${keyword}" in ${explanationLanguage}`);

            // 检查缓存
            if (this.explanationCache[cacheKey]) {
                console.log(`[KeywordExtractor] Using cached explanation for "${keyword}"`);
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

            const data = await response.json();
            const explanation = data.explanation || "No explanation available";

            console.log(`[KeywordExtractor] Got explanation: ${explanation.substring(0, 50)}...`);

            // 存入缓存
            this.explanationCache[cacheKey] = explanation;

            // 显示解释
            contentElement.innerHTML = `<p>${explanation}</p>`;
        } catch (error) {
            console.error("[KeywordExtractor] Error fetching explanation:", error);
            contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;
        }
    }

    /**
     * 完整流程：提取 → 显示
     * @param {string} text - 输入文本（仅用于提取关键词）
     */
    async processText(text) {
        if (!this.enabled) {
            console.log("[KeywordExtractor] Disabled, skipping");
            return [];
        }

        console.log("[KeywordExtractor] Processing text, length:", text.length);

        const keywords = await this.extractKeywords(text);

        if (keywords.length > 0) {
            // 合并新关键词到收集的关键词集合
            this.allCollectedKeywords = [...new Set([...this.allCollectedKeywords, ...keywords])];
            console.log(`[KeywordExtractor] All collected keywords: ${this.allCollectedKeywords.join(', ')}`);

            this.displayKeywordsList(this.allCollectedKeywords);
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
        console.log("[KeywordExtractor] Enabled:", enabled);
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
        console.log("[KeywordExtractor] Intensity set to:", this.intensity, "(关键词相对比例)");
    }

    /**
     * 重置
     */
    reset() {
        this.currentKeywords = [];
        this.allCollectedKeywords = [];
        if (this.keywordElement) {
            this.keywordElement.innerHTML = '';
        }
        console.log("[KeywordExtractor] Reset");
    }
}

// 导出为全局对象
window.KeywordExtractor = KeywordExtractor;
