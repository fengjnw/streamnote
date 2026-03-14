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
                ${items.map((item, index) => {
            // Safely escape special characters in onclick attributes
            const escapedItem = item.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
                    <div class="keyword-item-wrapper" data-keyword="${index}">
                        <div class="keyword-item">
                            <span class="keyword-text" onclick="window.keywordManagerInstance.openExplanationForWord('${escapedItem}')"
                                style="cursor: pointer; flex: 1;">
                                ${this.escapeHtml(item)}
                            </span>
                            <button class="keyword-delete-btn" onclick="window.keywordManagerInstance.${deleteHandlerName}('${escapedItem}')">×</button>
                        </div>
                    </div>
                `;
        }).join('')}
            </div>
        `;

        containerElement.innerHTML = html;
    }

    /**
     * Safely escape HTML special characters
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, char => map[char]);
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
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "Select text to highlight and add to this panel");
    }

    /**
     * 显示自动提取的关键词列表
     */
    displayExtracts() {
        const element = document.getElementById("auto-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.extracts)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "Click Extract to generate keywords from your transcription");
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
        // 此方法已弃用，使用 openExplanationForWord 代替
        await this.openExplanationForWord(keyword);
    }

    /**
     * 设置高亮的位置信息（来自HighlightManager）
     * @param {Object} positions - { "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }
     */
    setHighlightPositions(positions) {
        this.highlightPositions = positions || {};
    }

    /**
     * 基于位置信息从preciseResults中提取关键词的上下文
     * @param {Object} positionInfo - 位置信息对象 { sourceIndices: [...] }
     * @param {number} contextLength - 前后各取多少字符
     * @returns {string} 包含上下文的字符串
     */
    extractContextByPosition(positionInfo, contextLength = 100) {
        if (!positionInfo || !positionInfo.sourceIndices || positionInfo.sourceIndices.length === 0) {
            return "";
        }

        // 根据container确定使用转录数据还是翻译数据
        const isTranslationContext = positionInfo.container === 'translation';
        let dataSource = {};

        if (isTranslationContext && this.translationManager) {
            // 使用翻译数据
            dataSource = this.translationManager.getTranslationData();
        } else {
            // 使用原始转录数据
            dataSource = this.getTranscriptData();
        }

        const sourceIndices = positionInfo.sourceIndices;

        // 获取目标段落的文本
        const sourceTexts = sourceIndices.map(idx => {
            if (isTranslationContext) {
                // 翻译数据是纯文本
                const translatedText = dataSource[idx];
                return translatedText ? translatedText.trim() : "";
            } else {
                // 原始数据是object with text property
                const item = dataSource[idx];
                return item ? item.text.trim() : "";
            }
        });

        // 构建包含所有相关段落的文本
        let targetText = sourceTexts.join(" ");

        // 向前获取context：从第一个sourceIndex的前面段落取文本
        let contextBefore = "";
        const firstIdx = sourceIndices[0];
        if (firstIdx > 0) {
            const indices = [];
            for (let i = firstIdx - 1; i >= 0 && indices.length < 2; i--) {
                if (isTranslationContext) {
                    // 翻译数据
                    const translatedText = dataSource[i];
                    if (translatedText) {
                        indices.unshift(translatedText.trim());
                    }
                } else {
                    // 原始数据
                    if (dataSource[i]) {
                        indices.unshift(dataSource[i].text.trim());
                    }
                }
            }
            contextBefore = indices.join(" ");
            if (contextBefore) {
                contextBefore = contextBefore.slice(-contextLength); // 只保留后contextLength个字符
            }
        }

        // 向后获取context：从最后一个sourceIndex的后面段落取文本
        let contextAfter = "";
        const lastIdx = sourceIndices[sourceIndices.length - 1];
        const maxIdx = Object.keys(dataSource).map(k => parseInt(k)).sort((a, b) => b - a)[0];
        if (lastIdx < maxIdx) {
            const indices = [];
            for (let i = lastIdx + 1; i <= maxIdx && indices.length < 2; i++) {
                if (isTranslationContext) {
                    // 翻译数据
                    const translatedText = dataSource[i];
                    if (translatedText) {
                        indices.push(translatedText.trim());
                    }
                } else {
                    // 原始数据
                    if (dataSource[i]) {
                        indices.push(dataSource[i].text.trim());
                    }
                }
            }
            contextAfter = indices.join(" ");
            if (contextAfter) {
                contextAfter = contextAfter.slice(0, contextLength); // 只保留前contextLength个字符
            }
        }

        // 组合最终的context
        let fullContext = "";
        if (contextBefore) fullContext += contextBefore + " ";
        fullContext += targetText;
        if (contextAfter) fullContext += " " + contextAfter;

        return fullContext.trim();
    }

    /**
     * 从当前笔记文本中提取关键词的上下文
     * @param {string} keyword - 关键词
     * @param {string} fullText - 完整笔记文本
     * @param {number} contextLength - 前后各取多少字符（默认100）
     * @returns {string} 包含关键词的上下文
     */
    extractKeywordContext(keyword, fullText, contextLength = 100) {
        if (!keyword) return "";

        // 如果有位置信息（针对用户高亮的词），优先使用位置信息
        if (this.highlightPositions && this.highlightPositions[keyword]) {
            const positionInfo = this.highlightPositions[keyword];
            const contextByPosition = this.extractContextByPosition(positionInfo, contextLength);
            if (contextByPosition) {
                return contextByPosition;
            }
        }

        // 否则，构建全文再搜索
        // 如果fullText为空，尝试从preciseResults中构建
        let searchText = fullText;
        if (!searchText) {
            const preciseResults = this.getTranscriptData();
            const sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a) - parseInt(b));
            searchText = sortedKeys
                .map(key => {
                    const item = preciseResults[key];
                    return item && item.text ? item.text.trim() : "";
                })
                .join(" ");
        }

        if (!searchText) return "";  // 仍然无法获取文本

        // 降级方案：使用搜索方式（对于自动提取的词）
        // 查找关键词在文本中的位置（不区分大小写）
        const lowerText = searchText.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerText.indexOf(lowerKeyword);

        if (index === -1) return "";  // 关键词不在文本中

        // 计算context的起始和结束位置
        const contextStart = Math.max(0, index - contextLength);
        const contextEnd = Math.min(searchText.length, index + keyword.length + contextLength);

        let context = searchText.substring(contextStart, contextEnd);

        // 如果不是从文本开头开始，添加省略号
        if (contextStart > 0) {
            context = "..." + context;
        }

        // 如果不是到文本末尾，添加省略号
        if (contextEnd < searchText.length) {
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
            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || "English";

            // 生成缓存 key
            const cacheKey = `${keyword}|${explanationLanguage}`;

            // 检查缓存
            if (this.explanationCache[cacheKey]) {
                contentElement.innerHTML = `<p>${this.explanationCache[cacheKey]}</p>`;
                return;
            }

            // 获取上下文（用于API）- 使用统一方法避免重复
            const context = this.getContextForKeyword(keyword);

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
     * 重新生成关键词的解释
     * @param {string} keyword - 要重新解释的关键词
     */
    async regenerateExplanation(keyword) {
        // 查找对应的 keyword-explanation 元素
        const allExplanations = document.querySelectorAll('.keyword-explanation');
        let wrapper = null;

        for (const elem of allExplanations) {
            if (elem.getAttribute('data-keyword-text') === keyword) {
                wrapper = elem;
                break;
            }
        }

        if (!wrapper) {
            console.warn(`[KeywordManager] Wrapper not found for keyword: ${keyword}`);
            return;
        }

        const contentElement = wrapper.querySelector('.explanation-content');
        if (!contentElement) return;

        // 显示加载状态
        contentElement.innerHTML = '<p class="placeholder">Regenerating...</p>';

        // 清除缓存，强制重新获取
        const cacheKey = `${keyword}|${window.streamNoteInstance?.explanationLanguage || 'English'}`;
        if (this.extractsCache[cacheKey]) delete this.extractsCache[cacheKey];
        if (this.highlightCache[cacheKey]) delete this.highlightCache[cacheKey];
        if (this.explanationCache[cacheKey]) delete this.explanationCache[cacheKey];

        // 重新加载解释
        await this.fetchAndShowExplanation(keyword, wrapper);
    }

    /**
     * 复制关键词的解释到剪贴板
     * @param {string} keyword - 要复制解释的关键词
     */
    copyExplanation(keyword) {
        // 查找对应的 keyword-explanation 元素
        const allExplanations = document.querySelectorAll('.keyword-explanation');
        let wrapper = null;

        for (const elem of allExplanations) {
            if (elem.getAttribute('data-keyword-text') === keyword) {
                wrapper = elem;
                break;
            }
        }

        if (!wrapper) return;

        const contentElement = wrapper.querySelector('.explanation-content');
        if (!contentElement) return;

        // 获取解释文本（去除HTML标签）
        const text = contentElement.innerText || contentElement.textContent;

        if (!text || text.includes('Loading') || text.includes('placeholder')) {
            alert('Explanation not available yet');
            return;
        }

        // 复制到剪贴板
        navigator.clipboard.writeText(text).then(() => {
            // 显示成功提示
            const toolbar = wrapper.querySelector('.explanation-toolbar');
            if (toolbar) {
                const copyBtn = toolbar.querySelector('[onclick*="copyExplanation"]');
                if (copyBtn) {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 2000);
                }
            }
        }).catch(err => {
            console.error('[KeywordManager] Copy failed:', err);
            alert('Failed to copy explanation');
        });
    }

    /**
     * 显示解释列表（仅用于兼容，无实际内容）
     */
    displayExplanations() {
        // 新版本中，解释面板是焦点视图，不显示列表
        // 此方法保留以兼容现存代码
    }

    /**
     * 为指定的词打开解释面板（焦点视图）
     * @param {string} word - 要解释的词
     */
    /**
     * 打开解释面板（支持自定义位置信息和源面板）
     * @param {string} word - 要解释的词
     * @param {Object} positionInfo - 可选的位置信息 { sourceIndices: [...] }
     * @param {string} sourcePanel - 词语的来源面板 ('transcript' 或 'translation')，默认从记录中读取或使用 'transcript'
     */
    async openExplanationForWord(word, positionInfo = null, sourcePanel = null) {
        word = word.trim();
        if (!word) return;

        // 如果没有提供sourcePanel，尝试从记录中读取
        if (!sourcePanel) {
            sourcePanel = this.wordSourcePanel[word] || 'transcript';
        } else {
            // 更新记录
            this.wordSourcePanel[word] = sourcePanel;
        }

        // 如果提供了位置信息，临时保存（用于这次查询）
        if (positionInfo) {
            this.highlightPositions[word] = positionInfo;
        }

        // 添加到解释历史
        if (!this.explanations.includes(word)) {
            this.explanations.unshift(word);
            if (this.explanations.length > 20) {
                this.explanations = this.explanations.slice(0, 20);
            }
        } else {
            // 已存在则移到最前
            this.explanations = this.explanations.filter(t => t !== word);
            this.explanations.unshift(word);
        }

        // 显示解释面板
        const historyContent = document.getElementById("historyContent");
        if (this.panelManager && historyContent) {
            this.panelManager.showSidePanelContent(historyContent, "Explanation");
        }

        // 自动跳转到指定面板中的词位置
        if (window.streamNoteInstance && window.streamNoteInstance.scrollToWord) {
            // 延迟跳转以确保面板已显示
            setTimeout(() => {
                window.streamNoteInstance.scrollToWord(word, sourcePanel);
            }, 300);
        }

        // 更新焦点视图内容
        setTimeout(() => {
            this.displayExplanationFocusView(word);
        }, 350);

        // 保存到 session
        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    /**
     * 显示焦点式解释面板
     * @param {string} word - 要显示的词
     */
    async displayExplanationFocusView(word) {
        const focusView = document.getElementById("explanation-focus-view");
        if (!focusView) return;

        const wordElement = document.getElementById("current-explanation-word");
        const contentElement = document.getElementById("explanation-content");
        const positionElement = document.getElementById("explanation-position");
        const previousBtn = document.getElementById("previous-word-btn");
        const nextBtn = document.getElementById("next-word-btn");

        if (!wordElement || !contentElement) return;

        // 更新词语显示
        wordElement.textContent = word;

        // 更新位置指示器
        const currentIndex = this.explanations.indexOf(word);
        positionElement.textContent = `${currentIndex + 1} / ${this.explanations.length}`;

        // 更新导航按钮的禁用状态
        if (previousBtn) {
            previousBtn.disabled = currentIndex <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = currentIndex >= this.explanations.length - 1;
        }

        // 显示加载状态
        contentElement.innerHTML = '<p class="placeholder">Loading explanation...</p>';

        // 立即显示上下文（用于用户快速预览）
        this.updateWordContext(word);

        // 获取解释（会同时更新上下文）
        await this.fetchAndShowExplanationForFocusView(word, contentElement);
    }

    /**
     * 获取并显示关键词的解释（焦点视图版本）
     * @param {string} keyword - 关键词
     * @param {HTMLElement} contentElement - 显示容器
     */
    async fetchAndShowExplanationForFocusView(keyword, contentElement) {
        try {
            const explanationLanguage = window.streamNoteInstance?.explanationLanguage || "English";
            const cacheKey = `${keyword}|${explanationLanguage}`;

            // 检查缓存
            if (this.explanationCache[cacheKey]) {
                contentElement.innerHTML = `<p>${this.explanationCache[cacheKey]}</p>`;
                // 上下文已在displayExplanationFocusView中显示
                return;
            }

            // 获取上下文（用于API）- 使用统一方法
            const context = this.getContextForKeyword(keyword);

            const response = await fetch(this.explanationApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    keyword: keyword,
                    language: explanationLanguage,
                    context: context
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let explanation = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    explanation += chunk;

                    if (explanation) {
                        contentElement.innerHTML = `<p>${explanation}</p>`;
                    }
                }
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
            contentElement.innerHTML = `<p>${explanation}</p>`;
        } catch (error) {
            console.error("[KeywordManager] Error fetching explanation:", error);
            contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;
        }
    }

    /**
     * 获取关键词的上下文（同时用于显示和API发送）
     * @param {string} keyword - 关键词
     * @returns {string} 上下文
     */
    getContextForKeyword(keyword) {
        // 直接调用extractKeywordContext，让它自动从preciseResults中构建文本
        return this.extractKeywordContext(keyword, "", 100);
    }

    /**
     * 更新词语的上下文显示
     * @param {string} keyword - 关键词
     */
    updateWordContext(keyword) {
        const contextDiv = document.getElementById("word-context");
        const contextText = document.getElementById("context-text");

        if (!contextDiv || !contextText) return;

        const context = this.getContextForKeyword(keyword);

        if (context) {
            contextText.textContent = context;
            contextDiv.style.display = 'block';
        } else {
            contextDiv.style.display = 'none';
        }
    }

    /**
     * 导航到下一个词的解释
     */
    goToNextExplanation() {
        const currentWordEl = document.getElementById("current-explanation-word");
        if (!currentWordEl) return;

        const currentWord = currentWordEl.textContent;
        const currentIndex = this.explanations.indexOf(currentWord);

        if (currentIndex >= 0 && currentIndex < this.explanations.length - 1) {
            const nextWord = this.explanations[currentIndex + 1];
            this.displayExplanationFocusView(nextWord);
        }
    }

    /**
     * 导航到上一个词的解释
     */
    goToPreviousExplanation() {
        const currentWordEl = document.getElementById("current-explanation-word");
        if (!currentWordEl) return;

        const currentWord = currentWordEl.textContent;
        const currentIndex = this.explanations.indexOf(currentWord);

        if (currentIndex > 0) {
            const previousWord = this.explanations[currentIndex - 1];
            this.displayExplanationFocusView(previousWord);
        }
    }

    /**
     * 重新生成当前显示词的解释
     */
    async regenerateCurrentExplanation() {
        const currentWordEl = document.getElementById("current-explanation-word");
        const contentElement = document.getElementById("explanation-content");

        if (!currentWordEl || !contentElement) return;

        const word = currentWordEl.textContent;
        const explanationLanguage = window.streamNoteInstance?.explanationLanguage || "English";
        const cacheKey = `${word}|${explanationLanguage}`;

        // 清除缓存
        delete this.explanationCache[cacheKey];

        contentElement.innerHTML = '<p class="placeholder">Regenerating explanation...</p>';
        await this.fetchAndShowExplanationForFocusView(word, contentElement);
    }

    /**
     * 复制当前显示的解释
     */
    copyCurrentExplanation() {
        const contentElement = document.getElementById("explanation-content");
        if (!contentElement) return;

        const text = contentElement.innerText;
        navigator.clipboard.writeText(text).then(() => {
            // 显示成功提示
            const originalContent = contentElement.innerHTML;
            contentElement.innerHTML = '<p style="color: green;">✓ Copied!</p>';
            setTimeout(() => {
                contentElement.innerHTML = originalContent;
            }, 1500);
        }).catch(err => {
            console.error('[KeywordManager] Copy failed:', err);
            alert('Failed to copy explanation');
        });
    }

    /**
     * 恢复展开状态 - 已弃用（兼容旧代码）
     */
    restoreExpandedStates() {
        // 新版本不需要此方法
    }

    /**
     * 显示解释面板 - 已弃用（使用 openExplanationForWord 代替）
     * @param {string} term - 要解释的词条
     */
    showExplanationPanel(term) {
        // 兼容旧代码，直接调用新方法
        this.openExplanationForWord(term);
    }

    /**
     * 刷新所有已展开的解释（用新语言重新生成）
     */
    refreshExpandedExplanations() {
        // 刷新当前显示的词
        this.regenerateCurrentExplanation();
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
