/**
 * 高亮管理器 - 前端模块
 * 负责文本高亮、显示和管理
 */

class HighlightManager {
    constructor(config = {}) {
        this.keywordManager = config.keywordManager || null;
        this.translationManager = config.translationManager || null;
        this.recordingManager = config.recordingManager || null;
        this.sessionManager = config.sessionManager || null;

        // 回调函数
        this.onStatusMessage = config.onStatusMessage || (() => { });
        this.getTranscriptData = config.getTranscriptData || (() => ({}));

        // 高亮ID映射
        this.highlightIdMap = config.highlightIdMap || {};

        // 高亮位置信息映射：{ "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }
        // 用于精确提取上下文，而不是重新搜索
        this.highlightPositions = config.highlightPositions || {};

        // 临时高亮列表：用户在解释面板打开时显示的临时高亮
        // 结构：{ "word": { highlightId, positionInfo } }
        // 只有用户点"Add Highlight"才会移到永久highlights列表
        this.temporaryHighlights = {};

        // 当前临时高亮的词
        this.currentTemporaryWord = null;
    }

    normalizeHighlightText(text) {
        if (!text) return "";
        let cleanedText = text.trim();
        cleanedText = cleanedText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
        return cleanedText;
    }

    generateHighlightId(prefix = "hl") {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    persistHighlightState() {
        this.keywordManager.updateAllKeywordDisplays();
        this.sessionManager.updateCurrentHighlights(this.keywordManager.highlights);
        this.sessionManager.updateCurrentKeywords(this.keywordManager.extracts);

        if (this.sessionManager) {
            this.sessionManager.updateHighlightPositions(this.highlightPositions);
        }
    }

    removeHighlightMarkupById(highlightId) {
        if (!highlightId) return;

        const transcriptDiv = document.getElementById("transcript");
        if (transcriptDiv) {
            const highlights = transcriptDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(transcriptDiv);
        }

        const translationDiv = document.getElementById("translation");
        if (translationDiv) {
            const highlights = translationDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(translationDiv);
        }
    }

    /**
     * 添加选中的文本作为高亮
     */
    addSelectedTextAsHighlight(selectedText) {
        if (!selectedText || !this.keywordManager) return;

        const highlightText = this.normalizeHighlightText(selectedText);

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        // 检查是否已存在（只检查highlights列表，不检查extracts）
        // 高亮和自动提取的关键词应该是独立的命名空间
        if (this.keywordManager.highlights.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        // 生成唯一的高亮ID
        const highlightId = this.generateHighlightId();

        // 添加到高亮内容
        this.keywordManager.highlights.push(highlightText);

        // 存储高亮ID映射（用于后续删除）
        this.highlightIdMap[highlightText] = highlightId;

        // 在原文中进行高亮显示
        this.highlightTextInTranscript(highlightText, highlightId);

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        // 如果解释面板打开了同一个词，更新高亮按钮状态
        this.updateExplanationPanelHighlightButton(highlightText);

        return highlightText;
    }

    /**
     * 基于选区Range直接高亮文本
     * @param {string} selectedText - 选中的原始文本
     * @param {Range} range - DOM Range对象
     */
    addSelectedTextAsHighlightWithRange(selectedText, range) {
        if (!selectedText || !range || !this.keywordManager) return;

        const highlightText = this.normalizeHighlightText(selectedText);

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        // 检查是否已存在（只检查highlights列表，不检查extracts）
        // 高亮和自动提取的关键词应该是独立的命名空间
        if (this.keywordManager.highlights.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        // 生成唯一的高亮ID
        const highlightId = this.generateHighlightId();

        // 添加到列表
        this.keywordManager.highlights.push(highlightText);

        // 存储高亮ID映射
        this.highlightIdMap[highlightText] = highlightId;

        // 从Range中直接提取位置信息（精确）
        const positionInfo = this.extractPositionFromRange(range);
        if (positionInfo) {
            this.highlightPositions[highlightText] = positionInfo;
            // 同时更新keywordManager中的highlightPositions
            if (this.keywordManager && this.keywordManager.setHighlightPositions) {
                this.keywordManager.setHighlightPositions(this.highlightPositions);
            }
        }

        // 直接对Range的内容进行高亮（仅在原文）
        this.highlightRangeDirectly(range, highlightId);

        // 清除用户的选区（应用完高亮后）
        window.getSelection().removeAllRanges();

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        // 如果解释面板打开了同一个词，更新高亮按钮状态
        this.updateExplanationPanelHighlightButton(highlightText);

        return highlightText;
    }

    /**
     * 从上下文位置信息添加高亮（用于解释面板）
     * 直接使用记录的position信息，避免重新搜索
     * @param {string} highlightText - 高亮文本
     * @param {Object} positionInfo - 位置信息 { sourceIndices, container, sourcePanel }
     * @returns {boolean} 是否成功添加高亮
     */
    addHighlightFromContextPosition(highlightText, positionInfo) {
        if (!highlightText || !positionInfo || !positionInfo.sourceIndices) {
            this.onStatusMessage("Cannot highlight: invalid position info", 1500);
            return false;
        }

        const cleanedText = this.normalizeHighlightText(highlightText);

        if (!cleanedText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return false;
        }

        // 检查是否已存在
        if (this.keywordManager.highlights.includes(cleanedText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return false;
        }

        // 生成唯一的高亮ID
        const highlightId = this.generateHighlightId();

        // 添加到高亮列表
        this.keywordManager.highlights.push(cleanedText);

        // 存储高亮ID映射
        this.highlightIdMap[cleanedText] = highlightId;

        // 保存位置信息（来自源的准确位置）
        this.highlightPositions[cleanedText] = {
            sourceIndices: positionInfo.sourceIndices,
            container: positionInfo.container || 'transcript'
        };

        // 同时更新keywordManager中的highlightPositions
        if (this.keywordManager && this.keywordManager.setHighlightPositions) {
            this.keywordManager.setHighlightPositions(this.highlightPositions);
        }

        // 在原文和翻译中进行高亮显示
        // 如果positionInfo中有container信息，优先在该面板中高亮
        const container = positionInfo.container || 'transcript';

        if (container === 'translation') {
            this.highlightTextInTranslation(cleanedText, highlightId);
        } else {
            this.highlightTextInTranscript(cleanedText, highlightId);
        }

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${cleanedText}"`, 1500);

        // 如果解释面板打开了同一个词，更新高亮按钮状态
        this.updateExplanationPanelHighlightButton(cleanedText);

        return true;
    }

    /**
     * 更新解释面板上的高亮按钮状态
     * 检查当前打开的解释词是否与新添加的高亮词相同，如果相同则更新按钮
     * @param {string} highlightedWord - 刚添加的高亮词
     */
    updateExplanationPanelHighlightButton(highlightedWord) {
        // 获取当前打开的解释词
        const currentWordEl = document.getElementById("current-explanation-word");
        if (!currentWordEl) return;

        const currentWord = currentWordEl.textContent?.trim();
        if (!currentWord) return;

        // 检查是否是同一个词（不区分大小写比较）
        if (currentWord.toLowerCase() === highlightedWord.toLowerCase()) {
            // 调用全局的updateHighlightButtonState方法来更新按钮状态
            if (window.streamNoteInstance && window.streamNoteInstance.updateHighlightButtonState) {
                window.streamNoteInstance.updateHighlightButtonState(highlightedWord, true);
            }
        }
    }

    /**
     * 直接对DOM Range进行高亮，不需要搜索
     * @param {Range} range - DOM Range对象
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightRangeDirectly(range, highlightId) {
        if (!range || !highlightId) return;

        // 获取 range 的 common ancestor
        const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode
            : range.commonAncestorContainer;

        // 收集 range 内的所有 text nodes
        const rangeNodes = [];
        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);

            // 检查这个 node 是否与 range 有交集
            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > -1 &&
                range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 1) {
                rangeNodes.push(node);
            }
        }

        // 对每个在 range 内的 text node 进行高亮
        rangeNodes.forEach((node) => {
            // 计算这个 node 在 range 内的起止位置
            let startOffset = 0;
            let endOffset = node.textContent.length;

            // 如果是起始节点，从 startOffset 开始
            if (node === range.startContainer) {
                startOffset = range.startOffset;
            }

            // 如果是结束节点，到 endOffset 结束
            if (node === range.endContainer) {
                endOffset = range.endOffset;
            }

            // 进行高亮
            if (startOffset < endOffset) {
                this._highlightNodePortion(node, startOffset, endOffset, highlightId);
            }
        });
    }

    /**
     * 公共方法：从Range中提取位置信息
     * @param {Range} range - DOM Range对象
     * @returns {Object} 位置信息 { sourceIndices: [...] } 或 null
     */
    extractPositionFromRangePublic(range) {
        return this.extractPositionFromRange(range);
    }

    /**
     * 从Range对象中提取精确的位置信息（基于DOM中的data-index属性）
     * 支持 #transcript 和 #translation 两种容器
     * @param {Range} range - DOM Range对象
     * @param {string} containerSelector - 可选的容器选择器（"#transcript" 或 "#translation"，默认自动识别）
     * @returns {Object} 位置信息 { sourceIndices: [...] }，如果无法提取则返回null
     */
    extractPositionFromRange(range, containerSelector = null) {
        if (!range) return null;

        // 如果未指定容器，尝试自动识别
        let container = null;
        if (containerSelector) {
            container = document.querySelector(containerSelector);
        } else {
            // 根据Range的位置自动识别
            const startContainer = range.startContainer;
            const endContainer = range.endContainer;

            // 寻找最近的transcript或translation父元素
            let node = startContainer;
            while (node && node.nodeType !== Node.DOCUMENT_NODE) {
                if (node.id === 'transcript') {
                    container = node;
                    break;
                }
                if (node.id === 'translation') {
                    container = node;
                    break;
                }
                node = node.parentNode;
            }

            // 如果通过startContainer找不到，尝试endContainer
            if (!container) {
                node = endContainer;
                while (node && node.nodeType !== Node.DOCUMENT_NODE) {
                    if (node.id === 'transcript') {
                        container = node;
                        break;
                    }
                    if (node.id === 'translation') {
                        container = node;
                        break;
                    }
                    node = node.parentNode;
                }
            }
        }

        // 如果仍未找到容器，默认使用transcript
        if (!container) {
            container = document.getElementById("transcript");
        }

        if (!container) return null;

        const sourceIndices = new Set();

        // 获取容器中所有的段落
        const paragraphs = container.querySelectorAll('p[data-index]');

        // 检查每个段落是否与range有交集
        paragraphs.forEach(para => {
            const paraRange = document.createRange();
            paraRange.selectNode(para);

            // 检查这个paragraph是否与range有交集
            // START_TO_END >= 0 意味着range的结束在para的开始之后
            // END_TO_START <= 0 意味着range的开始在para的结束之前
            if (range.compareBoundaryPoints(Range.START_TO_END, paraRange) >= 0 &&
                range.compareBoundaryPoints(Range.END_TO_START, paraRange) <= 0) {

                const dataIndex = para.getAttribute('data-index');
                if (dataIndex !== null) {
                    sourceIndices.add(parseInt(dataIndex));
                }
            }
        });

        if (sourceIndices.size === 0) return null;

        return {
            sourceIndices: Array.from(sourceIndices).sort((a, b) => a - b),
            container: container.id  // 标记是 'transcript' 还是 'translation'
        };
    }

    /**
     * 在原文中高亮显示指定的文本（支持跨段）
     * @param {string} text - 要高亮的文本
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightTextInTranscript(text, highlightId) {
        if (!text || !highlightId) return;

        const transcriptDiv = document.getElementById("transcript");
        if (!transcriptDiv) return;

        // 使用highlightPositions信息（如果存在）更精确地定位高亮
        // highlightPositions保存了高亮涉及的段落索引(sourceIndices)
        const positionInfo = this.highlightPositions[text];

        if (positionInfo && positionInfo.sourceIndices) {
            // 基于已知的段落索引进行高亮（更精确）
            this._highlightInTranscriptByIndices(transcriptDiv, text, positionInfo.sourceIndices, highlightId);
        } else {
            // 降级到虚拟全文搜索方法（需要清理文本以匹配）
            this._highlightInTranscriptBySearch(transcriptDiv, text, highlightId);
        }
    }

    /**
     * 基于段落索引在原文中进行高亮（精确方法）
     * @private
     */
    _highlightInTranscriptByIndices(transcriptDiv, text, sourceIndices, highlightId) {
        const preciseResults = this.getTranscriptData();

        // 为每个涉及的段落构建虚拟全文
        const sortedIndices = sourceIndices.sort((a, b) => a - b);
        const sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a) - parseInt(b));

        // 收集这些段落的源文本
        const segmentTexts = sortedIndices.map(idx => {
            const sourceText = preciseResults[sortedKeys[idx]]?.text || "";
            return sourceText.trim();
        });

        // 构建虚拟全文（用于查找）
        const virtualText = segmentTexts.join(" ");

        // 在虚拟全文中查找
        const lowerVirtualText = virtualText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return; // 未找到

        // 建立位置映射
        const textPositionMap = [];
        let currentPos = 0;
        segmentTexts.forEach((segmentText, mapIdx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + segmentText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: sortedIndices[mapIdx],
                segmentText
            });
            currentPos = endInVirtual + 1; // +1 for separator
        });

        // 找出涉及的段落
        const matchEnd = matchPos + text.length;
        const affectedSegments = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSegment = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSegment = Math.min(mapping.segmentText.length, matchEnd - mapping.startInVirtual);

                affectedSegments.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSegment,
                    endInSegment
                });
            }
        });

        // 对每个涉及的段落进行高亮
        affectedSegments.forEach(segment => {
            const key = sortedKeys[segment.sourceIndex];
            const paragraph = transcriptDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            // 使用highlightRangeDirectly的逻辑来处理跨node的高亮
            const range = this._createRangeInParagraph(paragraph, segment.startInSegment, segment.endInSegment);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * 基于文本搜索在原文中进行高亮（降级方法）
     * @private
     */
    _highlightInTranscriptBySearch(transcriptDiv, text, highlightId) {
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        // 获取每个段落的源文本，清理以匹配搜索词
        const sourceTexts = sortedKeys.map(key => {
            let sourceText = preciseResults[key]?.text || "";
            // 清理文本以匹配detectWordPosition和addHighlightFromContextPosition中的清理方式
            sourceText = sourceText.trim();
            sourceText = sourceText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
            sourceText = sourceText.replace(/\s+/g, ' ').trim();
            return sourceText;
        });

        // 构建虚拟全文
        let virtualFullText = sourceTexts.join(" ");

        // 建立位置映射
        const textPositionMap = [];
        let currentPos = 0;
        sourceTexts.forEach((sourceText, idx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + sourceText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: idx,
                sourceText
            });
            currentPos = endInVirtual + 1;
        });

        // 在虚拟全文中搜索
        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const matchEnd = matchPos + text.length;

        // 根据虚拟位置找到涉及的源段落
        const affectedSources = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSource = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSource = Math.min(mapping.sourceText.length, matchEnd - mapping.startInVirtual);

                affectedSources.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSource,
                    endInSource
                });
            }
        });

        // 在DOM中找到这些段落，并进行高亮
        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = transcriptDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            // 获取段落中的Range并进行高亮
            const range = this._createRangeInParagraph(paragraph, source.startInSource, source.endInSource);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * 在翻译区高亮显示指定的文本（支持跨段）
     * @param {string} text - 要高亮的文本
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightTextInTranslation(text, highlightId) {
        if (!text || !highlightId) return;

        const translationDiv = document.getElementById("translation");
        if (!translationDiv) return;

        // 使用highlightPositions信息（如果存在）更精确地定位高亮
        // highlightPositions保存了高亮涉及的段落索引(sourceIndices)
        const positionInfo = this.highlightPositions[text];

        if (positionInfo && positionInfo.sourceIndices) {
            // 基于已知的段落索引进行高亮（更精确）
            this._highlightInTranslationByIndices(translationDiv, text, positionInfo.sourceIndices, highlightId);
        } else {
            // 降级到虚拟全文搜索方法
            this._highlightInTranslationBySearch(translationDiv, text, highlightId);
        }
    }

    /**
     * 基于段落索引在翻译中进行高亮（精确方法）
     * @private
     */
    _highlightInTranslationByIndices(translationDiv, text, sourceIndices, highlightId) {
        const preciseResults = this.getTranscriptData();
        const translationData = this.translationManager.getTranslationData();

        // 为每个涉及的段落构建虚拟全文
        const sortedIndices = sourceIndices.sort((a, b) => a - b);

        // 收集这些段落的翻译文本
        const segmentTexts = sortedIndices.map(idx => {
            const translation = translationData[idx];
            return translation ? translation.trim() : "";
        });

        // 构建虚拟全文（用于查找）
        const virtualText = segmentTexts.join(" ");

        // 在虚拟全文中查找
        const lowerVirtualText = virtualText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return; // 未找到

        // 建立位置映射
        const textPositionMap = [];
        let currentPos = 0;
        segmentTexts.forEach((segmentText, mapIdx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + segmentText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: sortedIndices[mapIdx],
                segmentText
            });
            currentPos = endInVirtual + 1; // +1 for separator
        });

        // 找出涉及的段落
        const matchEnd = matchPos + text.length;
        const affectedSegments = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSegment = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSegment = Math.min(mapping.segmentText.length, matchEnd - mapping.startInVirtual);

                affectedSegments.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSegment,
                    endInSegment
                });
            }
        });

        // 对每个涉及的段落进行高亮
        affectedSegments.forEach(segment => {
            const paragraph = translationDiv.querySelector(`p[data-index="${segment.sourceIndex}"]`);
            if (!paragraph) return;

            // 使用highlightRangeDirectly的逻辑来处理跨node的高亮
            const range = this._createRangeInParagraph(paragraph, segment.startInSegment, segment.endInSegment);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * 在给定段落中创建一个Range对象
     * @private
     */
    _createRangeInParagraph(paragraph, startOffset, endOffset) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        if (textNodes.length === 0) return null;

        // 找到起始和结束节点
        let currentPos = 0;
        let startNode = null;
        let startNodeOffset = 0;
        let endNode = null;
        let endNodeOffset = 0;

        for (let i = 0; i < textNodes.length; i++) {
            const nodeLength = textNodes[i].textContent.length;

            if (currentPos <= startOffset && startOffset < currentPos + nodeLength && !startNode) {
                startNode = textNodes[i];
                startNodeOffset = startOffset - currentPos;
            }

            if (currentPos <= endOffset && endOffset <= currentPos + nodeLength) {
                endNode = textNodes[i];
                endNodeOffset = endOffset - currentPos;
                break;
            }

            currentPos += nodeLength;
        }

        if (!startNode || !endNode) return null;

        const range = document.createRange();
        try {
            range.setStart(startNode, startNodeOffset);
            range.setEnd(endNode, endNodeOffset);
            return range;
        } catch (e) {
            return null;
        }
    }

    /**
     * 基于文本搜索在翻译中进行高亮（降级方法）
     * @private
     */
    _highlightInTranslationBySearch(translationDiv, text, highlightId) {
        const translationData = this.translationManager.getTranslationData();
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        // 获取每个段落对应的翻译文本
        const translationTexts = sortedKeys.map(key => {
            const translation = translationData[key];
            return translation ? translation.trim() : "";
        });

        // 构建虚拟全文
        let virtualFullText = translationTexts.join(" ");

        // 建立位置映射
        const textPositionMap = [];
        let currentPos = 0;
        translationTexts.forEach((translationText, idx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + translationText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: idx,
                translationText
            });
            currentPos = endInVirtual + 1;
        });

        // 在虚拟全文中搜索
        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const matchEnd = matchPos + text.length;

        // 根据虚拟位置找到涉及的翻译段落
        const affectedSources = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSource = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSource = Math.min(mapping.translationText.length, matchEnd - mapping.startInVirtual);

                affectedSources.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSource,
                    endInSource
                });
            }
        });

        // 在DOM中找到这些段落，并进行高亮
        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = translationDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            // 获取段落中的Range并进行高亮
            const range = this._createRangeInParagraph(paragraph, source.startInSource, source.endInSource);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * 高亮text node的某一部分
     * @private
     */
    _highlightNodePortion(textNode, startIdx, endIdx, highlightId) {
        const nodeText = textNode.textContent;
        if (startIdx < 0 || endIdx > nodeText.length || startIdx >= endIdx) return;

        const beforeText = nodeText.substring(0, startIdx);
        const highlightText = nodeText.substring(startIdx, endIdx);
        const afterText = nodeText.substring(endIdx);

        const span = document.createElement("span");
        span.className = "text-highlight";
        span.setAttribute("data-highlight-id", highlightId);
        span.textContent = highlightText;

        // 创建节点（空字符串不创建对应的节点）
        const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        const afterNode = afterText ? document.createTextNode(afterText) : null;

        // 按正确的顺序插入：在textNode之前insert所有新节点，然后删除textNode
        if (beforeNode) {
            textNode.parentNode.insertBefore(beforeNode, textNode);
        }
        textNode.parentNode.insertBefore(span, textNode);
        if (afterNode) {
            textNode.parentNode.insertBefore(afterNode, textNode);
        }
        textNode.parentNode.removeChild(textNode);
    }

    /**
     * 移除高亮显示（从原文和翻译区都移除）
     * @param {string} text - 要移除高亮的文本
     */
    removeHighlightFromTranscript(text) {
        if (!text) return;

        // 通过ID来删除对应的高亮
        if (this.highlightIdMap && this.highlightIdMap[text]) {
            const highlightId = this.highlightIdMap[text];

            this.removeHighlightMarkupById(highlightId);

            // 删除ID映射
            delete this.highlightIdMap[text];

            // 删除位置信息
            if (this.highlightPositions && this.highlightPositions[text]) {
                delete this.highlightPositions[text];
            }

            // 更新session中保存的位置信息
            if (this.sessionManager) {
                this.sessionManager.updateHighlightPositions(this.highlightPositions);
            }
        }
    }

    /**
     * 从highlights列表中移除高亮（同时更新DOM和显示）
     * @param {string} text - 要移除的高亮文本
     */
    removeHighlightFromList(text) {
        if (!text || !this.keywordManager) return false;

        // 检查该项是否在highlights中
        const index = this.keywordManager.highlights.indexOf(text);
        if (index === -1) return false;

        // 从highlights数组中移除
        this.keywordManager.highlights.splice(index, 1);

        // 从DOM中移除高亮标记
        this.removeHighlightFromTranscript(text);

        // 更新所有显示
        this.keywordManager.updateAllKeywordDisplays();

        // 保存到session
        this.sessionManager?.updateCurrentHighlights(this.keywordManager.highlights);

        // 如果解释面板打开了同一个词，更新高亮按钮状态（改为"Highlight"）
        this.updateExplanationPanelHighlightButtonAfterRemoval(text);

        return true;
    }

    /**
     * 删除高亮后更新解释面板按钮状态（改为"Highlight"）
     * @param {string} removedWord - 刚删除的高亮词
     */
    updateExplanationPanelHighlightButtonAfterRemoval(removedWord) {
        // 获取当前打开的解释词
        const currentWordEl = document.getElementById("current-explanation-word");
        if (!currentWordEl) return;

        const currentWord = currentWordEl.textContent?.trim();
        if (!currentWord) return;

        // 检查是否是同一个词（不区分大小写比较）
        if (currentWord.toLowerCase() === removedWord.toLowerCase()) {
            // 调用全局的updateHighlightButtonState方法来更新按钮状态
            if (window.streamNoteInstance && window.streamNoteInstance.updateHighlightButtonState) {
                window.streamNoteInstance.updateHighlightButtonState(removedWord, false);
            }
        }
    }

    /**
     * 切换高亮状态（添加或移除）
     * @param {string} text - 要切换的文本
     * @returns {boolean} 返回切换后的状态（true=现在已高亮, false=已移除高亮）
     */
    toggleHighlight(text) {
        if (!text || !this.keywordManager) return false;

        // 对输入文本进行相同的清理处理，确保与highlights中的内容匹配
        const cleanedText = this.normalizeHighlightText(text);

        if (!cleanedText) return false;

        const isHighlighted = this.keywordManager.highlights.includes(cleanedText);

        if (isHighlighted) {
            this.removeHighlightFromList(cleanedText);
            this.onStatusMessage(`✓ Removed "${cleanedText}" from highlights`, 1500);
            return false;
        } else {
            this.addSelectedTextAsHighlight(cleanedText);
            return true;
        }
    }

    /**
     * 合并相邻的text nodes
     * @param {HTMLElement} element - 容器元素
     */
    mergeAdjacentTextNodes(element) {
        let merged = true;
        while (merged) {
            merged = false;
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                if (node.nextSibling && node.nextSibling.nodeType === Node.TEXT_NODE) {
                    node.textContent += node.nextSibling.textContent;
                    node.parentNode.removeChild(node.nextSibling);
                    merged = true;
                    break;
                }
            }
        }
    }

    /**
     * 重新应用所有高亮
     */
    reapplyAllHighlights() {
        if (!this.keywordManager) return;

        // 清除所有现有的高亮（原文和翻译）
        const transcriptDiv = document.getElementById("transcript");
        const translationDiv = document.getElementById("translation");

        if (transcriptDiv) {
            const highlights = transcriptDiv.querySelectorAll(".text-highlight");
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(transcriptDiv);
        }

        if (translationDiv) {
            const highlights = translationDiv.querySelectorAll(".text-highlight");
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(translationDiv);
        }

        // 生成缺失的ID
        this.keywordManager.highlights.forEach(text => {
            if (!this.highlightIdMap[text]) {
                this.highlightIdMap[text] = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
            }
        });

        // 重新应用所有高亮词的高亮（在原文和翻译）
        this.keywordManager.highlights.forEach(text => {
            this.highlightTextInTranscript(text, this.highlightIdMap[text]);
            this.highlightTextInTranslation(text, this.highlightIdMap[text]);
        });
    }

    /**
     * 设置高亮ID映射（用于恢复session）
     */
    setHighlightIdMap(map) {
        this.highlightIdMap = { ...map };
    }

    /**
     * 清除所有临时高亮
     */
    clearTemporaryHighlight() {
        if (!this.currentTemporaryWord) return;

        const word = this.currentTemporaryWord;
        const tempInfo = this.temporaryHighlights[word];

        if (tempInfo && tempInfo.highlightId) {
            const tempId = tempInfo.highlightId;
            this.removeHighlightMarkupById(tempId);
        }

        delete this.temporaryHighlights[word];
        this.currentTemporaryWord = null;
    }

    /**
     * 将临时高亮转换为永久高亮
     * @param {string} word - 要保存的词
     * @returns {boolean} 是否成功
     */
    commitTemporaryHighlight(word) {
        if (!word) return false;

        const cleanedWord = this.normalizeHighlightText(word);

        if (!cleanedWord) return false;

        // 检查是否有临时高亮
        const tempInfo = this.temporaryHighlights[cleanedWord];
        if (!tempInfo) return false;

        // 检查是否已在永久列表中
        if (this.keywordManager?.highlights.includes(cleanedWord)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return false;
        }

        // 生成永久高亮ID
        const permanentHighlightId = this.generateHighlightId();

        // 替换高亮ID（从临时改为永久）并改变样式
        const tempId = tempInfo.highlightId;
        const positionInfo = tempInfo.positionInfo;

        // 在原文中替换ID和className
        const transcriptDiv = document.getElementById("transcript");
        if (transcriptDiv) {
            const tempSpans = transcriptDiv.querySelectorAll(`[data-highlight-id="${tempId}"]`);
            tempSpans.forEach(span => {
                span.setAttribute("data-highlight-id", permanentHighlightId);
                span.className = "text-highlight";  // 改为永久高亮样式
            });
        }

        // 在翻译中替换ID和className
        const translationDiv = document.getElementById("translation");
        if (translationDiv) {
            const tempSpans = translationDiv.querySelectorAll(`[data-highlight-id="${tempId}"]`);
            tempSpans.forEach(span => {
                span.setAttribute("data-highlight-id", permanentHighlightId);
                span.className = "text-highlight";  // 改为永久高亮样式
            });
        }

        // 添加到永久列表
        if (this.keywordManager) {
            this.keywordManager.highlights.push(cleanedWord);
        }

        // 保存高亮ID映射和位置信息
        this.highlightIdMap[cleanedWord] = permanentHighlightId;
        this.highlightPositions[cleanedWord] = positionInfo;

        // 同时更新keywordManager中的highlightPositions
        if (this.keywordManager?.setHighlightPositions) {
            this.keywordManager.setHighlightPositions(this.highlightPositions);
        }

        // 清无临时数据
        delete this.temporaryHighlights[cleanedWord];
        this.currentTemporaryWord = null;

        // 更新显示和保存
        if (this.keywordManager && this.sessionManager) {
            this.persistHighlightState();
        } else {
            if (this.keywordManager) {
                this.keywordManager.updateAllKeywordDisplays();
            }
            this.sessionManager?.updateCurrentHighlights(this.keywordManager?.highlights || []);
            this.sessionManager?.updateCurrentKeywords(this.keywordManager?.extracts || []);
            if (this.sessionManager) {
                this.sessionManager.updateHighlightPositions(this.highlightPositions);
            }
        }

        this.onStatusMessage(`✓ Highlighted "${cleanedWord}"`, 1500);

        // 更新解释面板上的高亮按钮状态
        this.updateExplanationPanelHighlightButton(cleanedWord);

        return true;
    }
}
