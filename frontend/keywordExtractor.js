/**
 * 关键词提取器 - 前端模块
 * 负责与后端通信、高亮关键词、显示关键词
 */

class KeywordExtractor {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || "http://localhost:5000/api/extract-keywords";
        this.transcriptElement = config.transcriptElement || document.getElementById("transcript");
        this.keywordElement = config.keywordElement || document.getElementById("keywords-display");

        this.enabled = true;  // 是否启用关键词提取
        this.intensity = 5;   // 强度等级 (1-10)，表示关键词相对比例

        this.currentKeywords = [];
        this.allCollectedKeywords = [];  // 保存所有收集到的关键词
        this.highlightedSpans = [];

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
     * 高亮文本中的关键词
     * @param {string} text - 要处理的文本
     * @param {HTMLElement} element - 要修改的DOM元素
     * @param {Array<string>} keywords - 要高亮的关键词
     */
    highlightKeywords(text, element, keywords) {
        if (!element || keywords.length === 0) {
            return;
        }

        // 清理之前的高亮
        this.clearHighlights(element);

        try {
            // 创建正则表达式，匹配整个单词
            const patterns = keywords.map(kw =>
                kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
            const regex = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi');

            // 替换内容
            let newHTML = text;
            newHTML = newHTML.replace(regex, '<span class="keyword" data-keyword="$1">$1</span>');

            element.innerHTML = newHTML;

            // 记录高亮的span元素供清理使用
            this.highlightedSpans = element.querySelectorAll('.keyword');

            console.log(`[KeywordExtractor] Highlighted ${this.highlightedSpans.length} keywords`);

            // 为高亮的关键词添加事件监听（可选：显示定义）
            this.attachKeywordListeners();

        } catch (error) {
            console.error("[KeywordExtractor] Error highlighting keywords:", error);
        }
    }

    /**
     * 清理高亮
     * @param {HTMLElement} element - 要清理的DOM元素
     */
    clearHighlights(element) {
        if (!element) return;

        // 移除span标签但保留文本
        element.querySelectorAll('.keyword').forEach(span => {
            const text = span.textContent;
            span.replaceWith(text);
        });

        this.highlightedSpans = [];
    }

    /**
     * 为关键词添加事件监听（如悬停显示定义）
     */
    attachKeywordListeners() {
        this.highlightedSpans.forEach(span => {
            span.addEventListener('mouseenter', (e) => {
                this.showKeywordInfo(e.target);
            });

            span.addEventListener('mouseleave', () => {
                this.hideKeywordInfo();
            });
        });
    }

    /**
     * 显示关键词信息提示
     * @param {HTMLElement} element - 关键词元素
     */
    showKeywordInfo(element) {
        const keyword = element.textContent;

        // 创建工具提示
        let tooltip = element.querySelector('.keyword-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'keyword-tooltip';
            tooltip.textContent = `Key Term: ${keyword}`;
            element.appendChild(tooltip);
        }

        tooltip.style.display = 'block';
    }

    /**
     * 隐藏关键词信息提示
     */
    hideKeywordInfo() {
        const tooltips = document.querySelectorAll('.keyword-tooltip');
        tooltips.forEach(tooltip => {
            tooltip.style.display = 'none';
        });
    }

    /**
     * 显示关键词列表
     * @param {Array<string>} keywords - 关键词数组
     */
    displayKeywordsList(keywords) {
        if (!this.keywordElement) {
            return;
        }

        if (keywords.length === 0) {
            this.keywordElement.innerHTML = '<p style="color: #999;">No keywords detected</p>';
            return;
        }

        // 去重并保持顺序
        const uniqueKeywords = [...new Set(keywords)];

        const html = `
            <div class="keywords-container">
                <h3>Key Terms (${uniqueKeywords.length})</h3>
                <div class="keywords-list">
                    ${uniqueKeywords.map(kw => `
                        <span class="keyword-badge" title="${kw}">${kw}</span>
                    `).join('')}
                </div>
            </div>
        `;

        this.keywordElement.innerHTML = html;
    }

    /**
     * 完整流程：提取 → 高亮 → 显示
     * @param {string} text - 输入文本（仅用于提取关键词）
     * @param {HTMLElement} targetElement - 要进行高亮的元素（保留原有结构）
     */
    async processText(text, targetElement = null) {
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

            // 如果提供了目标元素，在其中进行高亮（保留原有HTML结构）
            if (targetElement) {
                this.highlightKeywordsInElement(targetElement, this.allCollectedKeywords);
            } else {
                // 否则用老方法（仅用于文本，会破坏HTML）
                this.highlightKeywords(text, this.transcriptElement, keywords);
            }

            this.displayKeywordsList(this.allCollectedKeywords);
        }

        return keywords;
    }

    /**
     * 重新高亮整个元素（用于DOM更新后重新应用高亮）
     */
    reHighlightElement(targetElement = null) {
        if (this.allCollectedKeywords.length === 0) {
            return;
        }

        const element = targetElement || this.transcriptElement;
        if (!element) return;

        console.log("[KeywordExtractor] Re-highlighting with", this.allCollectedKeywords.length, "keywords");
        this.highlightKeywordsInElement(element, this.allCollectedKeywords);
    }

    /**
     * 在DOM元素中高亮关键词，保留原有HTML结构
     * @param {HTMLElement} element - 要处理的元素
     * @param {Array<string>} keywords - 关键词数组
     */
    highlightKeywordsInElement(element, keywords) {
        if (!element || keywords.length === 0) {
            return;
        }

        try {
            // 按长度排序关键词（长的在前），确保多词短语优先匹配
            const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

            // 创建关键词正则表达式
            // 为了处理多词短语，我们分别处理单词和多词短语：
            // 1. 单词关键词：使用 \b 词边界确保完整单词匹配
            // 2. 多词关键词：不使用词边界，使用空格匹配
            const singleWordPatterns = [];
            const multiWordPatterns = [];

            sortedKeywords.forEach(kw => {
                const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (kw.split(/\s+/).length === 1) {
                    // 单词：使用词边界确保完整单词匹配
                    singleWordPatterns.push(`\\b${escaped}\\b`);
                } else {
                    // 多词短语：不使用词边界，使用空格
                    multiWordPatterns.push(escaped);
                }
            });

            // 重要：多词短语应该优先匹配（在单词之前）
            const allPatterns = [...multiWordPatterns, ...singleWordPatterns];

            console.log("[KeywordExtractor] Patterns to match:", allPatterns.slice(0, 5), allPatterns.length > 5 ? `... (${allPatterns.length} total)` : '');

            // 遍历所有文本节点，进行高亮
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const nodesToProcess = [];
            let node;
            while (node = walker.nextNode()) {
                // 检查至少有一个 pattern 能匹配
                for (const pattern of allPatterns) {
                    const patternRegex = new RegExp(`(${pattern})`, 'i');
                    if (patternRegex.test(node.textContent)) {
                        nodesToProcess.push(node);
                        break;
                    }
                }
            }

            console.log("[KeywordExtractor] Nodes to process:", nodesToProcess.length);

            // 处理收集到的节点
            let highlightCount = 0;
            nodesToProcess.forEach(textNode => {
                const span = document.createElement('span');
                let html = textNode.textContent;

                // 使用一个合并的正则表达式，一次性替换所有关键词（避免重复）
                // 重要：必须一次性替换，不能循环替换，否则会重复高亮
                // 关键词已按长度排序，多词短语优先匹配
                const regex = new RegExp(`(${allPatterns.join('|')})`, 'gi');
                html = html.replace(regex, '<span class="keyword" data-keyword="$1">$1</span>');

                // 计算高亮了多少个词
                const highlightMatches = html.match(/<span class="keyword"/g) || [];
                highlightCount += highlightMatches.length;

                span.innerHTML = html;
                textNode.parentNode.replaceChild(span, textNode);
            });

            console.log(`[KeywordExtractor] Highlighted ${highlightCount} keywords in element`);
            this.attachKeywordListeners();

        } catch (error) {
            console.error("[KeywordExtractor] Error highlighting keywords in element:", error);
        }
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
            this.clearHighlights(this.transcriptElement);
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
        this.clearHighlights(this.transcriptElement);
        if (this.keywordElement) {
            this.keywordElement.innerHTML = '';
        }
        console.log("[KeywordExtractor] Reset");
    }
}

// 导出为全局对象
window.KeywordExtractor = KeywordExtractor;
