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

        // 状态消息回调
        this.onStatusMessage = config.onStatusMessage || (() => { });

        // 当前解释面板显示的上下文的位置信息
        // 用于直接高亮，避免重新搜索
        this.currentContextPositionInfo = null;  // { sourceIndices, container, sourcePanel }
        this.currentContextWord = null;         // 当前显示上下文的词
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
                    <div class="keyword-item-wrapper" data-keyword="${index}" title="${this.escapeHtml(item)}">
                        <div class="keyword-item">
                            <span class="keyword-text" onclick="window.keywordManagerInstance.scrollToKeyword('${escapedItem}')">
                                ${this.escapeHtml(item)}
                            </span>
                            <button class="keyword-explain-btn" onclick="window.keywordManagerInstance.openExplanationForWord('${escapedItem}')" title="View explanation">Explain</button>
                            <button class="keyword-delete-btn" onclick="window.keywordManagerInstance.${deleteHandlerName}('${escapedItem}')" title="Delete">×</button>
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
     * 定位关键词到原文或翻译中
     * @param {string} keyword - 关键词
     */
    scrollToKeyword(keyword) {
        // 确定词语来源
        const sourcePanel = this.wordSourcePanel[keyword] || 'transcript';

        // 调用全局的定位方法
        if (window.streamNoteInstance && window.streamNoteInstance.scrollToWord) {
            window.streamNoteInstance.scrollToWord(keyword, sourcePanel);
        }
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
     * @param {number} contextLength - 前后各取多少字符（默认100用于API）
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
            // 检查词的来源：是否来自翻译
            const sourcePanel = this.wordSourcePanel[keyword];

            if (sourcePanel === 'translation' && this.translationManager) {
                // 从翻译数据中构建
                const translationData = this.translationManager.getTranslationData();
                const sortedKeys = Object.keys(translationData).sort((a, b) => parseInt(a) - parseInt(b));
                searchText = sortedKeys
                    .map(key => translationData[key])
                    .filter(text => text)
                    .join(" ");
            } else {
                // 从转录数据中构建（默认）
                const preciseResults = this.getTranscriptData();
                const sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a) - parseInt(b));
                searchText = sortedKeys
                    .map(key => {
                        const item = preciseResults[key];
                        return item && item.text ? item.text.trim() : "";
                    })
                    .join(" ");
            }
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

        // 检查长度限制：解释最多 100 个字符
        if (word.length > 100) {
            alert("Please select less than 100 characters to explain");
            return;
        }

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

        // 自动展开左侧解释面板
        if (window.streamNoteInstance && window.streamNoteInstance.panelManager) {
            window.streamNoteInstance.panelManager.showExplanationPanel();
        }

        const wordElement = document.getElementById("current-explanation-word");
        const contentElement = document.getElementById("explanation-content");
        const headerDiv = document.querySelector(".explanation-header");
        const regenerateBtn = document.getElementById("regenerate-explanation-btn");
        const contextDiv = document.getElementById("word-context");

        if (!wordElement || !contentElement) return;

        // 更新词语显示
        wordElement.textContent = word;

        // 显示标题容器
        if (headerDiv) headerDiv.classList.remove("hidden");

        // 启用Regenerate按钮
        if (regenerateBtn) regenerateBtn.disabled = false;

        // 检查该词是否已在highlights中，更新按钮状态
        const isHighlighted = this.highlights?.includes(word) || false;
        window.streamNoteInstance?.updateHighlightButtonState(word, isHighlighted);

        // 显示加载状态，先隐藏context
        contentElement.innerHTML = '<p class="placeholder">Loading explanation...</p>';
        if (contextDiv) contextDiv.style.display = 'none';

        // 获取位置信息（使用已保存的，如果没有则检测）
        // 优先使用 highlightPositions 中的信息（在 openExplanationForWord 中保存的精确位置）
        let positionInfo = null;
        if (this.highlightPositions && this.highlightPositions[word]) {
            positionInfo = this.highlightPositions[word];
        } else if (window.streamNoteInstance && window.streamNoteInstance.highlightManager) {
            // 如果没有已保存位置，才进行检测搜索
            const sourcePanel = this.wordSourcePanel[word] || 'transcript';
            positionInfo = window.streamNoteInstance.highlightManager.detectWordPosition(word, sourcePanel);
        }

        // 如果找到位置信息，立即显示临时高亮
        if (positionInfo && window.streamNoteInstance && window.streamNoteInstance.highlightManager) {
            window.streamNoteInstance.highlightManager.showTemporaryHighlight(word, positionInfo);
        }

        // 保存位置信息供后续使用
        this.currentContextPositionInfo = positionInfo;
        this.currentContextWord = word;

        // 获取解释（完成后会显示context）
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
                // 解释加载完成后显示上下文
                this.updateWordContext(keyword);
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

            // 解释加载完成后显示上下文
            this.updateWordContext(keyword);
        } catch (error) {
            console.error("[KeywordManager] Error fetching explanation:", error);
            contentElement.innerHTML = `<p class="error">Failed to load explanation: ${error.message}</p>`;

            // 即使出错也显示上下文
            this.updateWordContext(keyword);
        }
    }

    /**
     * 获取关键词的上下文（用于发送给API）
     * @param {string} keyword - 关键词
     * @returns {string} 上下文
     */
    getContextForKeyword(keyword) {
        // 检查是否有位置信息 - 优先使用位置信息的容器信息
        if (this.highlightPositions && this.highlightPositions[keyword]) {
            const positionInfo = this.highlightPositions[keyword];
            // 如果有container信息，说明这个词来自特定的面板
            if (positionInfo.container) {
                // 位置信息中的container字段会在extractContextByPosition中使用
                // API用途：使用原始的100字符范围
                return this.extractKeywordContext(keyword, "", 100);
            }
        }

        // 如果没有位置信息，检查wordSourcePanel来判断词的来源
        const sourcePanel = this.wordSourcePanel[keyword];
        if (sourcePanel === 'translation') {
            // 如果词来自翻译，需要从翻译数据中搜索
            if (this.translationManager) {
                const translationData = this.translationManager.getTranslationData();
                const sortedKeys = Object.keys(translationData).sort((a, b) => parseInt(a) - parseInt(b));
                const fullTranslation = sortedKeys
                    .map(key => translationData[key])
                    .filter(text => text)
                    .join(" ");

                if (fullTranslation) {
                    // 在翻译文本中搜索
                    const lowerText = fullTranslation.toLowerCase();
                    const lowerKeyword = keyword.toLowerCase();
                    const index = lowerText.indexOf(lowerKeyword);

                    if (index !== -1) {
                        const contextLength = 100;
                        const contextStart = Math.max(0, index - contextLength);
                        const contextEnd = Math.min(fullTranslation.length, index + keyword.length + contextLength);

                        let context = fullTranslation.substring(contextStart, contextEnd);
                        if (contextStart > 0) context = "..." + context;
                        if (contextEnd < fullTranslation.length) context = context + "...";
                        return context;
                    }
                }
            }
        }

        // 默认从转录数据中提取（API用途：使用100字符范围）
        return this.extractKeywordContext(keyword, "", 100);
    }

    /**
     * 高亮文本中的目标词
     * @param {string} text - 要处理的文本
     * @param {string} keyword - 要高亮的关键词
     * @returns {string} 包含高亮HTML的文本
     */
    highlightKeywordInText(text, keyword) {
        if (!text || !keyword) return text;

        // 规范化keyword，确保与context中的格式一致
        let cleanedKeyword = keyword.trim();
        cleanedKeyword = cleanedKeyword.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        cleanedKeyword = cleanedKeyword.replace(/\s+/g, ' ').trim();

        if (!cleanedKeyword) return text;

        // 转义特殊字符
        const escapedKeyword = cleanedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 创建正则表达式，不使用词边界（\b），因为中文文本不支持词边界）
        // 使用全局和不区分大小写的模式
        const regex = new RegExp(escapedKeyword, 'gi');

        // 替换为带有高亮样式的HTML
        const highlighted = text.replace(regex, (match) => {
            return `<span class="highlighted-word">${match}</span>`;
        });

        return highlighted;
    }

    /**
     * 更新词语的上下文显示（使用拼接方式：前50字+词+后50字）
     * @param {string} keyword - 关键词
     */
    updateWordContext(keyword) {
        const contextDiv = document.getElementById("word-context");
        const contextText = document.getElementById("context-text");

        if (!contextDiv || !contextText) return;

        let displayContext = "";

        // 优先使用已记录的currentContextPositionInfo或highlightPositions
        if (this.currentContextPositionInfo && this.currentContextWord === keyword) {
            displayContext = this._buildContextByPosition(
                this.currentContextPositionInfo,
                keyword,
                50  // 前后各50字符
            );
        } else if (this.highlightPositions && this.highlightPositions[keyword]) {
            const positionInfo = this.highlightPositions[keyword];
            displayContext = this._buildContextByPosition(positionInfo, keyword, 50);
        } else {
            // 降级方案：从全文搜索（用较小范围）
            displayContext = this._buildContextBySearch(keyword, 50);
        }

        if (displayContext) {
            contextText.innerHTML = displayContext;
            contextDiv.style.display = 'block';
        } else {
            contextDiv.style.display = 'none';
        }
    }

    /**
     * 基于位置信息构建context（前50字+加粗词+后50字，支持跨段）
     * 始终保留本段的完整内容，从前后段落补充
     * @private
     */
    _buildContextByPosition(positionInfo, keyword, contextLength = 50) {
        if (!positionInfo || !positionInfo.sourceIndices || positionInfo.sourceIndices.length === 0) {
            return "";
        }

        // 根据container确定数据源
        const isTranslationContext = positionInfo.container === 'translation';
        let dataSource = {};

        if (isTranslationContext && this.translationManager) {
            dataSource = this.translationManager.getTranslationData();
        } else {
            dataSource = this.getTranscriptData();
        }

        const sourceIndices = positionInfo.sourceIndices;
        const firstIdx = sourceIndices[0];
        const lastIdx = sourceIndices[sourceIndices.length - 1];

        // 清理keyword以进行匹配
        let cleanedKeyword = keyword.trim();
        cleanedKeyword = cleanedKeyword.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        cleanedKeyword = cleanedKeyword.replace(/\s+/g, ' ').trim();

        // 获取目标段落的文本（始终保留）
        const sourceTexts = sourceIndices.map(idx => {
            if (isTranslationContext) {
                const translatedText = dataSource[idx];
                return translatedText ? translatedText.trim() : "";
            } else {
                const item = dataSource[idx];
                return item ? item.text.trim() : "";
            }
        });

        // 构建本段（目标段落）的虚拟文本
        let targetText = sourceTexts.join(" ");

        // 在本段文本中找到词的位置
        const lowerTargetText = targetText.toLowerCase();
        const lowerKeyword = cleanedKeyword.toLowerCase();
        const matchPos = lowerTargetText.indexOf(lowerKeyword);

        if (matchPos === -1) return "";

        const matchEnd = matchPos + cleanedKeyword.length;

        // 获取全局的第一个和最后一个索引
        const allKeys = Object.keys(dataSource).sort((a, b) => parseInt(a) - parseInt(b));
        const globalFirstIdx = parseInt(allKeys[0]);
        const globalLastIdx = parseInt(allKeys[allKeys.length - 1]);

        // **前context**：从本段向前取50字 + 前面段落补充
        let contextBefore = "";

        // 第一步：从本段开始向前取最多50字
        let beforeInTarget = targetText.substring(Math.max(0, matchPos - contextLength), matchPos);
        contextBefore = beforeInTarget;

        // 第二步：如果前context不足50字，从前面段落补充
        if (contextBefore.length < contextLength && firstIdx > globalFirstIdx) {
            let needChars = contextLength - contextBefore.length;
            let prevIdx = firstIdx - 1;
            let prevTexts = [];
            let prevChars = 0;

            // 从前向后收集前面段落的文本
            while (prevChars < needChars && prevIdx >= globalFirstIdx) {
                let prevText = "";
                if (isTranslationContext) {
                    prevText = dataSource[prevIdx] ? dataSource[prevIdx].trim() : "";
                } else {
                    const item = dataSource[prevIdx];
                    prevText = item ? item.text.trim() : "";
                }

                if (prevText) {
                    prevTexts.unshift(prevText);
                    prevChars += prevText.length;
                }
                prevIdx--;
            }

            // 组合前面的文本，从尾部截取需要的长度（拼接时加空格）
            let allPrevText = prevTexts.join(" ");
            if (allPrevText.length > needChars) {
                contextBefore = allPrevText.substring(allPrevText.length - needChars) + " " + contextBefore;
            } else if (allPrevText.length > 0) {
                contextBefore = allPrevText + " " + contextBefore;
            }
        }

        // **后context**：从本段向后取50字 + 后面段落补充
        let contextAfter = "";

        // 第一步：从词结束向后取最多50字
        let afterInTarget = targetText.substring(matchEnd, Math.min(targetText.length, matchEnd + contextLength));
        contextAfter = afterInTarget;

        // 第二步：如果后context不足50字，从后面段落补充
        if (contextAfter.length < contextLength && lastIdx < globalLastIdx) {
            let needChars = contextLength - contextAfter.length;
            let nextIdx = lastIdx + 1;
            let nextTexts = [];
            let nextChars = 0;

            // 从前向后收集后面段落的文本
            while (nextChars < needChars && nextIdx <= globalLastIdx) {
                let nextText = "";
                if (isTranslationContext) {
                    nextText = dataSource[nextIdx] ? dataSource[nextIdx].trim() : "";
                } else {
                    const item = dataSource[nextIdx];
                    nextText = item ? item.text.trim() : "";
                }

                if (nextText) {
                    nextTexts.push(nextText);
                    nextChars += nextText.length;
                }
                nextIdx++;
            }

            // 组合后面的文本，从头部截取需要的长度（拼接时加空格）
            let allNextText = nextTexts.join(" ");
            if (allNextText.length > needChars) {
                contextAfter = contextAfter + " " + allNextText.substring(0, needChars);
            } else if (allNextText.length > 0) {
                contextAfter = contextAfter + " " + allNextText;
            }
        }

        // 拼接：... + 前文 + <span>词</span> + 后文 + ...
        // 省略号规则：除非在全文头/尾或尾部是句号，否则都加上
        const highlightedKeyword = `<span class="highlighted-word">${cleanedKeyword}</span>`;
        const prefix = (firstIdx > globalFirstIdx) ? "... " : "";
        const suffix = (lastIdx < globalLastIdx) || !contextAfter.endsWith("。") ? " ..." : "";
        return prefix + contextBefore + highlightedKeyword + contextAfter + suffix;
    }

    /**
     * 基于搜索构建context（降级方案，前50字+加粗词+后50字，支持跨段）
     * 始终保留本段的完整内容，从前后段落补充
     * @private
     */
    _buildContextBySearch(keyword, contextLength = 50) {
        let cleanedKeyword = keyword.trim();
        cleanedKeyword = cleanedKeyword.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        cleanedKeyword = cleanedKeyword.replace(/\s+/g, ' ').trim();

        if (!cleanedKeyword) return "";

        // 根据词的来源决定搜索的数据源
        const sourcePanel = this.wordSourcePanel[keyword];
        let dataSource = {};
        let sortedKeys = [];

        if (sourcePanel === 'translation' && this.translationManager) {
            dataSource = this.translationManager.getTranslationData();
            sortedKeys = Object.keys(dataSource).sort((a, b) => parseInt(a) - parseInt(b));
        } else {
            // 从原始转录数据构建
            const preciseResults = this.getTranscriptData();
            dataSource = preciseResults;
            sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a) - parseInt(b));
        }

        // 构建清理后的全文和位置映射
        let fullText = "";
        let segments = []; // [{ text, srcIndex, startPos, endPos }, ...]
        let currentPos = 0;

        sortedKeys.forEach(key => {
            let text = "";
            if (sourcePanel === 'translation' && this.translationManager) {
                text = dataSource[key] ? dataSource[key].trim() : "";
            } else {
                const item = dataSource[key];
                text = item?.text || "";
                text = text.trim();
                text = text.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
                text = text.replace(/\s+/g, ' ').trim();
            }

            if (text) {
                segments.push({
                    text: text,
                    srcIndex: parseInt(key),
                    startPos: currentPos,
                    endPos: currentPos + text.length
                });
                fullText += text + " ";
                currentPos = fullText.length;
            }
        });

        // 在全文中搜索
        const lowerFullText = fullText.toLowerCase();
        const lowerKeyword = cleanedKeyword.toLowerCase();
        const matchPos = lowerFullText.indexOf(lowerKeyword);

        if (matchPos === -1) return "";

        const matchEnd = matchPos + cleanedKeyword.length;

        // 找到包含匹配词的段落（本段）
        let targetSegment = null;
        for (let seg of segments) {
            if (seg.startPos <= matchPos && matchEnd <= seg.endPos + 1) {
                targetSegment = seg;
                break;
            }
        }

        if (!targetSegment) return "";

        // 获取全局的第一个和最后一个索引
        const globalFirstSegment = segments[0];
        const globalLastSegment = segments[segments.length - 1];

        // **前context**：从本段向前取最多50字 + 前面段落的补充
        let contextBefore = "";

        // 第一步：从本段内开始向前取最多50字
        const posInSegment = matchPos - targetSegment.startPos;
        let beforeInSegment = targetSegment.text.substring(Math.max(0, posInSegment - contextLength), posInSegment);
        contextBefore = beforeInSegment;

        // 第二步：如果前context不足50字，从前面段落补充
        if (contextBefore.length < contextLength && targetSegment.srcIndex > globalFirstSegment.srcIndex) {
            let needChars = contextLength - contextBefore.length;
            let prevChars = 0;
            let prevTexts = [];

            // 从本段向前遍历段落
            const targetIdx = segments.indexOf(targetSegment);
            for (let i = targetIdx - 1; i >= 0 && prevChars < needChars; i--) {
                prevTexts.unshift(segments[i].text);
                prevChars += segments[i].text.length;
            }

            // 组合前面的文本，从尾部截取需要的长度（拼接时加空格）
            let allPrevText = prevTexts.join(" ");
            if (allPrevText.length > needChars) {
                contextBefore = allPrevText.substring(allPrevText.length - needChars) + " " + contextBefore;
            } else if (allPrevText.length > 0) {
                contextBefore = allPrevText + " " + contextBefore;
            }
        }

        // **后context**：从本段向后取最多50字 + 后面段落的补充
        let contextAfter = "";

        // 第一步：从词结束向后取最多50字
        const endPosInSegment = posInSegment + cleanedKeyword.length;
        let afterInSegment = targetSegment.text.substring(endPosInSegment, Math.min(targetSegment.text.length, endPosInSegment + contextLength));
        contextAfter = afterInSegment;

        // 第二步：如果后context不足50字，从后面段落补充
        if (contextAfter.length < contextLength && targetSegment.srcIndex < globalLastSegment.srcIndex) {
            let needChars = contextLength - contextAfter.length;
            let nextChars = 0;
            let nextTexts = [];

            // 从本段向后遍历段落
            const targetIdx = segments.indexOf(targetSegment);
            for (let i = targetIdx + 1; i < segments.length && nextChars < needChars; i++) {
                nextTexts.push(segments[i].text);
                nextChars += segments[i].text.length;
            }

            // 组合后面的文本，从头部截取需要的长度（拼接时加空格）
            let allNextText = nextTexts.join(" ");
            if (allNextText.length > needChars) {
                contextAfter = contextAfter + " " + allNextText.substring(0, needChars);
            } else if (allNextText.length > 0) {
                contextAfter = contextAfter + " " + allNextText;
            }
        }

        // 拼接：... + 前文 + <span>词</span> + 后文 + ...
        // 省略号规则：除非在全文头/尾或尾部是句号，否则都加上
        const highlightedKeyword = `<span class="highlighted-word">${cleanedKeyword}</span>`;
        const prefix = (targetSegment.srcIndex > globalFirstSegment.srcIndex) ? "... " : "";
        const suffix = (targetSegment.srcIndex < globalLastSegment.srcIndex) || !contextAfter.endsWith("。") ? " ..." : "";
        return prefix + contextBefore + highlightedKeyword + contextAfter + suffix;
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
